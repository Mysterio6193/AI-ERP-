import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions, resolveCustomerAssetUrl } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"
import { db } from "@/lib/db"

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

    const wishlistId = new URL(request.url).searchParams.get("wishlist_id") || ""
    const wishlist = await db.customerWishlist.findFirst({
      where: { id: wishlistId, customerId: customer.id },
      include: {
        items: {
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
        },
      },
    })

    if (!wishlist) {
      return customerError(request, "Wishlist not found.", 404)
    }

    const grouped = new Map<string, Array<unknown>>()
    for (const item of wishlist.items) {
      const categoryName = item.product.category?.name || "Uncategorized"
      const availableInventoryQuantity = item.product.inventory.reduce((sum, row) => sum + row.quantity, 0)
      const variantId = item.variant?.id || `base:${item.product.id}`
      const variantName = item.variant?.name || item.product.packUnit || item.product.baseUnit
      const unitValue = item.variant?.wholesalePrice ?? item.product.wholesalePrice

      const productPayload = {
        id: item.id,
        wishlist_quantity: item.quantity,
        product: {
          id: item.product.id,
          name: item.product.name,
          image_url: resolveCustomerAssetUrl(item.product.imageUrl, assetBaseUrl),
          variant: [
            {
              id: variantId,
              unit: variantName,
              unit_value: unitValue,
              available_inventory_quantity: availableInventoryQuantity,
            },
          ],
        },
      }

      grouped.set(categoryName, [...(grouped.get(categoryName) || []), productPayload])
    }

    return customerJson(request, {
      success: true,
      message: "Wishlist fetched successfully.",
      data: Array.from(grouped.entries()).map(([category, products]) => ({
        category,
        products,
      })),
    })
  } catch (error) {
    console.error("Get wishlist items error:", error)
    return customerError(request, "Failed to fetch wishlist items.", 500)
  }
}
