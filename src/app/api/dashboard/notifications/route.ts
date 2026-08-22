import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse", "accounts"])
    if (auth.response) {
      return auth.response
    }

    const now = new Date()
    const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [inventory, overdueInvoices, pendingApprovals, latestCommerceOrder] = await Promise.all([
      db.inventory.findMany({
        include: {
          product: {
            select: {
              name: true,
              sku: true,
            },
          },
        },
      }),
      db.invoice.count({
        where: {
          OR: [
            { status: "overdue" },
            {
              status: { in: ["unpaid", "partial"] },
              dueDate: { lt: now },
            },
          ],
        },
      }),
      db.salesOrder.count({
        where: {
          status: "pending_approval",
        },
      }),
      db.salesOrder.findFirst({
        where: {
          createdAt: { gte: lastDay },
          sourceChannel: { in: ["customer_web", "customer_app"] },
          status: {
            notIn: ["draft", "cancelled"],
          },
        },
        orderBy: { createdAt: "desc" },
        include: {
          customer: {
            select: {
              name: true,
            },
          },
        },
      }),
    ])

    const lowStockItems = inventory.filter((item) => item.quantity <= item.reorderLevel)
    const mostUrgentLowStock = lowStockItems
      .sort((left, right) => (right.reorderLevel - right.quantity) - (left.reorderLevel - left.quantity))[0]

    const notifications = [
      lowStockItems.length > 0
        ? {
            id: "low-stock",
            title: "Low stock alert",
            description: mostUrgentLowStock
              ? `${lowStockItems.length} items are below reorder level. ${mostUrgentLowStock.product?.name || mostUrgentLowStock.product?.sku || "A product"} needs attention first.`
              : `${lowStockItems.length} items are below reorder level.`,
            href: "/inventory?lowStock=true",
            tone: "critical" as const,
          }
        : null,
      overdueInvoices > 0
        ? {
            id: "overdue-invoices",
            title: "Receivables overdue",
            description: `${overdueInvoices} customer invoices need follow-up from accounts.`,
            href: "/invoices?status=overdue",
            tone: "warning" as const,
          }
        : null,
      pendingApprovals > 0
        ? {
            id: "pending-approvals",
            title: "Orders pending approval",
            description: `${pendingApprovals} sales orders are waiting for approval before fulfillment can start.`,
            href: "/orders?status=pending_approval",
            tone: "warning" as const,
          }
        : null,
      latestCommerceOrder
        ? {
            id: "latest-commerce-order",
            title: "New commerce order",
            description: `${latestCommerceOrder.orderNumber} came in from ${latestCommerceOrder.sourceChannel === "customer_app" ? "the mobile app" : "the website"} for ${latestCommerceOrder.customer?.name || "a customer"}.`,
            href: `/orders?search=${encodeURIComponent(latestCommerceOrder.orderNumber)}`,
            tone: "info" as const,
          }
        : null,
    ].filter(Boolean)

    return NextResponse.json({
      success: true,
      data: notifications,
    })
  } catch (error) {
    console.error("Error fetching dashboard notifications:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard notifications" },
      { status: 500 }
    )
  }
}
