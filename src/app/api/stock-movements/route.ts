import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const warehouseId = searchParams.get("warehouseId") || ""
    const referenceType = searchParams.get("referenceType") || ""

    const movements = await db.stockMovement.findMany({
      where: {
        AND: [
          warehouseId ? { warehouseId } : {},
          referenceType ? { referenceType } : {},
          search
            ? {
                OR: [
                  { product: { name: { contains: search } } },
                  { product: { sku: { contains: search } } },
                  { reference: { contains: search } },
                  { reason: { contains: search } },
                ],
              }
            : {},
        ],
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    })

    return NextResponse.json({ success: true, data: movements })
  } catch (error) {
    console.error("Error fetching stock movements:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch stock movements" },
      { status: 500 }
    )
  }
}
