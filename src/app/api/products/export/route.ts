import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { stringifyProductsCsv } from "@/lib/products-csv"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const products = await db.product.findMany({
      include: {
        category: true,
      },
      orderBy: { createdAt: "desc" },
    })

    const csv = stringifyProductsCsv(
      products.map((product) => ({
        sku: product.sku,
        name: product.name,
        description: product.description || "",
        category: product.category?.name || "",
        brand: product.brand || "",
        baseUnit: product.baseUnit,
        packSize: String(product.packSize),
        packUnit: product.packUnit || "",
        costPrice: String(product.costPrice),
        wholesalePrice: String(product.wholesalePrice),
        retailPrice: String(product.retailPrice ?? ""),
        gstRate: String(product.gstRate),
        status: product.status,
        barcode: product.barcode || "",
      }))
    )

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="products-export.csv"',
      },
    })
  } catch (error) {
    console.error("Product export error:", error)
    return NextResponse.json({ success: false, error: "Failed to export products" }, { status: 500 })
  }
}
