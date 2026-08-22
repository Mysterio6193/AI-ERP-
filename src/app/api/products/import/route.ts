import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { parseSimpleCsv } from "@/lib/products-csv"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const body = await request.json()
    const csv = String(body.csv || "")
    const rows = parseSimpleCsv(csv)

    if (!rows.length) {
      return NextResponse.json({ success: false, error: "No CSV rows found to import" }, { status: 400 })
    }

    let created = 0
    let updated = 0

    for (const row of rows) {
      if (!row.sku || !row.name) continue

      let categoryId: string | null = null
      if (row.category) {
        const existingCategory = await db.category.findFirst({
          where: { name: row.category },
        })
        if (existingCategory) {
          categoryId = existingCategory.id
        } else {
          const category = await db.category.create({
            data: {
              name: row.category,
            },
          })
          categoryId = category.id
        }
      }

      const existing = await db.product.findUnique({
        where: { sku: row.sku },
      })

      const payload = {
        name: row.name,
        description: row.description || null,
        categoryId,
        brand: row.brand || null,
        baseUnit: row.baseUnit || "each",
        packSize: Number(row.packSize || 1),
        packUnit: row.packUnit || null,
        costPrice: Number(row.costPrice || 0),
        wholesalePrice: Number(row.wholesalePrice || 0),
        retailPrice: row.retailPrice ? Number(row.retailPrice) : null,
        gstRate: Number(row.gstRate || 10),
        status: row.status || "active",
        barcode: row.barcode || null,
      }

      if (existing) {
        await db.product.update({
          where: { id: existing.id },
          data: payload,
        })
        updated += 1
      } else {
        await db.product.create({
          data: {
            sku: row.sku,
            ...payload,
          },
        })
        created += 1
      }
    }

    return NextResponse.json({
      success: true,
      message: "Product import completed successfully.",
      data: {
        created,
        updated,
        totalRows: rows.length,
      },
    })
  } catch (error) {
    console.error("Product import error:", error)
    return NextResponse.json({ success: false, error: "Failed to import products" }, { status: 500 })
  }
}
