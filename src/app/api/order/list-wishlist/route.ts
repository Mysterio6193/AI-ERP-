import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"
import { db } from "@/lib/db"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const wishlists = await db.customerWishlist.findMany({
      where: { customerId: customer.id },
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { updatedAt: "desc" },
    })

    return customerJson(request, {
      success: true,
      message: "Wishlist fetched successfully.",
      data: wishlists.map((wishlist) => ({
        id: wishlist.id,
        name: wishlist.name,
        visibility: wishlist.visibility,
        items_count: wishlist._count.items,
        updated_at: wishlist.updatedAt,
      })),
    })
  } catch (error) {
    console.error("List wishlist error:", error)
    return customerError(request, "Failed to fetch wishlists.", 500)
  }
}
