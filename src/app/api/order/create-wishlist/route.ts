import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"
import { db } from "@/lib/db"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const body = await request.json()
    const name = String(body.name || "").trim()
    if (!name) {
      return customerError(request, "Wishlist name is required.", 400)
    }

    const wishlist = await db.customerWishlist.create({
      data: {
        customerId: customer.id,
        name,
      },
      include: {
        _count: { select: { items: true } },
      },
    })

    return customerJson(request, {
      success: true,
      message: "Wishlist created successfully.",
      data: {
        id: wishlist.id,
        name: wishlist.name,
        visibility: wishlist.visibility,
        items_count: wishlist._count.items,
        updated_at: wishlist.updatedAt,
      },
    })
  } catch (error) {
    console.error("Create wishlist error:", error)
    return customerError(request, "Failed to create wishlist.", 500)
  }
}
