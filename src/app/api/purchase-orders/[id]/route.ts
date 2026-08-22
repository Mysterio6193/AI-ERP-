import type { Prisma, PrismaClient } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { receiveBatch } from "@/lib/batches"
import { db } from "@/lib/db"
import { resolveDefaultWarehouseId } from "@/lib/pick-lists"
import { ROLE_SETS } from "@/lib/permissions"
import { postPurchaseReceipt } from "@/lib/ledger"

type DbClient = PrismaClient | Prisma.TransactionClient

type ReceivedItemInput = {
  itemId?: string
  receivedQty?: number
  /** Supplier's lot code, so bought goods are traceable in a recall. */
  batchCode?: string
  /** Best-before on the delivered stock, for FEFO and expiry alerts. */
  expiryDate?: string
}

async function resolveWarehouseId(order: {
  warehouseId: string | null
  companyId: string | null
}) {
  if (order.warehouseId) {
    return order.warehouseId
  }

  return resolveDefaultWarehouseId(db as any, order.companyId)
}

function isOrderedStatus(status: string) {
  return ["submitted", "confirmed", "partial", "received"].includes(status)
}

async function upsertInventoryRecord(
  input: {
    productId: string
    variantId: string | null
    warehouseId: string
    quantityDelta?: number
    onOrderDelta?: number
    unitCost?: number
  },
  client: DbClient = db
) {
  const inventory = await client.inventory.findFirst({
    where: {
      productId: input.productId,
      warehouseId: input.warehouseId,
    },
  })

  if (inventory) {
    const received = input.quantityDelta || 0

    // Weighted average, not assignment. This previously set avgCost to the
    // latest purchase price, so every receipt overwrote the running cost and
    // inventory valuation drifted toward whatever was bought most recently.
    // Same formula as manufacturing.ts uses for produced output.
    const avgCost =
      input.unitCost !== undefined && input.unitCost !== null && received > 0
        ? (() => {
            const nextQty = inventory.quantity + received
            if (nextQty <= 0) {
              return input.unitCost
            }

            const value = inventory.quantity * inventory.avgCost + received * input.unitCost
            return Number((value / nextQty).toFixed(4))
          })()
        : inventory.avgCost

    return client.inventory.update({
      where: { id: inventory.id },
      data: {
        quantity: { increment: received },
        // Floored so a receipt against a PO that was never submitted cannot
        // drive onOrder negative.
        onOrder: Math.max(inventory.onOrder + (input.onOrderDelta || 0), 0),
        lastCost: input.unitCost ?? inventory.lastCost,
        avgCost,
      },
    })
  }

  return client.inventory.create({
    data: {
      productId: input.productId,
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      quantity: Math.max(input.quantityDelta || 0, 0),
      onOrder: Math.max(input.onOrderDelta || 0, 0),
      reorderLevel: 10,
      reorderQty: 50,
      lastCost: input.unitCost || 0,
      avgCost: input.unitCost || 0,
    },
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.operations)
    if (!auth.user) return auth.response

    const { id } = await params
    const body = await request.json()
    const nextStatus = body.status
    const receivedItems = Array.isArray(body.receivedItems) ? (body.receivedItems as ReceivedItemInput[]) : []

    const existingOrder = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: true,
      },
    })

    if (!existingOrder) {
      return NextResponse.json({ success: false, error: "Purchase order not found" }, { status: 404 })
    }

    const warehouseId = await resolveWarehouseId(existingOrder)

    if (!warehouseId) {
      return NextResponse.json(
        { success: false, error: "No warehouse is configured for this purchase order." },
        { status: 400 }
      )
    }

    if (nextStatus && nextStatus === "cancelled" && existingOrder.status === "received") {
      return NextResponse.json(
        { success: false, error: "Received purchase orders cannot be cancelled." },
        { status: 400 }
      )
    }

    if (!existingOrder.warehouseId) {
      await db.purchaseOrder.update({
        where: { id },
        data: { warehouseId },
      })
    }

    const wasOrdered = isOrderedStatus(existingOrder.status)
    const willBeOrdered = nextStatus ? isOrderedStatus(nextStatus) : wasOrdered

    if (!wasOrdered && willBeOrdered) {
      for (const item of existingOrder.items) {
        const outstandingQty = Math.max(item.quantity - item.receivedQty, 0)
        if (!outstandingQty) continue
        await upsertInventoryRecord({
          productId: item.productId,
          variantId: item.variantId,
          warehouseId,
          onOrderDelta: outstandingQty,
          unitCost: item.unitCost,
        })
      }
    }

    if (wasOrdered && nextStatus === "cancelled") {
      for (const item of existingOrder.items) {
        const outstandingQty = Math.max(item.quantity - item.receivedQty, 0)
        if (!outstandingQty) continue
        await upsertInventoryRecord({
          productId: item.productId,
          variantId: item.variantId,
          warehouseId,
          onOrderDelta: -outstandingQty,
          unitCost: item.unitCost,
        })
      }
    }

    const shouldProcessReceipt = nextStatus === "received" || nextStatus === "partial"

    if (shouldProcessReceipt) {
      // One transaction for the whole receipt. Previously each line issued three
      // uncoordinated writes, so a failure between them left stock incremented
      // with receivedQty unchanged (re-receiving double-counted) or with no
      // movement row at all.
      await db.$transaction(async (tx) => {
        for (const item of existingOrder.items) {
          const requestedReceipt = receivedItems.find((entry) => entry.itemId === item.id)?.receivedQty
          const targetReceivedQty =
            nextStatus === "received"
              ? item.quantity
              : Math.min(item.quantity, Math.max(Number(requestedReceipt) || item.receivedQty, item.receivedQty))

          const receiptDelta = Math.max(targetReceivedQty - item.receivedQty, 0)
          if (!receiptDelta) continue

          const inventory = await upsertInventoryRecord(
            {
              productId: item.productId,
              variantId: item.variantId,
              warehouseId,
              quantityDelta: receiptDelta,
              onOrderDelta: -receiptDelta,
              unitCost: item.unitCost,
            },
            tx
          )

          await tx.purchaseOrderItem.update({
            where: { id: item.id },
            data: { receivedQty: targetReceivedQty },
          })

          // Purchased goods now enter the lot ledger too. Without this, only
          // manufactured stock had batches, so bought ingredients could never
          // be traced or recalled - which is most of what a recall is about.
          const supplierBatch =
            receivedItems.find((entry) => entry.itemId === item.id)?.batchCode?.trim() ||
            `${existingOrder.poNumber}-${item.id.slice(-4).toUpperCase()}`

          const expiryRaw = receivedItems.find((entry) => entry.itemId === item.id)?.expiryDate

          await receiveBatch(
            {
              productId: item.productId,
              warehouseId,
              batchCode: supplierBatch,
              quantity: receiptDelta,
              expiryDate: expiryRaw ? new Date(expiryRaw) : null,
              sourceType: "purchase",
              purchaseOrderId: existingOrder.id,
              supplierId: existingOrder.supplierId,
              unitCost: item.unitCost,
            },
            tx
          )

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              variantId: item.variantId,
              warehouseId,
              inventoryId: inventory.id,
              type: "purchase",
              quantity: receiptDelta,
              reason: `Stock received against ${existingOrder.poNumber}`,
              reference: existingOrder.poNumber,
              referenceType: "purchase_order",
              unitCost: item.unitCost,
              totalCost: item.unitCost * receiptDelta,
            },
          })

          // Receiving goods creates an asset; without the matching liability
          // the books could never balance. Keyed on the line's new cumulative
          // quantity so a staged delivery posts each delta exactly once.
          await postPurchaseReceipt(tx, existingOrder.id, item.unitCost * receiptDelta, {
            referenceKey: `${item.id}:${targetReceivedQty}`,
          })
        }
      })
    }

    const refreshedItems = await db.purchaseOrderItem.findMany({
      where: { poId: existingOrder.id },
    })

    const allReceived = refreshedItems.every((item) => item.receivedQty >= item.quantity)
    const anyReceived = refreshedItems.some((item) => item.receivedQty > 0)
    const finalStatus =
      nextStatus === "cancelled"
        ? "cancelled"
        : allReceived
          ? "received"
          : anyReceived
            ? "partial"
            : nextStatus || existingOrder.status

    const updatedOrder = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: finalStatus,
        warehouseId,
        receivedDate: finalStatus === "received" ? new Date() : existingOrder.receivedDate,
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                costPrice: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ success: true, data: updatedOrder })
  } catch (error) {
    console.error("Error updating purchase order:", error)
    return NextResponse.json({ success: false, error: "Failed to update purchase order" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.operations)
    if (!auth.user) return auth.response

    const { id } = await params

    const order = await db.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true },
    })

    if (!order) {
      return NextResponse.json({ success: false, error: "Purchase order not found" }, { status: 404 })
    }

    if (order.status === "received") {
      return NextResponse.json(
        { success: false, error: "Received purchase orders cannot be deleted." },
        { status: 400 }
      )
    }

    await db.purchaseOrder.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting purchase order:", error)
    return NextResponse.json({ success: false, error: "Failed to delete purchase order" }, { status: 500 })
  }
}
