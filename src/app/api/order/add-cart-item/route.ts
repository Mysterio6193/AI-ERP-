import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { getCustomerOrderBlockReason } from "@/lib/customer-access"
import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

const prisma = db as any

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const orderBlockReason = getCustomerOrderBlockReason(customer)
    if (orderBlockReason) {
      return customerError(request, orderBlockReason, 403)
    }

    const body = await request.json()
    const requestedVariantId = String(body.product_variant_id || "").trim()
    const quantity = Math.max(1, Number(body.quantity || 1))

    let productId = requestedVariantId
    let variantId: string | null = null

    if (requestedVariantId.startsWith("base:")) {
      productId = requestedVariantId.replace(/^base:/, "")
    } else {
      const variant = await prisma.productVariant.findUnique({
        where: { id: requestedVariantId },
        include: { product: true },
      })

      if (!variant) {
        return customerError(request, "Product variant not found.", 404)
      }

      productId = variant.productId
      variantId = variant.id
    }

    const existing = await prisma.customerCartItem.findFirst({
      where: {
        customerId: customer.id,
        productId,
        variantId,
      },
    })

    const cartItem = existing
      ? await prisma.customerCartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + quantity },
        })
      : await prisma.customerCartItem.create({
          data: {
            customerId: customer.id,
            productId,
            variantId,
            quantity,
          },
        })

    const cartCount = await prisma.customerCartItem.aggregate({
      where: { customerId: customer.id },
      _sum: { quantity: true },
    })

    return customerJson(request, {
      success: true,
      message: "Item added to cart successfully.",
      data: cartItem,
      cart_count: cartCount._sum.quantity || 0,
    })
  } catch (error) {
    console.error("Customer add cart error:", error)
    return customerError(request, "Failed to add item to cart.", 500)
  }
}
