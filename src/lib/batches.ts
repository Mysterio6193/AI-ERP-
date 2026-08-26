import type { Prisma, PrismaClient } from "@prisma/client"

import { db } from "@/lib/db"

/**
 * Accepts a transaction client so batch draw-down commits atomically with the
 * stock decrement it accompanies. Defaults to the global client for callers
 * that are not already inside a transaction.
 */
type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Lot-level stock.
 *
 * `Inventory.quantity` says how much; this says which. For frozen food that
 * distinction decides three things nothing else can answer: what to pick first,
 * what is about to expire, and — during a recall — what is still in the freezer
 * and must not ship.
 *
 * `Inventory.quantity` remains the source of truth for availability, so every
 * existing caller keeps working. Batches are a parallel ledger reconciled
 * against it, which is deliberate: half-batched stock is normal in a business
 * that did not track lots until today, and allocation degrades to "no batch
 * information" rather than refusing to pick.
 */

export interface BatchAllocation {
  batchId: string
  batchCode: string
  quantity: number
  expiryDate: Date | null
}

export interface AllocationResult {
  ok: boolean
  allocations: BatchAllocation[]
  /** Quantity that could not be met from tracked batches. */
  unallocated: number
  /** Batches skipped because they are on hold, and why. */
  blocked: Array<{ batchCode: string; quantity: number; reason: string }>
}

function round(value: number) {
  return Math.round(value)
}

/**
 * Chooses which lots to draw from, earliest expiry first.
 *
 * FEFO rather than FIFO: with food, the batch that expires soonest should leave
 * first even if it was made later. Lots with no expiry sort last by receipt
 * date, so ambient goods still behave sensibly.
 */
export async function allocateFefo(input: {
  productId: string
  warehouseId: string
  quantity: number
  client?: DbClient
}): Promise<AllocationResult> {
  const client = input.client ?? db

  const batches = await client.inventoryBatch.findMany({
    where: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: { gt: 0 },
    },
    orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
  })

  return selectFefo(batches, round(input.quantity))
}

/** The shape selectFefo needs, so it can be reasoned about without a database. */
export interface SelectableBatch {
  id: string
  batchCode: string
  quantity: number
  reserved: number
  expiryDate: Date | null
  status: string
  holdReason?: string | null
}

/**
 * Which lots to ship, oldest-expiring first.
 *
 * Pure, and separated from the query because this is the decision that has to
 * be right: shipping a quarantined lot because it happened to expire soonest is
 * a recall, not a bug report. The caller supplies batches already ordered by
 * expiry, then received date — a lot with no expiry sorts last, which is what
 * we want, since something that can go off should leave before something that
 * cannot.
 */
export function selectFefo(batches: SelectableBatch[], quantity: number): AllocationResult {
  const allocations: BatchAllocation[] = []
  const blocked: AllocationResult["blocked"] = []

  let remaining = quantity

  for (const batch of batches) {
    const free = batch.quantity - batch.reserved

    if (free <= 0) {
      continue
    }

    if (batch.status !== "available") {
      // Recorded rather than silently skipped: "we have 400 but can only ship
      // 250" is the answer someone needs, along with why. A hold is never
      // stepped over just because that lot expires first.
      blocked.push({
        batchCode: batch.batchCode,
        quantity: free,
        reason: batch.holdReason || batch.status,
      })
      continue
    }

    if (remaining <= 0) {
      break
    }

    const take = Math.min(free, remaining)

    allocations.push({
      batchId: batch.id,
      batchCode: batch.batchCode,
      quantity: take,
      expiryDate: batch.expiryDate,
    })

    remaining -= take
  }

  return {
    ok: remaining <= 0,
    allocations,
    unallocated: Math.max(remaining, 0),
    blocked,
  }
}

/** Adds a lot, creating the inventory row if this is the first of a product. */
export async function receiveBatch(
  input: {
    productId: string
    warehouseId: string
    batchCode: string
    quantity: number
    expiryDate?: Date | null
    sourceType?: "production" | "purchase" | "adjustment" | "opening"
    productionOrderId?: string
    purchaseOrderId?: string
    supplierId?: string | null
    unitCost?: number
    location?: string
  },
  client: DbClient = db
) {
  const inventory = await client.inventory.upsert({
    where: {
      productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId },
    },
    create: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: 0,
      avgCost: input.unitCost ?? 0,
      lastCost: input.unitCost ?? 0,
    },
    update: {},
    select: { id: true },
  })

  // Receiving the same lot twice adds to it rather than splitting the record,
  // which is what happens when a delivery arrives across two pallets.
  const existing = await client.inventoryBatch.findFirst({
    where: {
      inventoryId: inventory.id,
      batchCode: input.batchCode,
      status: { in: ["available", "quarantined"] },
    },
    select: { id: true },
  })

  const batch = existing
    ? await client.inventoryBatch.update({
        where: { id: existing.id },
        data: { quantity: { increment: round(input.quantity) } },
      })
    : await client.inventoryBatch.create({
        data: {
          inventoryId: inventory.id,
          productId: input.productId,
          warehouseId: input.warehouseId,
          batchCode: input.batchCode,
          quantity: round(input.quantity),
          expiryDate: input.expiryDate ?? null,
          sourceType: input.sourceType || "purchase",
          productionOrderId: input.productionOrderId || null,
          purchaseOrderId: input.purchaseOrderId || null,
          supplierId: input.supplierId || null,
          unitCost: input.unitCost ?? 0,
          location: input.location || null,
        },
      })

  return { ok: true as const, batch }
}

/**
 * Draws stock down against specific lots.
 *
 * Does not touch `Inventory.quantity` — the caller owns that, because the
 * existing fulfilment paths already adjust it and double-decrementing would be
 * worse than not tracking lots at all.
 */
export async function consumeBatches(allocations: BatchAllocation[], client: DbClient = db) {
  for (const allocation of allocations) {
    const batch = await client.inventoryBatch.update({
      where: { id: allocation.batchId },
      data: { quantity: { decrement: allocation.quantity } },
      select: { id: true, quantity: true },
    })

    if (batch.quantity <= 0) {
      await client.inventoryBatch.update({
        where: { id: batch.id },
        data: { status: "consumed" },
      })
    }
  }

  return { ok: true as const, consumed: allocations.length }
}

/**
 * Holds every remaining lot of a batch code.
 *
 * The other half of a recall: `traceBatch` finds who received it, this stops
 * the rest going out. Returns what was held so it can be counted and pulled.
 */
export async function quarantineBatch(batchCode: string, reason: string) {
  const affected = await db.inventoryBatch.findMany({
    where: { batchCode, status: "available", quantity: { gt: 0 } },
    select: { id: true, quantity: true, warehouseId: true, productId: true },
  })

  if (!affected.length) {
    return { ok: true as const, held: 0, units: 0, note: "No stock of that batch is on hand" }
  }

  await db.inventoryBatch.updateMany({
    where: { id: { in: affected.map((batch) => batch.id) } },
    data: { status: "quarantined", holdReason: reason },
  })

  const products = await db.product.findMany({
    where: { id: { in: [...new Set(affected.map((batch) => batch.productId))] } },
    select: { id: true, name: true, sku: true },
  })

  const nameById = new Map(products.map((row) => [row.id, row]))

  return {
    ok: true as const,
    held: affected.length,
    units: affected.reduce((sum, batch) => sum + batch.quantity, 0),
    lines: affected.map((batch) => ({
      product: nameById.get(batch.productId)?.name ?? batch.productId,
      sku: nameById.get(batch.productId)?.sku ?? null,
      quantity: batch.quantity,
    })),
  }
}

export async function releaseBatch(batchCode: string) {
  const result = await db.inventoryBatch.updateMany({
    where: { batchCode, status: "quarantined" },
    data: { status: "available", holdReason: null },
  })

  return { ok: true as const, released: result.count }
}

/** Lots at or near their expiry date, worth acting on before they are waste. */
export async function expiringBatches(withinDays = 21) {
  const cutoff = new Date(Date.now() + withinDays * 86400_000)

  const batches = await db.inventoryBatch.findMany({
    where: {
      status: "available",
      quantity: { gt: 0 },
      expiryDate: { not: null, lte: cutoff },
    },
    orderBy: { expiryDate: "asc" },
    take: 50,
    include: {
      inventory: {
        select: {
          product: { select: { name: true, sku: true, wholesalePrice: true } },
          warehouse: { select: { name: true } },
        },
      },
    },
  })

  const now = Date.now()

  return batches.map((batch) => {
    const days = batch.expiryDate
      ? Math.floor((batch.expiryDate.getTime() - now) / 86400_000)
      : null

    return {
      id: batch.id,
      batchCode: batch.batchCode,
      product: batch.inventory.product.name,
      sku: batch.inventory.product.sku,
      warehouse: batch.inventory.warehouse.name,
      quantity: batch.quantity,
      expiryDate: batch.expiryDate,
      daysRemaining: days,
      expired: days !== null && days < 0,
      valueAtRisk: Number((batch.quantity * batch.inventory.product.wholesalePrice).toFixed(2)),
    }
  })
}

/** Marks anything already past its date, so it stops being pickable. */
export async function expireOverdueBatches() {
  const result = await db.inventoryBatch.updateMany({
    where: {
      status: "available",
      quantity: { gt: 0 },
      expiryDate: { not: null, lt: new Date() },
    },
    data: { status: "expired", holdReason: "Past expiry date" },
  })

  return { expired: result.count }
}

/** Every lot of a product, for the stock screen. */
export async function batchesForProduct(productId: string, warehouseId?: string) {
  return db.inventoryBatch.findMany({
    where: {
      productId,
      ...(warehouseId ? { warehouseId } : {}),
      quantity: { gt: 0 },
    },
    orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
  })
}
