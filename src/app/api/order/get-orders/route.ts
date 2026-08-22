import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions, mapOrder } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const { searchParams } = new URL(request.url)
    const status = (searchParams.get("status") || "").trim().toLowerCase()
    const search = (searchParams.get("search") || "").trim().toLowerCase()
    const page = Math.max(1, Number(searchParams.get("page") || 1))
    const pageSize = Math.max(1, Number(searchParams.get("page_size") || 10))

    const orders = await db.salesOrder.findMany({
      where: { customerId: customer.id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        invoice: true,
      },
      orderBy: { orderDate: "desc" },
    })

    const mappedOrders = orders.map(mapOrder).filter((order) => {
      const matchesStatus = !status || order.status.toLowerCase() === status
      const matchesSearch =
        !search ||
        order.id.toLowerCase().includes(search) ||
        order.items.some((item) => item.toLowerCase().includes(search))
      return matchesStatus && matchesSearch
    })

    const start = (page - 1) * pageSize
    const results = mappedOrders.slice(start, start + pageSize)

    return customerJson(request, {
      success: true,
      message: "Orders fetched successfully.",
      data: {
        count: mappedOrders.length,
        results,
      },
    })
  } catch (error) {
    console.error("Customer orders error:", error)
    return customerError(request, "Failed to fetch orders.", 500)
  }
}
