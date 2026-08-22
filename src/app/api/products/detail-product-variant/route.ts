import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions, mapProductDetail } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    const assetBaseUrl = new URL(request.url).origin
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("product_id")
    if (!productId) {
      return customerError(request, "product_id is required.", 400)
    }

    const product = await db.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        variants: true,
        inventory: true,
      },
    })

    if (!product) {
      return customerError(request, "Product not found.", 404)
    }

    const cartByVariantId = new Map<string, number>()
    for (const item of customer?.cartItems || []) {
      cartByVariantId.set(item.variantId || `base:${item.productId}`, item.quantity)
    }

    return customerJson(request, {
      success: true,
      message: "Product fetched successfully.",
      data: mapProductDetail(product, cartByVariantId, assetBaseUrl),
    })
  } catch (error) {
    console.error("Customer product detail error:", error)
    return customerError(request, "Failed to fetch product.", 500)
  }
}
