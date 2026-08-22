import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales"])
    if (auth.response) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""

    const wishlists = await db.customerWishlist.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { customer: { name: { contains: search, mode: "insensitive" } } },
              { customer: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : undefined,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            creditLimit: true,
            status: true,
          },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({
      success: true,
      data: wishlists.map((wishlist) => ({
        id: wishlist.id,
        name: wishlist.name,
        visibility: wishlist.visibility,
        updatedAt: wishlist.updatedAt,
        customer: wishlist.customer,
        itemCount: wishlist.items.length,
        items: wishlist.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          productName: item.product.name,
          productSku: item.variant?.sku || item.product.sku,
          variantName: item.variant?.name || null,
        })),
      })),
    })
  } catch (error) {
    console.error("Admin wishlists fetch error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch wishlists" }, { status: 500 })
  }
}
