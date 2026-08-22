import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"
import { db } from "@/lib/db"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function DELETE(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const body = await request.json()
    const wishlistId = String(body.wishlist_id || "").trim()
    if (!wishlistId) {
      return customerError(request, "Wishlist is required.", 400)
    }

    const wishlist = await db.customerWishlist.findFirst({
      where: { id: wishlistId, customerId: customer.id },
    })
    if (!wishlist) {
      return customerError(request, "Wishlist not found.", 404)
    }

    await db.customerWishlist.delete({ where: { id: wishlist.id } })

    return customerJson(request, {
      success: true,
      message: "Wishlist deleted successfully.",
      data: null,
    })
  } catch (error) {
    console.error("Delete wishlist error:", error)
    return customerError(request, "Failed to delete wishlist.", 500)
  }
}
