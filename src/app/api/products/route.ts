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

    // Matches the page/pageSize convention already used by src/app/api/crm/route.ts
    // rather than inventing a new one.
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 50, 1), 100)

    const where = {
      AND: [
        search
          ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
              { barcode: { contains: search, mode: "insensitive" as const } },
              { variants: { some: { sku: { contains: search, mode: "insensitive" as const } } } },
            ],
          }
          : {},
        category ? { categoryId: category } : {},
        status ? { status: status } : {},
      ],
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.product.count({ where }),
    ])

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

    // Filter by low stock if requested. Note: this filter runs in-memory on
    // the already-paginated page, so `meta.total`/`pageCount` reflect the
    // unfiltered result set, not the low-stock subset — computing an accurate
    // low-stock total would require comparing two columns at the DB level,
    // which Prisma's `where` can't express without a raw query.
    const filteredProducts = lowStock
      ? productsWithStock.filter((p) => p.isLowStock)
      : productsWithStock

    return NextResponse.json({
      success: true,
      data: filteredProducts,
      meta: { total, page, pageSize, pageCount: Math.ceil(total / pageSize) },
    })
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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request payload" },
        { status: 400 }
      )
    }

    const {
      sku, name, description, categoryId, brand,
      baseUnit, packSize, packUnit,
      costPrice, wholesalePrice, retailPrice, minMargin,
      gstRate, gstExempt, barcode, status,
      imageUrl,
      variants
    } = body

    const trimmedSku = typeof sku === "string" ? sku.trim() : ""
    const trimmedName = typeof name === "string" ? name.trim() : ""

    if (!trimmedSku) {
      return NextResponse.json(
        { success: false, error: "SKU is required" },
        { status: 400 }
      )
    }

    if (!trimmedName) {
      return NextResponse.json(
        { success: false, error: "Product name is required" },
        { status: 400 }
      )
    }

    if (trimmedSku.length > 100) {
      return NextResponse.json(
        { success: false, error: "SKU cannot exceed 100 characters" },
        { status: 400 }
      )
    }

    if (trimmedName.length > 255) {
      return NextResponse.json(
        { success: false, error: "Product name cannot exceed 255 characters" },
        { status: 400 }
      )
    }

    // Check if SKU already exists
    const existingProduct = await db.product.findUnique({
      where: { sku: trimmedSku },
    })

    if (existingProduct) {
      return NextResponse.json(
        { success: false, error: "Product with this SKU already exists" },
        { status: 409 }
      )
    }

    const parsedPackSize = parseInt(String(packSize ?? 1), 10)
    const finalPackSize = Number.isFinite(parsedPackSize) && parsedPackSize > 0 ? parsedPackSize : 1

    const parsedCostPrice = costPrice !== undefined && costPrice !== null && costPrice !== "" ? Number(costPrice) : 0
    if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) {
      return NextResponse.json(
        { success: false, error: "Cost price must be a non-negative number" },
        { status: 400 }
      )
    }

    const parsedWholesalePrice = wholesalePrice !== undefined && wholesalePrice !== null && wholesalePrice !== "" ? Number(wholesalePrice) : 0
    if (!Number.isFinite(parsedWholesalePrice) || parsedWholesalePrice < 0) {
      return NextResponse.json(
        { success: false, error: "Wholesale price must be a non-negative number" },
        { status: 400 }
      )
    }

    let parsedRetailPrice: number | null = null
    if (retailPrice !== undefined && retailPrice !== null && retailPrice !== "") {
      parsedRetailPrice = Number(retailPrice)
      if (!Number.isFinite(parsedRetailPrice) || parsedRetailPrice < 0) {
        return NextResponse.json(
          { success: false, error: "Retail price must be a non-negative number" },
          { status: 400 }
        )
      }
    }

    const parsedMargin = minMargin !== undefined && minMargin !== null && minMargin !== "" ? Number(minMargin) : 20
    if (!Number.isFinite(parsedMargin)) {
      return NextResponse.json(
        { success: false, error: "Minimum margin must be a valid number" },
        { status: 400 }
      )
    }

    if (categoryId) {
      const cat = await db.category.findUnique({ where: { id: String(categoryId).trim() } })
      if (!cat) {
        return NextResponse.json(
          { success: false, error: "Category not found" },
          { status: 404 }
        )
      }
    }

    const defaultRate = await resolveDefaultTaxRate(
      db,
      await getSettings("tax"),
      await getActiveCompanyId(request).catch(() => null)
    )

    const parsedGstRate = gstExempt ? 0 : (gstRate !== undefined && gstRate !== null && gstRate !== "" ? Number(gstRate) : (defaultRate || 0))
    if (!Number.isFinite(parsedGstRate) || parsedGstRate < 0) {
      return NextResponse.json(
        { success: false, error: "GST rate must be a non-negative number" },
        { status: 400 }
      )
    }

    const product = await db.product.create({
      data: {
        sku: trimmedSku,
        name: trimmedName,
        description: description ? String(description).trim() : null,
        categoryId: categoryId ? String(categoryId).trim() : null,
        brand: brand ? String(brand).trim() : null,
        baseUnit: baseUnit ? String(baseUnit).trim() : "each",
        packSize: finalPackSize,
        packUnit: packUnit ? String(packUnit).trim() : null,
        costPrice: parsedCostPrice,
        wholesalePrice: parsedWholesalePrice,
        retailPrice: parsedRetailPrice,
        minMargin: parsedMargin,
        // Resolved from settings, then the company's own rate — never a
        // literal. A business on any other rate used to get 10% on every
        // product it created, which then propagated into purchase orders.
        gstRate: parsedGstRate,
        gstExempt: Boolean(gstExempt),
        barcode: barcode ? String(barcode).trim() : null,
        imageUrl: imageUrl ? String(imageUrl).trim() : null,
        status: status ? String(status).trim() : "active",
        // Create variants if provided
        variants: variants && Array.isArray(variants) ? {
          create: variants
            .filter((v: any) => v && typeof v === "object" && v.sku && String(v.sku).trim() !== "")
            .map((v: any) => ({
              sku: String(v.sku).trim(),
              name: String(v.name || trimmedName).trim(),
              attributes: v.attributes ? (typeof v.attributes === "string" ? v.attributes : JSON.stringify(v.attributes)) : null,
              barcode: v.barcode ? String(v.barcode).trim() : null,
              costPrice: v.costPrice !== undefined && v.costPrice !== null && v.costPrice !== "" && Number.isFinite(Number(v.costPrice)) ? Number(v.costPrice) : null,
              wholesalePrice: v.wholesalePrice !== undefined && v.wholesalePrice !== null && v.wholesalePrice !== "" && Number.isFinite(Number(v.wholesalePrice)) ? Number(v.wholesalePrice) : null,
              retailPrice: v.retailPrice !== undefined && v.retailPrice !== null && v.retailPrice !== "" && Number.isFinite(Number(v.retailPrice)) ? Number(v.retailPrice) : null,
              status: v.status ? String(v.status).trim() : "active",
            }))
        } : undefined,
      },
      include: {
        category: true,
        variants: true,
      },
    })

    return NextResponse.json({ success: true, data: product }, { status: 201 })
  } catch (error) {
    console.error("Error creating product:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create product" },
      { status: 500 }
    )
  }
}
