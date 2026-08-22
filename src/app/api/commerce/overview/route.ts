import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import {
  COMMERCE_CHANNEL_LABELS,
  isCustomerChannel,
  normalizeCommerceChannel,
} from "@/lib/commerce"

export async function GET() {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [orders, customers, settings] = await Promise.all([
      db.salesOrder.findMany({
        where: {
          OR: [{ sourceChannel: "customer_web" }, { sourceChannel: "customer_app" }],
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          items: {
            select: {
              id: true,
              quantity: true,
            },
          },
          statusLogs: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
        },
        orderBy: { orderDate: "desc" },
      }),
      db.customer.findMany({
        where: {
          OR: [
            { sessions: { some: {} } },
            { cartItems: { some: {} } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          updatedAt: true,
        },
      }),
      db.commerceSettings.findFirst({
        orderBy: { createdAt: "asc" },
      }),
    ])

    const last30DaysOrders = orders.filter((order) => new Date(order.orderDate) >= thirtyDaysAgo)
    const overview = {
      totalCustomerOrders: orders.length,
      last30DaysOrders: last30DaysOrders.length,
      customerRevenue: orders.reduce((sum, order) => sum + order.totalAmount, 0),
      last30DaysRevenue: last30DaysOrders.reduce((sum, order) => sum + order.totalAmount, 0),
      activeChannels: [
        settings?.websiteEnabled ? "customer_web" : null,
        settings?.mobileAppEnabled ? "customer_app" : null,
      ].filter(Boolean),
      channelBreakdown: ["customer_web", "customer_app"].map((channel) => {
        const channelOrders = orders.filter((order) => normalizeCommerceChannel(order.sourceChannel) === channel)
        return {
          channel,
          label: COMMERCE_CHANNEL_LABELS[channel as "customer_web" | "customer_app"],
          orders: channelOrders.length,
          revenue: channelOrders.reduce((sum, order) => sum + order.totalAmount, 0),
        }
      }),
      statusBreakdown: Array.from(
        orders.reduce((map, order) => {
          map.set(order.status, (map.get(order.status) || 0) + 1)
          return map
        }, new Map<string, number>())
      ).map(([status, count]) => ({ status, count })),
      liveCustomers: customers.length,
    }

    return NextResponse.json({
      success: true,
      data: {
        overview,
        settings,
        orders: orders.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          sourceChannel: normalizeCommerceChannel(order.sourceChannel),
          customerName: order.customer.name,
          customerEmail: order.customer.email,
          totalAmount: order.totalAmount,
          status: order.status,
          orderDate: order.orderDate,
          itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          latestStatusNote: order.statusLogs[0]?.notes || null,
          isCustomerOrder: isCustomerChannel(order.sourceChannel),
        })),
      },
    })
  } catch (error) {
    console.error("Error fetching commerce overview:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch commerce overview" },
      { status: 500 }
    )
  }
}
