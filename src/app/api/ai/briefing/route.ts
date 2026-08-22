import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { findLapsedAccounts, getFocusList, summarisePipeline } from "@/lib/crm"
import { db } from "@/lib/db"

/**
 * The signal set behind the dashboard.
 *
 * Every number here is computed from the database, not inferred by a model.
 * The agent's job on this screen is to explain what the numbers mean and what
 * to do about them - never to invent them. That split is what makes the
 * narrative trustworthy: you can always check it against the cards beside it.
 */

function round(value: number) {
  return Number(value.toFixed(2))
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  try {
    const [
      todayOrders,
      monthOrders,
      lastMonthOrders,
      overdue,
      lowStock,
      awaiting,
      focus,
      lapsed,
      pipeline,
      openCases,
      recentAgentRuns,
    ] = await Promise.all([
      db.salesOrder.findMany({
        where: { createdAt: { gte: dayStart } },
        select: { totalAmount: true },
      }),
      db.salesOrder.findMany({
        where: { createdAt: { gte: monthStart }, status: { not: "cancelled" } },
        select: { totalAmount: true },
      }),
      db.salesOrder.findMany({
        where: {
          createdAt: { gte: lastMonthStart, lt: monthStart },
          status: { not: "cancelled" },
        },
        select: { totalAmount: true, createdAt: true },
      }),
      db.invoice.findMany({
        where: { status: { not: "paid" }, dueDate: { lt: now } },
        select: {
          outstandingAmt: true,
          dueDate: true,
          invoiceNumber: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      db.inventory.findMany({
        select: {
          quantity: true,
          reserved: true,
          reorderLevel: true,
          product: { select: { id: true, name: true, sku: true } },
        },
      }),
      db.salesOrder.count({ where: { status: { in: ["draft", "confirmed"] } } }),
      getFocusList(),
      findLapsedAccounts({ limit: 8 }),
      summarisePipeline(),
      db.case.count({ where: { status: { in: ["open", "in_progress"] } } }),
      db.agentRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 5,
        select: {
          id: true,
          persona: true,
          trigger: true,
          channel: true,
          status: true,
          startedAt: true,
        },
      }),
    ])

    const sum = (rows: Array<{ totalAmount: number }>) =>
      round(rows.reduce((total, row) => total + row.totalAmount, 0))

    const monthRevenue = sum(monthOrders)
    const lastMonthRevenue = sum(lastMonthOrders)

    // Compare like for like: only last month's orders up to the same day number,
    // so a month-to-date figure is never measured against a full month.
    const dayOfMonth = now.getDate()
    const lastMonthToDate = round(
      lastMonthOrders
        .filter((order) => order.createdAt.getDate() <= dayOfMonth)
        .reduce((total, row) => total + row.totalAmount, 0)
    )

    const belowReorder = lowStock.filter(
      (row) => row.quantity - row.reserved <= row.reorderLevel
    )

    return NextResponse.json({
      success: true,
      data: {
        generatedAt: now.toISOString(),
        sales: {
          ordersToday: todayOrders.length,
          revenueToday: sum(todayOrders),
          ordersThisMonth: monthOrders.length,
          revenueThisMonth: monthRevenue,
          revenueLastMonth: lastMonthRevenue,
          revenueLastMonthToDate: lastMonthToDate,
          ordersAwaitingAction: awaiting,
        },
        receivables: {
          overdueCount: overdue.length,
          overdueValue: round(overdue.reduce((total, row) => total + row.outstandingAmt, 0)),
          worst: overdue
            .sort((a, b) => b.outstandingAmt - a.outstandingAmt)
            .slice(0, 5)
            .map((invoice) => ({
              invoiceNumber: invoice.invoiceNumber,
              customer: invoice.customer?.name,
              customerId: invoice.customer?.id,
              outstanding: round(invoice.outstandingAmt),
              daysOverdue: Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86400000),
            })),
        },
        stock: {
          belowReorderCount: belowReorder.length,
          outOfStockCount: lowStock.filter((row) => row.quantity - row.reserved <= 0).length,
          items: belowReorder.slice(0, 5).map((row) => ({
            product: row.product?.name,
            sku: row.product?.sku,
            available: row.quantity - row.reserved,
            reorderLevel: row.reorderLevel,
          })),
        },
        customers: {
          lapsingCount: lapsed.length,
          valueAtRisk: round(lapsed.reduce((total, row) => total + row.monthlyValueAtRisk, 0)),
          lapsing: lapsed.slice(0, 5),
        },
        pipeline: {
          openCount: pipeline.totalCount,
          totalValue: pipeline.totalValue,
          weightedValue: pipeline.weightedValue,
        },
        service: { openCases },
        focus: focus.slice(0, 8),
        agent: { recentRuns: recentAgentRuns },
      },
    })
  } catch (error) {
    console.error("Briefing failed:", error)
    return NextResponse.json({ success: false, error: "Failed to build briefing" }, { status: 500 })
  }
}
