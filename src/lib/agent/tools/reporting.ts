import { z } from "zod"

import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/** Whole-of-business reporting. Staff only. */

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function buildReportingTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    businessSnapshot: defineTool({
      description:
        "Today's operating picture: orders, revenue, overdue receivables, stockouts and orders awaiting action. Use for 'how are we doing' style questions.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date()
        const dayStart = startOfDay(now)
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

        const [todayOrders, monthOrders, overdue, stockouts, awaiting] = await Promise.all([
          db.salesOrder.findMany({
            where: { createdAt: { gte: dayStart } },
            select: { totalAmount: true },
          }),
          db.salesOrder.findMany({
            where: { createdAt: { gte: monthStart }, status: { not: "cancelled" } },
            select: { totalAmount: true },
          }),
          db.invoice.findMany({
            where: { status: { not: "paid" }, dueDate: { lt: now } },
            select: { outstandingAmt: true, customer: { select: { name: true } } },
          }),
          db.inventory.findMany({
            where: { quantity: { lte: 0 } },
            select: { product: { select: { name: true } } },
            take: 10,
          }),
          db.salesOrder.count({ where: { status: { in: ["draft", "confirmed"] } } }),
        ])

        const sum = (rows: Array<{ totalAmount: number }>) =>
          money(rows.reduce((total, row) => total + row.totalAmount, 0))

        return {
          ordersToday: todayOrders.length,
          revenueToday: sum(todayOrders),
          ordersThisMonth: monthOrders.length,
          revenueThisMonth: sum(monthOrders),
          overdueInvoices: overdue.length,
          overdueValue: money(overdue.reduce((total, row) => total + row.outstandingAmt, 0)),
          worstPayers: overdue.slice(0, 5).map((row) => row.customer?.name).filter(Boolean),
          stockouts: stockouts.map((row) => row.product?.name).filter(Boolean),
          ordersAwaitingAction: awaiting,
        }
      },
    }),

    salesReport: defineTool({
      description:
        "Sales over a period, broken down by customer or product. Use for 'who are our biggest customers' and 'what sells' questions.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(730).optional().describe("Look-back window, default 30"),
        groupBy: z.enum(["customer", "product", "channel"]).optional(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ days: windowDays, groupBy, limit }) => {
        const since = new Date(Date.now() - (windowDays ?? 30) * 86400000)

        const orders = await db.salesOrder.findMany({
          where: { orderDate: { gte: since }, status: { not: "cancelled" } },
          select: {
            totalAmount: true,
            sourceChannel: true,
            customer: { select: { id: true, name: true } },
            items: {
              select: {
                quantity: true,
                total: true,
                product: { select: { id: true, name: true, sku: true } },
              },
            },
          },
        })

        const revenue = money(orders.reduce((sum, order) => sum + order.totalAmount, 0))
        const grouping = groupBy || "customer"
        const buckets = new Map<string, { label: string; revenue: number; count: number }>()

        for (const order of orders) {
          if (grouping === "product") {
            for (const item of order.items) {
              const key = item.product?.id || "unknown"
              const bucket = buckets.get(key) || {
                label: item.product?.name || "Unknown",
                revenue: 0,
                count: 0,
              }
              bucket.revenue = money(bucket.revenue + item.total)
              bucket.count += item.quantity
              buckets.set(key, bucket)
            }
            continue
          }

          const key =
            grouping === "channel"
              ? order.sourceChannel || "unknown"
              : order.customer?.id || "unknown"
          const label =
            grouping === "channel"
              ? order.sourceChannel || "unknown"
              : order.customer?.name || "Unknown"

          const bucket = buckets.get(key) || { label, revenue: 0, count: 0 }
          bucket.revenue = money(bucket.revenue + order.totalAmount)
          bucket.count += 1
          buckets.set(key, bucket)
        }

        return {
          windowDays: windowDays ?? 30,
          orderCount: orders.length,
          revenue,
          averageOrderValue: orders.length ? money(revenue / orders.length) : 0,
          groupedBy: grouping,
          breakdown: [...buckets.entries()]
            .map(([id, bucket]) => ({ id, ...bucket }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, limit ?? 10),
        }
      },
    }),
  }
}
