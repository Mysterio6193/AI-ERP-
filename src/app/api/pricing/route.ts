import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/pricing - List all price lists
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const type = searchParams.get("type") || ""

    const priceLists = await db.priceList.findMany({
      where: {
        AND: [
          search
            ? { name: { contains: search } }
            : {},
          type ? { type: type } : {},
        ],
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                baseUnit: true,
                wholesalePrice: true,
              }
            }
          },
          take: 50,
        },
        _count: {
          select: { 
            customers: true,
            items: true,
          },
        },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json({ success: true, data: priceLists })
  } catch (error) {
    console.error("Error fetching price lists:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch price lists" },
      { status: 500 }
    )
  }
}

// POST /api/pricing - Create a new price list
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      description,
      type,
      status,
      isDefault,
      validFrom,
      validTo,
    } = body

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.priceList.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const priceList = await db.priceList.create({
      data: {
        name,
        description,
        type: type || "wholesale",
        status: status || "active",
        isDefault: isDefault || false,
        validFrom: validFrom ? new Date(validFrom) : null,
        validTo: validTo ? new Date(validTo) : null,
      },
    })

    return NextResponse.json({ success: true, data: priceList })
  } catch (error) {
    console.error("Error creating price list:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create price list" },
      { status: 500 }
    )
  }
}
