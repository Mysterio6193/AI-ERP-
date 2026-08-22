import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"
import { db } from "@/lib/db"

function parseVariantId(rawId?: string | null) {
  const value = String(rawId || "").trim()
  if (!value) return { productId: null as string | null, variantId: null as string | null }
  if (value.startsWith("base:")) {
    return { productId: value.replace(/^base:/, ""), variantId: null }
  }
  return { productId: null, variantId: value }
}

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
    const wishlistId = String(body.wishlist_id || "").trim()
    const quantity = Math.max(0, Number(body.quantity || 0))
    const { productId: baseProductId, variantId } = parseVariantId(body.product_variant_id)

    if (!wishlistId || (!baseProductId && !variantId)) {
      return customerError(request, "Wishlist and product are required.", 400)
    }

    const wishlist = await db.customerWishlist.findFirst({
      where: { id: wishlistId, customerId: customer.id },
    })
    if (!wishlist) {
      return customerError(request, "Wishlist not found.", 404)
    }

    const variant = variantId ? await db.productVariant.findUnique({ where: { id: variantId } }) : null
    const productId = baseProductId || variant?.productId || null
    if (!productId) {
      return customerError(request, "Product not found.", 404)
    }

    if (quantity <= 0) {
      await db.wishlistItem.deleteMany({
        where: {
          wishlistId,
          productId,
          variantId: variant?.id || null,
        },
      })

      return customerJson(request, {
        success: true,
        message: "Wishlist item removed successfully.",
        data: null,
      })
    }

    const existing = await db.wishlistItem.findFirst({
      where: {
        wishlistId,
        productId,
        variantId: variant?.id || null,
      },
    })

    const item = existing
      ? await db.wishlistItem.update({
          where: { id: existing.id },
          data: { quantity },
        })
      : await db.wishlistItem.create({
          data: {
            wishlistId,
            productId,
            variantId: variant?.id || null,
            quantity,
          },
        })

    return customerJson(request, {
      success: true,
      message: "Quantity updated successfully.",
      data: item,
    })
  } catch (error) {
    console.error("Update wishlist quantity error:", error)
    return customerError(request, "Failed to update wishlist quantity.", 500)
  }
}
