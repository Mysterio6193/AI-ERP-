import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Holding stock between promising it and shipping it.
 *
 * `StockReservation` was modelled and never written. `Inventory.reserved` and
 * `SalesOrderItem.reserved` were read in half a dozen places and never written
 * either, so every "available" figure in the system was really just `quantity`.
 * Two orders for the last pallet both passed, and nobody found out until a
 * picker went looking for it.
 *
 * The reservation rows are the ledger, exactly as `StockMovement` is for
 * committed stock: whether an order already holds stock is answered by asking
 * the table, not by a flag that can drift. That makes every operation here
 * safe to repeat — approvals get re-sent, webhooks retry, people double-click.
 *
 * Lifecycle, matching the physical facts:
 *
 *   approved   → reserve   (promised, still on the shelf)
 *   dispatched → fulfil    (gone; commitStockForOrder drops `quantity`, so the
 *                           hold must lift or the same units are subtracted twice)
 *   cancelled  → release   (never leaving; back to available)
 */

export type ReservationOutcome =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; reserved: number; lines: number }

/** What is genuinely sellable: on hand, minus what is already promised. */
export function availableQuantity(inventory: { quantity: number; reserved: number }) {
  // Never report negative availability. A reserved figure larger than on-hand
  // means something is already wrong; showing "-3 available" only adds noise.
  return Math.max(inventory.quantity - inventory.reserved, 0)
}

async function activeReservations(db: DbClient, orderId: string) {
  return db.stockReservation.findMany({
    where: { referenceId: orderId, referenceType: "sales_order", status: "active" },
    select: { id: true, inventoryId: true, productId: true, warehouseId: true, quantity: true },
  })
}

/**
 * Hold stock for an approved order.
 *
 * Reserves against the order's warehouse, falling back to the default. A line
 * with no inventory row is recorded as a reservation anyway: the promise has
 * been made, and hiding it because the stock record is missing would make the
 * shortfall invisible at exactly the moment someone could still act on it.
 */
export async function reserveStockForOrder(
  db: DbClient,
  orderId: string,
  options?: { expiresAt?: Date | null }
): Promise<ReservationOutcome> {
  const existing = await activeReservations(db, orderId)

  if (existing.length > 0) {
    return { ok: true, skipped: true, reason: "Stock already reserved for this order" }
  }

  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      warehouseId: true,
      items: {
        select: { id: true, productId: true, quantity: true, shippedQty: true, warehouseId: true },
      },
    },
  })

  if (!order) {
    return { ok: true, skipped: true, reason: "Order not found" }
  }

  const fallbackWarehouseId =
    order.warehouseId ||
    (await db.warehouse.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id ||
    null

  let reserved = 0
  let lines = 0

  for (const item of order.items) {
    const warehouseId = item.warehouseId || fallbackWarehouseId
    // Anything already shipped is committed, not held.
    const outstanding = item.quantity - (item.shippedQty || 0)

    if (!warehouseId || outstanding <= 0) {
      continue
    }

    const inventory = await db.inventory.findFirst({
      where: { productId: item.productId, warehouseId },
      select: { id: true },
    })

    await db.stockReservation.create({
      data: {
        productId: item.productId,
        warehouseId,
        inventoryId: inventory?.id ?? null,
        quantity: outstanding,
        referenceType: "sales_order",
        referenceId: orderId,
        expiresAt: options?.expiresAt ?? null,
        status: "active",
      },
    })

    if (inventory) {
      // Atomic: two approvals landing together must both count.
      await db.inventory.update({
        where: { id: inventory.id },
        data: { reserved: { increment: outstanding } },
      })
    }

    await db.salesOrderItem.update({
      where: { id: item.id },
      data: { reserved: true },
    })

    reserved += outstanding
    lines += 1
  }

  return { ok: true, skipped: false, reserved, lines }
}

/**
 * Close out reservations for an order.
 *
 * `fulfilled` when the goods shipped, `released` when the order died. Both drop
 * `Inventory.reserved` by the same amount, because in either case the hold is
 * over — the difference is only what it means, which matters when someone reads
 * the table back later.
 */
async function closeReservations(
  db: DbClient,
  orderId: string,
  status: "fulfilled" | "released"
): Promise<ReservationOutcome> {
  const rows = await activeReservations(db, orderId)

  if (rows.length === 0) {
    return { ok: true, skipped: true, reason: "No active reservations for this order" }
  }

  let released = 0

  for (const row of rows) {
    if (row.inventoryId) {
      const inventory = await db.inventory.findUnique({
        where: { id: row.inventoryId },
        select: { reserved: true },
      })

      // Clamp rather than decrement blindly. If the figures have drifted, a
      // negative `reserved` would make everything downstream over-report
      // availability, which is the bug this module exists to prevent.
      const drop = Math.min(row.quantity, inventory?.reserved ?? 0)

      if (drop > 0) {
        await db.inventory.update({
          where: { id: row.inventoryId },
          data: { reserved: { decrement: drop } },
        })
      }
    }

    await db.stockReservation.update({ where: { id: row.id }, data: { status } })
    released += row.quantity
  }

  await db.salesOrderItem.updateMany({
    where: { orderId },
    data: { reserved: false },
  })

  return { ok: true, skipped: false, reserved: released, lines: rows.length }
}

/** The order shipped: the hold ends because the stock itself has gone. */
export function fulfilReservationsForOrder(db: DbClient, orderId: string) {
  return closeReservations(db, orderId, "fulfilled")
}

/** The order will not ship: the stock goes back to available. */
export function releaseReservationsForOrder(db: DbClient, orderId: string) {
  return closeReservations(db, orderId, "released")
}

/**
 * Reservations past their expiry, so a stale hold cannot sit on stock forever.
 *
 * Nothing calls this on a schedule yet; it exists so expiring holds is a cron
 * entry rather than a new subsystem.
 */
export async function releaseExpiredReservations(db: DbClient, asOf = new Date()) {
  const expired = await db.stockReservation.findMany({
    where: { status: "active", expiresAt: { not: null, lt: asOf } },
    select: { referenceId: true },
    distinct: ["referenceId"],
  })

  let orders = 0
  for (const row of expired) {
    await releaseReservationsForOrder(db, row.referenceId)
    orders += 1
  }

  return { orders }
}
