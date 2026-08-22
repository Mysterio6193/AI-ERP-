import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existingWarehouse = await db.warehouse.findUnique({
      where: { id },
    })

    if (!existingWarehouse) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 })
    }

    if (body.code && body.code !== existingWarehouse.code) {
      const duplicate = await db.warehouse.findUnique({
        where: { code: body.code },
      })

      if (duplicate) {
        return NextResponse.json(
          { success: false, error: "Another location already uses this code" },
          { status: 400 }
        )
      }
    }

    if (body.isDefault) {
      await db.warehouse.updateMany({
        where: {
          isDefault: true,
          NOT: { id },
        },
        data: { isDefault: false },
      })
    }

    const warehouse = await db.warehouse.update({
      where: { id },
      data: {
        name: body.name ?? existingWarehouse.name,
        code: body.code ?? existingWarehouse.code,
        location: body.location ?? existingWarehouse.location,
        address: body.address ?? existingWarehouse.address,
        city: body.city ?? existingWarehouse.city,
        state: body.state ?? existingWarehouse.state,
        postcode: body.postcode ?? existingWarehouse.postcode,
        contactName: body.contactName ?? existingWarehouse.contactName,
        contactPhone: body.contactPhone ?? existingWarehouse.contactPhone,
        contactEmail: body.contactEmail ?? existingWarehouse.contactEmail,
        capacity: body.capacity !== undefined ? Number(body.capacity) || null : existingWarehouse.capacity,
        isDefault: body.isDefault !== undefined ? Boolean(body.isDefault) : existingWarehouse.isDefault,
        status: body.status ?? existingWarehouse.status,
      },
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
    })

    const totalValue = warehouse.inventory.reduce(
      (sum, item) => sum + item.quantity * (item.product.costPrice || item.product.wholesalePrice),
      0
    )

    return NextResponse.json({
      success: true,
      data: {
        ...warehouse,
        totalValue,
        productCount: warehouse._count.inventory,
      },
    })
  } catch (error) {
    console.error("Error updating location:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update location" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const warehouse = await db.warehouse.findUnique({
      where: { id },
      include: {
        _count: {
          select: { inventory: true, pickLists: true, deliveryRoutes: true },
        },
      },
    })

    if (!warehouse) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 })
    }

    if (warehouse._count.inventory > 0 || warehouse._count.pickLists > 0 || warehouse._count.deliveryRoutes > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "This location is already used by stock, pick lists, or delivery routes and cannot be deleted.",
        },
        { status: 400 }
      )
    }

    await db.warehouse.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting location:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete location" },
      { status: 500 }
    )
  }
}
