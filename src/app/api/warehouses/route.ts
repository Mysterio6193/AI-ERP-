import { NextRequest, NextResponse } from "next/server"
import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"

/** The entity the request is acting as, not merely the first row. */
async function getDefaultCompanyId(request: NextRequest) {
  return getActiveCompanyId(request)
}

// GET /api/warehouses - List all warehouses
export async function GET() {
  try {
    const warehouses = await db.warehouse.findMany({
      include: {
        _count: {
          select: { inventory: true },
        },
        inventory: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { name: "asc" },
    })

    // Calculate total value for each warehouse
    const warehousesWithValue = warehouses.map((wh) => {
      const totalValue = wh.inventory.reduce(
        (sum, inv) => sum + inv.quantity * (inv.product.costPrice || inv.product.wholesalePrice),
        0
      )
      return {
        ...wh,
        totalValue,
        productCount: wh._count.inventory,
      }
    })

    return NextResponse.json({ success: true, data: warehousesWithValue })
  } catch (error) {
    console.error("Error fetching warehouses:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch warehouses" },
      { status: 500 }
    )
  }
}

// POST /api/warehouses - Create a new warehouse
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      code,
      location,
      address,
      city,
      state,
      postcode,
      contactName,
      contactPhone,
      contactEmail,
      capacity,
      isDefault,
      status,
    } = body

    // Check if code already exists
    const existingWarehouse = await db.warehouse.findUnique({
      where: { code },
    })

    if (existingWarehouse) {
      return NextResponse.json(
        { success: false, error: "Warehouse with this code already exists" },
        { status: 400 }
      )
    }

    if (isDefault) {
      await db.warehouse.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const warehouse = await db.warehouse.create({
      data: {
        name,
        code,
        location,
        address,
        city,
        state,
        postcode,
        contactName,
        contactPhone,
        contactEmail,
        capacity: capacity ? Number(capacity) : null,
        isDefault: Boolean(isDefault),
        status: status || "active",
        companyId: await getDefaultCompanyId(request),
      },
    })

    return NextResponse.json({ success: true, data: warehouse })
  } catch (error) {
    console.error("Error creating warehouse:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create warehouse" },
      { status: 500 }
    )
  }
}
