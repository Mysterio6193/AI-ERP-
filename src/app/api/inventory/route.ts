import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { requireAdminUser } from "@/lib/admin-auth"
import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"

type MovementType = "in" | "out" | "adjustment"

/**
 * Applies a quantity change atomically, inside the caller's transaction.
 *
 * The previous version read `inventory.quantity` outside any transaction,
 * computed the target value from that stale read, then wrote it back with a
 * plain `set` — so two concurrent adjustments could both read the same
 * starting quantity and the second write would silently clobber the first
 * (a lost update), and an "out" whose insufficient-stock check had already
 * passed could still overdraw once a concurrent request landed first.
 *
 * `in`/`out` now use Prisma's atomic `increment`/`decrement`, and `out` uses
 * a conditional `updateMany` with `quantity: { gte }` so the insufficient
 * stock check is re-validated at the moment of the write, not the moment of
 * the read — a losing concurrent request gets `count: 0` back instead of an
 * overdrawn row. `adjustment` is a recount to an exact value by definition,
 * so it still sets absolutely, but reads the "before" value inside this
 * transaction so the StockMovement delta it logs reflects what actually
 * changed rather than a stale read from before the transaction opened.
 */
async function adjustInventoryAtomically(
  tx: Prisma.TransactionClient,
  params: { inventoryId: string; type: MovementType; quantity: number }
) {
  if (params.type === "in") {
    const updated = await tx.inventory.update({
      where: { id: params.inventoryId },
      data: { quantity: { increment: params.quantity } },
    })
    return { ok: true as const, updated, delta: params.quantity }
  }

  if (params.type === "out") {
    const { count } = await tx.inventory.updateMany({
      where: { id: params.inventoryId, quantity: { gte: params.quantity } },
      data: { quantity: { decrement: params.quantity } },
    })

    if (count === 0) {
      return { ok: false as const, error: "Insufficient stock" }
    }

    const updated = await tx.inventory.findUniqueOrThrow({ where: { id: params.inventoryId } })
    return { ok: true as const, updated, delta: -params.quantity }
  }

  const before = await tx.inventory.findUniqueOrThrow({ where: { id: params.inventoryId } })
  const delta = params.quantity - before.quantity
  const updated = await tx.inventory.update({
    where: { id: params.inventoryId },
    data: { quantity: params.quantity },
  })
  return { ok: true as const, updated, delta }
}

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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request payload" },
        { status: 400 }
      )
    }

    const { productId, warehouseId, type, quantity, notes } = body

    const trimmedProductId = typeof productId === "string" ? productId.trim() : ""
    const trimmedWarehouseId = typeof warehouseId === "string" ? warehouseId.trim() : ""

    if (!trimmedProductId || !trimmedWarehouseId) {
      return NextResponse.json(
        { success: false, error: "Product ID and Warehouse ID are required" },
        { status: 400 }
      )
    }

    if (!type || !["in", "out", "adjustment"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid movement type. Must be 'in', 'out', or 'adjustment'" },
        { status: 400 }
      )
    }

    const numQty = Number(quantity)
    if (!Number.isFinite(numQty) || (type === "adjustment" ? numQty < 0 : numQty <= 0)) {
      return NextResponse.json(
        { success: false, error: type === "adjustment" ? "Quantity must be zero or more" : "Quantity must be greater than zero" },
        { status: 400 }
      )
    }
    const parsedQuantity = Math.floor(numQty)

    // Get current inventory
    const inventory = await db.inventory.findFirst({
      where: {
        productId: trimmedProductId,
        warehouseId: trimmedWarehouseId,
      },
    })

    if (!inventory) {
      return NextResponse.json(
        { success: false, error: "Inventory record not found" },
        { status: 404 }
      )
    }

    const result = await db.$transaction(async (tx) => {
      const change = await adjustInventoryAtomically(tx, {
        inventoryId: inventory.id,
        type: type as MovementType,
        quantity: parsedQuantity,
      })

      if (!change.ok) {
        return change
      }

      await tx.stockMovement.create({
        data: {
          productId: trimmedProductId,
          warehouseId: trimmedWarehouseId,
          inventoryId: inventory.id,
          type,
          quantity: change.delta,
          reason: notes ? String(notes).trim() : (type === "adjustment" ? `Stock adjustment to ${change.updated.quantity}` : undefined),
          referenceType: "adjustment",
        },
      })

      return change
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result.updated })
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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request payload" },
        { status: 400 }
      )
    }

    const { productId, warehouseId, type, quantity, reason, reference, userId } = body

    const trimmedProductId = typeof productId === "string" ? productId.trim() : ""
    const trimmedWarehouseId = typeof warehouseId === "string" ? warehouseId.trim() : ""

    if (!trimmedProductId || !trimmedWarehouseId) {
      return NextResponse.json(
        { success: false, error: "Product ID and Warehouse ID are required" },
        { status: 400 }
      )
    }

    if (!type || !["in", "out", "adjustment"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Invalid movement type. Must be 'in', 'out', or 'adjustment'" },
        { status: 400 }
      )
    }

    const numQty = Number(quantity)
    if (!Number.isFinite(numQty) || (type === "adjustment" ? numQty < 0 : numQty <= 0)) {
      return NextResponse.json(
        { success: false, error: type === "adjustment" ? "Quantity must be zero or more" : "Quantity must be greater than zero" },
        { status: 400 }
      )
    }
    const parsedQuantity = Math.floor(numQty)

    const [product, warehouse] = await Promise.all([
      db.product.findUnique({ where: { id: trimmedProductId }, select: { id: true } }),
      db.warehouse.findUnique({ where: { id: trimmedWarehouseId }, select: { id: true } }),
    ])

    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 })
    }

    if (!warehouse) {
      return NextResponse.json({ success: false, error: "Warehouse not found" }, { status: 404 })
    }

    // Get current inventory
    let inventory = await db.inventory.findFirst({
      where: {
        productId: trimmedProductId,
        warehouseId: trimmedWarehouseId,
      },
    })

    if (!inventory) {
      // Create inventory record if it doesn't exist
      inventory = await db.inventory.create({
        data: {
          productId: trimmedProductId,
          warehouseId: trimmedWarehouseId,
          quantity: 0,
          reorderLevel: 10,
        },
      })
    }

    const inventoryId = inventory.id

    const result = await db.$transaction(async (tx) => {
      const change = await adjustInventoryAtomically(tx, {
        inventoryId,
        type: type as MovementType,
        quantity: parsedQuantity,
      })

      if (!change.ok) {
        return change
      }

      // The signed delta, not the raw input. Previously `out` was logged
      // positive while stock went down, and `adjustment` logged the absolute
      // target rather than the change — so summing StockMovement could not
      // reproduce on-hand.
      const previousQuantity = change.updated.quantity - change.delta

      await tx.stockMovement.create({
        data: {
          productId: trimmedProductId,
          warehouseId: trimmedWarehouseId,
          inventoryId,
          type,
          quantity: change.delta,
          reason:
            type === "adjustment"
              ? `${reason ? String(reason).trim() : "Stock adjustment"} (counted ${change.updated.quantity}, was ${previousQuantity})`
              : (reason ? String(reason).trim() : undefined),
          reference: reference ? String(reference).trim() : null,
          userId: userId ? String(userId).trim() : null,
        },
      })

      return change
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result.updated }, { status: 201 })
  } catch (error) {
    console.error("Error updating inventory:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update inventory" },
      { status: 500 }
    )
  }
}
