import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"

// GET /api/products/[id] - Get a single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params
    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: true,
        inventory: {
          include: {
            warehouse: {
              select: { id: true, name: true, code: true }
            },
          },
        },
      },
    })

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      )
    }

    // Calculate total stock
    const totalStock = product.inventory.reduce(
      (sum, inv) => sum + inv.quantity,
      0
    )
    const totalReserved = product.inventory.reduce(
      (sum, inv) => sum + inv.reserved,
      0
    )

    return NextResponse.json({
      success: true,
      data: { ...product, totalStock, totalReserved },
    })
  } catch (error) {
    console.error("Error fetching product:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch product" },
      { status: 500 }
    )
  }
}

// PUT /api/products/[id] - Update a product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params
    const body = await request.json()
    const {
      sku, name, description, categoryId, brand,
      baseUnit, packSize, packUnit,
      costPrice, wholesalePrice, retailPrice, minMargin,
      gstRate, gstExempt, barcode, status,
      imageUrl,
      variants
    } = body

    // Check if product exists
    const existingProduct = await db.product.findUnique({
      where: { id },
      include: { variants: true }
    })

    if (!existingProduct) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      )
    }

    // If SKU is being changed, check if it conflicts
    if (sku && sku !== existingProduct.sku) {
      const skuConflict = await db.product.findUnique({
        where: { sku },
      })
      if (skuConflict) {
        return NextResponse.json(
          { success: false, error: "Product with this SKU already exists" },
          { status: 400 }
        )
      }
    }

    const product = await db.$transaction(async (tx) => {
      // 1. Update base product
      const updated = await tx.product.update({
        where: { id },
        data: {
          sku: sku || existingProduct.sku,
          name: name || existingProduct.name,
          description: description ?? existingProduct.description,
          categoryId: categoryId !== undefined ? categoryId : existingProduct.categoryId,
          brand: brand ?? existingProduct.brand,
          baseUnit: baseUnit || existingProduct.baseUnit,
          packSize: packSize !== undefined ? parseInt(packSize) : existingProduct.packSize,
          packUnit: packUnit ?? existingProduct.packUnit,
          costPrice: costPrice !== undefined ? parseFloat(costPrice) : existingProduct.costPrice,
          wholesalePrice: wholesalePrice !== undefined ? parseFloat(wholesalePrice) : existingProduct.wholesalePrice,
          retailPrice: retailPrice !== undefined ? (retailPrice ? parseFloat(retailPrice) : null) : existingProduct.retailPrice,
          minMargin: minMargin !== undefined ? parseFloat(minMargin) : existingProduct.minMargin,
          gstRate: gstRate !== undefined ? parseFloat(gstRate) : existingProduct.gstRate,
          gstExempt: gstExempt !== undefined ? gstExempt : existingProduct.gstExempt,
          barcode: barcode ?? existingProduct.barcode,
          imageUrl: imageUrl !== undefined ? imageUrl || null : existingProduct.imageUrl,
          status: status || existingProduct.status,
        },
      })

      // 2. Handle variants if provided
      if (variants && Array.isArray(variants)) {
        // Simple approach: delete existing variants not in the new list, upsert others
        // For production, we might want to be more careful with inventory links
        const variantSkus = variants.map(v => v.sku)

        // Delete variants that are no longer present
        await tx.productVariant.deleteMany({
          where: {
            productId: id,
            sku: { notIn: variantSkus }
          }
        })

        // Upsert remaining variants
        for (const v of variants) {
          await tx.productVariant.upsert({
            where: { sku: v.sku },
            update: {
              name: v.name,
              attributes: v.attributes ? (typeof v.attributes === 'string' ? v.attributes : JSON.stringify(v.attributes)) : null,
              barcode: v.barcode,
              costPrice: v.costPrice ? parseFloat(v.costPrice) : null,
              wholesalePrice: v.wholesalePrice ? parseFloat(v.wholesalePrice) : null,
              retailPrice: v.retailPrice ? parseFloat(v.retailPrice) : null,
              status: v.status || "active",
            },
            create: {
              productId: id,
              sku: v.sku,
              name: v.name,
              attributes: v.attributes ? (typeof v.attributes === 'string' ? v.attributes : JSON.stringify(v.attributes)) : null,
              barcode: v.barcode,
              costPrice: v.costPrice ? parseFloat(v.costPrice) : null,
              wholesalePrice: v.wholesalePrice ? parseFloat(v.wholesalePrice) : null,
              retailPrice: v.retailPrice ? parseFloat(v.retailPrice) : null,
              status: v.status || "active",
            }
          })
        }
      }

      return updated
    })

    return NextResponse.json({ success: true, data: product })
  } catch (error) {
    console.error("Error updating product:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update product" },
      { status: 500 }
    )
  }
}

// DELETE /api/products/[id] - Delete a product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params

    // Check if product exists
    const product = await db.product.findUnique({
      where: { id },
      include: {
        inventory: true,
        orderItems: true,
      },
    })

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found" },
        { status: 404 }
      )
    }

    // Check if product has order items
    if (product.orderItems.length > 0) {
      return NextResponse.json(
        { success: false, error: "Cannot delete product with associated orders" },
        { status: 400 }
      )
    }

    // Stock on hand cannot be deleted away. This previously ran
    // `inventory.deleteMany` unconditionally, so a product with 400 cartons in
    // the freezer vanished from inventory with no StockMovement recording where
    // it went. Write it off explicitly instead, or move it first.
    const onHand = await db.inventory.findMany({
      where: { productId: id },
      select: { quantity: true, warehouse: { select: { name: true } } },
    })

    const remaining = onHand.reduce((sum, row) => sum + row.quantity, 0)

    if (remaining > 0) {
      const where = onHand
        .filter((row) => row.quantity > 0)
        .map((row) => `${row.quantity} at ${row.warehouse.name}`)
        .join(", ")

      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete a product with stock on hand (${where}). Write it off or transfer it first.`,
        },
        { status: 400 }
      )
    }

    // Only empty rows remain, so nothing is lost.
    await db.inventory.deleteMany({
      where: { productId: id },
    })

    // Delete the product
    await db.product.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting product:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete product" },
      { status: 500 }
    )
  }
}
