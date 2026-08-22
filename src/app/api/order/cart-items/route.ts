import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions, mapCartItem } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

const prisma = db as any

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    const assetBaseUrl = new URL(request.url).origin
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const items = await prisma.customerCartItem.findMany({
      where: { customerId: customer.id },
      include: {
        product: {
          include: {
            category: true,
            inventory: true,
          },
        },
        variant: true,
      },
      orderBy: { createdAt: "desc" },
    })

    return customerJson(request, {
      success: true,
      message: "Cart items fetched successfully.",
      data: items.map((item) => mapCartItem(item, assetBaseUrl)),
    })
  } catch (error) {
    console.error("Customer cart items error:", error)
    return customerError(request, "Failed to fetch cart items.", 500)
  }
}
