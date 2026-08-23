import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"

// GET /api/inventory - List all inventory with filters
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse", "accounts", "driver"])
    if (auth.response) {
      return auth.response
    }

    const companyId = await getActiveCompanyId(request)
    const { searchParams } = new URL(request.url)
    const warehouseId = searchParams.get("warehouseId") || ""
    const lowStock = searchParams.get("lowStock") === "true"

    const inventory = await db.inventory.findMany({
      where: {
        AND: [
          companyId ? { product: { companyId } } : {},
          warehouseId ? { warehouseId } : {},
        ],
      },
      include: {
        product: {
          include: {
            category: true,
          },
        },
        warehouse: true,
      },
      orderBy: {
        product: {
          name: "asc",
        },
      },
    })

    // Filter low stock in memory if requested
    let filteredInventory = inventory
    if (lowStock) {
      filteredInventory = inventory.filter(
        (item) => item.quantity <= item.reorderLevel
      )
    }

    // Add isLowStock flag and stockValue to each item
    const inventoryWithFlags = filteredInventory.map((item) => ({
      ...item,
      isLowStock: item.quantity <= item.reorderLevel,
      stockValue: item.quantity * item.product.costPrice,
    }))

    return NextResponse.json({ success: true, data: inventoryWithFlags })
  } catch (error) {
    console.error("Error fetching inventory:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch inventory" },
      { status: 500 }
    )
  }
}

// PATCH /api/inventory - Quick adjust stock for a product in a warehouse
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "warehouse", "driver"])
    if (auth.response) {
      return auth.response
    }

    const body = await request.json()
    const { productId, warehouseId, type, quantity, notes } = body

    // Get current inventory
    let inventory = await db.inventory.findFirst({
      where: {
        productId,
        warehouseId,
      },
    })

    if (!inventory) {
      return NextResponse.json(
        { success: false, error: "Inventory record not found" },
        { status: 404 }
      )
    }

    // Calculate new quantity
    let newQuantity = inventory.quantity
    if (type === "in") {
      newQuantity += quantity
    } else if (type === "out") {
      if (inventory.quantity < quantity) {
        return NextResponse.json(
          { success: false, error: "Insufficient stock" },
          { status: 400 }
        )
      }
      newQuantity -= quantity
    } else if (type === "adjustment") {
      newQuantity = quantity
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid movement type" },
        { status: 400 }
      )
    }

    const delta = newQuantity - inventory.quantity

    const updatedInventory = await db.$transaction(async (tx) => {
      const updated = await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: newQuantity },
      })

      await tx.stockMovement.create({
        data: {
          productId,
          warehouseId,
          inventoryId: inventory.id,
          type,
          quantity: delta,
          reason: notes || (type === "adjustment" ? `Stock adjustment to ${newQuantity}` : undefined),
          referenceType: "adjustment",
        },
      })

      return updated
    })

    return NextResponse.json({ success: true, data: updatedInventory })
  } catch (error) {
    console.error("Error updating inventory:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update inventory" },
      { status: 500 }
    )
  }
}

// POST /api/inventory - Create stock movement
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "warehouse", "driver"])
    if (auth.response) {
      return auth.response
    }

    const body = await request.json()
    const { productId, warehouseId, type, quantity, reason, reference, userId } = body

    // Get current inventory
    let inventory = await db.inventory.findFirst({
      where: {
        productId,
        warehouseId,
      },
    })

    if (!inventory) {
      // Create inventory record if it doesn't exist
      inventory = await db.inventory.create({
        data: {
          productId,
          warehouseId,
          quantity: 0,
          reorderLevel: 10,
        },
      })
    }

    // Calculate new quantity
    let newQuantity = inventory.quantity
    switch (type) {
      case "in":
        newQuantity += quantity
        break
      case "out":
        if (inventory.quantity < quantity) {
          return NextResponse.json(
            { success: false, error: "Insufficient stock" },
            { status: 400 }
          )
        }
        newQuantity -= quantity
        break
      case "adjustment":
        newQuantity = quantity // Set to exact quantity
        break
      default:
        return NextResponse.json(
          { success: false, error: "Invalid movement type" },
          { status: 400 }
        )
    }

    // The signed delta, not the raw input. Previously `out` was logged positive
    // while stock went down, and `adjustment` logged the absolute target rather
    // than the change - so summing StockMovement could not reproduce on-hand.
    const delta = newQuantity - inventory.quantity

    const updatedInventory = await db.$transaction(async (tx) => {
      const updated = await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: newQuantity },
      })

      await tx.stockMovement.create({
        data: {
          productId,
          warehouseId,
          inventoryId: inventory.id,
          type,
          quantity: delta,
          reason:
            type === "adjustment"
              ? `${reason || "Stock adjustment"} (counted ${newQuantity}, was ${inventory.quantity})`
              : reason,
          reference,
          userId,
        },
      })

      return updated
    })

    return NextResponse.json({ success: true, data: updatedInventory })
  } catch (error) {
    console.error("Error updating inventory:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update inventory" },
      { status: 500 }
    )
  }
}
