import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"
import { db } from "@/lib/db"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function PATCH(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const body = await request.json()
    const wishlistId = String(body.wishlist_id || "").trim()
    const name = String(body.name || "").trim()

    if (!wishlistId || !name) {
      return customerError(request, "Wishlist and name are required.", 400)
    }

    const wishlist = await db.customerWishlist.findFirst({
      where: { id: wishlistId, customerId: customer.id },
    })
    if (!wishlist) {
      return customerError(request, "Wishlist not found.", 404)
    }

    const updated = await db.customerWishlist.update({
      where: { id: wishlist.id },
      data: { name },
    })

    return customerJson(request, {
      success: true,
      message: "Wishlist updated successfully.",
      data: {
        id: updated.id,
        name: updated.name,
        visibility: updated.visibility,
        updated_at: updated.updatedAt,
      },
    })
  } catch (error) {
    console.error("Rename wishlist error:", error)
    return customerError(request, "Failed to update wishlist.", 500)
  }
}
