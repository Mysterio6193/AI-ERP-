import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { getSettings } from "@/lib/settings/service"
import { resolveDefaultTaxRate } from "@/lib/tax"
import { getActiveCompanyId } from "@/lib/active-company"

// GET /api/products - List all products with optional filters
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const category = searchParams.get("category") || ""
    const status = searchParams.get("status") || ""
    const lowStock = searchParams.get("lowStock") === "true"

    const products = await db.product.findMany({
      where: {
        AND: [
          search
            ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { barcode: { contains: search, mode: "insensitive" } },
                { variants: { some: { sku: { contains: search, mode: "insensitive" } } } },
              ],
            }
            : {},
          category ? { categoryId: category } : {},
          status ? { status: status } : {},
        ],
      },
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
      orderBy: { createdAt: "desc" },
    })

    // Calculate total stock for each product
    const productsWithStock = products.map((product) => {
      // Stock from base product inventory
      const baseStock = product.inventory.reduce(
        (sum, inv) => sum + inv.quantity,
        0
      )

      // If product has variants, total stock is sum of variant quantities
      // (Variants also have their own inventory records in this schema)
      const totalStock = baseStock

      const totalReserved = product.inventory.reduce(
        (sum, inv) => sum + inv.reserved,
        0
      )
      const isLowStock = product.inventory.some(
        (inv) => inv.quantity <= inv.reorderLevel
      )
      return {
        ...product,
        totalStock,
        totalReserved,
        isLowStock,
      }
    })

    // Filter by low stock if requested
    const filteredProducts = lowStock
      ? productsWithStock.filter((p) => p.isLowStock)
      : productsWithStock

    return NextResponse.json({ success: true, data: filteredProducts })
  } catch (error) {
    console.error("Error fetching products:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch products" },
      { status: 500 }
    )
  }
}

// POST /api/products - Create a new product
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const body = await request.json()
    const {
      sku, name, description, categoryId, brand,
      baseUnit, packSize, packUnit,
      costPrice, wholesalePrice, retailPrice, minMargin,
      gstRate, gstExempt, barcode, status,
      imageUrl,
      variants // Added variants support
    } = body

    // Check if SKU already exists
    const existingProduct = await db.product.findUnique({
      where: { sku },
    })

    if (existingProduct) {
      return NextResponse.json(
        { success: false, error: "Product with this SKU already exists" },
        { status: 400 }
      )
    }

    const defaultRate = await resolveDefaultTaxRate(
      db,
      await getSettings("tax"),
      await getActiveCompanyId(request).catch(() => null)
    )

    const product = await db.product.create({
      data: {
        sku,
        name,
        description,
        categoryId: categoryId || null,
        brand,
        baseUnit: baseUnit || "each",
        packSize: parseInt(packSize) || 1,
        packUnit,
        costPrice: parseFloat(costPrice) || 0,
        wholesalePrice: parseFloat(wholesalePrice) || 0,
        retailPrice: retailPrice ? parseFloat(retailPrice) : null,
        minMargin: parseFloat(minMargin) || 20,
        // Resolved from settings, then the company's own rate — never a
        // literal. A business on any other rate used to get 10% on every
        // product it created, which then propagated into purchase orders.
        gstRate: gstExempt ? 0 : (parseFloat(gstRate) || defaultRate || 0),
        gstExempt: gstExempt || false,
        barcode,
        imageUrl: imageUrl || null,
        status: status || "active",
        // Create variants if provided
        variants: variants && Array.isArray(variants) ? {
          create: variants
            .filter((v: any) => v.sku && v.sku.trim() !== "")
            .map((v: any) => ({
              sku: v.sku,
              name: v.name,
              attributes: v.attributes ? JSON.stringify(v.attributes) : null,
              barcode: v.barcode,
              costPrice: v.costPrice ? parseFloat(v.costPrice) : null,
              wholesalePrice: v.wholesalePrice ? parseFloat(v.wholesalePrice) : null,
              retailPrice: v.retailPrice ? parseFloat(v.retailPrice) : null,
              status: v.status || "active",
            }))
        } : undefined,
      },
      include: {
        category: true,
        variants: true,
      },
    })

    return NextResponse.json({ success: true, data: product })
  } catch (error) {
    console.error("Error creating product:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create product" },
      { status: 500 }
    )
  }
}
