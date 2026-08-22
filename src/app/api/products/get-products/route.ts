import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerJson, customerError, customerOptions, mapProductSummary } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    const assetBaseUrl = new URL(request.url).origin
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const categoryName = searchParams.get("category_name") || ""
    const page = Number(searchParams.get("page") || 1)
    const pageSize = Number(searchParams.get("page_size") || 10)
    const skip = Math.max(page - 1, 0) * pageSize

    const where = {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        categoryName ? { category: { name: categoryName } } : {},
        { status: "active" },
      ],
    }

    const [count, products] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        include: {
          category: true,
          variants: true,
          inventory: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ])

    const cartByVariantId = new Map<string, number>()
    for (const item of customer?.cartItems || []) {
      cartByVariantId.set(item.variantId || `base:${item.productId}`, item.quantity)
    }

    return customerJson(request, {
      success: true,
      message: "Products fetched successfully.",
      data: {
        count,
        next: skip + pageSize < count ? String(page + 1) : null,
        previous: page > 1 ? String(page - 1) : null,
        results: products.map((product) => mapProductSummary(product, cartByVariantId, assetBaseUrl)),
      },
    })
  } catch (error) {
    console.error("Customer products error:", error)
    return customerError(request, "Failed to fetch products.", 500)
  }
}
