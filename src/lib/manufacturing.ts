import { allocateFefo, consumeBatches, receiveBatch } from "@/lib/batches"
import { db } from "@/lib/db"

/**
 * Production.
 *
 * Raw materials go in, finished goods come out, and stock moves on both sides
 * of that. Three things drive the design:
 *
 *   - Planned and actual are separate. A recipe says how much flour a batch
 *     should take; the run records what it took. The gap is the yield problem
 *     worth knowing about.
 *   - Stock is only moved by completing a run, never by planning one, so a
 *     forecast can never quietly consume inventory.
 *   - Every consumption records the incoming lot. That is what turns a recall
 *     from a day of paperwork into one query.
 */

export interface MaterialRequirement {
  componentId: string
  component: string
  sku: string
  unit: string
  requiredQty: number
  availableQty: number
  shortfall: number
  unitCost: number
  lineCost: number
}

/** Rounds to 4dp. Float quantities accumulate noise over a multi-line recipe. */
function round(value: number, places = 4) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * What one batch multiplier needs, and whether it is actually in stock.
 *
 * `batches` is a multiplier on the BOM's own yield, not a unit count - recipes
 * do not scale below their batch size in a real kitchen.
 */
export async function explodeBom(
  bomId: string,
  batches = 1,
  warehouseId?: string
): Promise<{ ok: false; error: string } | { ok: true; bom: BomSummary; requirements: MaterialRequirement[]; totalCost: number; canProduce: boolean }> {
  const bom = await db.billOfMaterial.findUnique({
    where: { id: bomId },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { component: { select: { id: true, name: true, sku: true, baseUnit: true, costPrice: true } } },
      },
    },
  })

  if (!bom) {
    return { ok: false, error: "Recipe not found" }
  }

  if (!bom.lines.length) {
    return { ok: false, error: `"${bom.name}" has no ingredients` }
  }

  const componentIds = bom.lines.map((line) => line.componentId)

  const inventory = await db.inventory.findMany({
    where: {
      productId: { in: componentIds },
      ...(warehouseId ? { warehouseId } : {}),
    },
    select: { productId: true, quantity: true, reserved: true },
  })

  const availableByProduct = new Map<string, number>()
  for (const row of inventory) {
    availableByProduct.set(
      row.productId,
      (availableByProduct.get(row.productId) || 0) + (row.quantity - row.reserved)
    )
  }

  const requirements: MaterialRequirement[] = bom.lines.map((line) => {
    // Waste is part of what you must have on hand, not an afterthought.
    const gross = line.quantity * batches * (1 + line.wastePercent / 100)
    const requiredQty = round(gross)
    const availableQty = availableByProduct.get(line.componentId) || 0
    const unitCost = line.component.costPrice || 0

    return {
      componentId: line.componentId,
      component: line.component.name,
      sku: line.component.sku,
      unit: line.unit || line.component.baseUnit,
      requiredQty,
      availableQty,
      shortfall: round(Math.max(requiredQty - availableQty, 0)),
      unitCost,
      lineCost: round(requiredQty * unitCost, 2),
    }
  })

  return {
    ok: true,
    bom: {
      id: bom.id,
      name: bom.name,
      version: bom.version,
      product: bom.product.name,
      productId: bom.product.id,
      yieldQty: bom.yieldQty,
      yieldUnit: bom.yieldUnit,
      outputQty: round(bom.yieldQty * batches),
    },
    requirements,
    totalCost: round(requirements.reduce((sum, line) => sum + line.lineCost, 0), 2),
    canProduce: requirements.every((line) => line.shortfall === 0),
  }
}

export interface BomSummary {
  id: string
  name: string
  version: number
  product: string
  productId: string
  yieldQty: number
  yieldUnit: string
  outputQty: number
}

/** How many full batches the ingredients on hand allow. */
export async function maxProducibleBatches(bomId: string, warehouseId?: string) {
  const exploded = await explodeBom(bomId, 1, warehouseId)

  if (!exploded.ok) {
    return { ok: false as const, error: exploded.error }
  }

  let limit = Infinity
  let limitedBy: string | null = null

  for (const line of exploded.requirements) {
    if (line.requiredQty <= 0) {
      continue
    }

    const possible = Math.floor(line.availableQty / line.requiredQty)

    if (possible < limit) {
      limit = possible
      limitedBy = line.component
    }
  }

  const batches = Number.isFinite(limit) ? Math.max(limit, 0) : 0

  return {
    ok: true as const,
    batches,
    outputQty: round(batches * exploded.bom.yieldQty),
    unit: exploded.bom.yieldUnit,
    // Naming the constraint is the useful part: "you can make 12, flour is the limit".
    limitedBy: batches === 0 || limitedBy ? limitedBy : null,
  }
}

async function nextOrderNumber() {
  const year = new Date().getFullYear()
  const prefix = `PRD-${year}-`

  const last = await db.productionOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  })

  const sequence = last ? Number(last.orderNumber.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(sequence).padStart(4, "0")}`
}

/** A batch code that is readable on a pallet label and sorts chronologically. */
function generateBatchCode(productSku: string, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, "")
  const short = productSku.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase()
  return `${short}-${stamp}`
}

/**
 * Plans a run. Reserves nothing and moves no stock - a plan that consumed
 * inventory would make forecasting destructive.
 */
export async function createProductionOrder(input: {
  bomId: string
  batches: number
  warehouseId?: string
  scheduledFor?: Date
  notes?: string
  createdById?: string
  createdByAgent?: boolean
  companyId?: string | null
}) {
  const exploded = await explodeBom(input.bomId, input.batches, input.warehouseId)

  if (!exploded.ok) {
    return { ok: false as const, error: exploded.error }
  }

  const product = await db.product.findUnique({
    where: { id: exploded.bom.productId },
    select: { sku: true },
  })

  const order = await db.productionOrder.create({
    data: {
      orderNumber: await nextOrderNumber(),
      productId: exploded.bom.productId,
      bomId: input.bomId,
      warehouseId: input.warehouseId || null,
      plannedQty: exploded.bom.outputQty,
      status: "planned",
      scheduledFor: input.scheduledFor || null,
      batchCode: generateBatchCode(product?.sku || "BATCH", input.scheduledFor || new Date()),
      notes: input.notes || null,
      createdById: input.createdById || null,
      createdByAgent: input.createdByAgent ?? false,
      companyId: input.companyId || null,
      consumptions: {
        create: exploded.requirements.map((line) => ({
          componentId: line.componentId,
          plannedQty: line.requiredQty,
          unitCost: line.unitCost,
        })),
      },
    },
    include: { consumptions: true },
  })

  return {
    ok: true as const,
    order,
    requirements: exploded.requirements,
    shortfalls: exploded.requirements.filter((line) => line.shortfall > 0),
    estimatedCost: exploded.totalCost,
  }
}

/**
 * Completes a run: consumes inputs, produces output, and writes the stock
 * movements for both.
 *
 * Actuals may be supplied per component; anything not given falls back to the
 * plan. Costing is from what was actually consumed, so an overrun shows up in
 * the unit cost rather than being averaged away.
 */
export async function completeProductionOrder(input: {
  productionOrderId: string
  producedQty: number
  rejectedQty?: number
  actuals?: Array<{ componentId: string; actualQty?: number; batchCode?: string }>
  userId?: string
}) {
  const order = await db.productionOrder.findUnique({
    where: { id: input.productionOrderId },
    include: { consumptions: true, product: { select: { id: true, sku: true, name: true } } },
  })

  if (!order) {
    return { ok: false as const, error: "Production order not found" }
  }

  if (order.status === "completed") {
    return { ok: false as const, error: `${order.orderNumber} is already completed` }
  }

  if (order.status === "cancelled") {
    return { ok: false as const, error: `${order.orderNumber} was cancelled` }
  }

  if (!order.warehouseId) {
    return { ok: false as const, error: "This run has no warehouse, so stock cannot be moved" }
  }

  const actualById = new Map(
    (input.actuals || []).map((entry) => [entry.componentId, entry])
  )

  let materialCost = 0

  // Everything in one transaction: a half-finished run that consumed flour
  // without producing bases would silently corrupt stock.
  const result = await db.$transaction(async (tx) => {
    // Reset inside the callback. Prisma may retry an interactive transaction,
    // and a running total declared outside would accumulate across attempts,
    // inflating unit cost and the output's weighted-average cost.
    materialCost = 0

    for (const consumption of order.consumptions) {
      const override = actualById.get(consumption.componentId)
      const actualQty = override?.actualQty ?? consumption.plannedQty
      const totalCost = round(actualQty * consumption.unitCost, 2)
      materialCost += totalCost

      await tx.productionConsumption.update({
        where: { id: consumption.id },
        data: {
          actualQty,
          batchCode: override?.batchCode ?? consumption.batchCode,
          totalCost,
        },
      })

      const inventory = await tx.inventory.findFirst({
        where: { productId: consumption.componentId, warehouseId: order.warehouseId as string },
        select: { id: true, quantity: true },
      })

      // A component with no inventory row in this warehouse cannot be consumed.
      // The movement used to be written unconditionally while the decrement was
      // guarded, so the ledger recorded stock leaving that never existed.
      if (!inventory) {
        console.error(
          `Production ${order.orderNumber}: component ${consumption.componentId} has no inventory at the run's warehouse; consumption not recorded against stock.`
        )
        continue
      }

      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: { decrement: actualQty } },
      })

      // Draw the consumed lots down too, so backward traceability reflects
      // stock that actually moved rather than only what was claimed.
      const componentAllocation = await allocateFefo({
        productId: consumption.componentId,
        warehouseId: order.warehouseId as string,
        quantity: actualQty,
        client: tx,
      })

      if (componentAllocation.allocations.length) {
        await consumeBatches(componentAllocation.allocations, tx)
      }

      await tx.stockMovement.create({
        data: {
          productId: consumption.componentId,
          warehouseId: order.warehouseId as string,
          inventoryId: inventory.id,
          type: "out",
          quantity: -actualQty,
          reason: "Consumed in production",
          reference: order.orderNumber,
          referenceType: "production_order",
          unitCost: consumption.unitCost,
          totalCost,
          userId: input.userId || null,
        },
      })
    }

    const good = input.producedQty
    const unitCost = good > 0 ? round(materialCost / good, 4) : 0

    const outputInventory = await tx.inventory.findFirst({
      where: { productId: order.productId, warehouseId: order.warehouseId as string },
      select: { id: true, quantity: true, avgCost: true },
    })

    if (outputInventory) {
      // Weighted average across existing stock and this batch.
      const existingValue = outputInventory.quantity * outputInventory.avgCost
      const newQty = outputInventory.quantity + good
      const avgCost = newQty > 0 ? round((existingValue + materialCost) / newQty, 4) : unitCost

      await tx.inventory.update({
        where: { id: outputInventory.id },
        data: { quantity: { increment: good }, avgCost, lastCost: unitCost },
      })
    } else {
      await tx.inventory.create({
        data: {
          productId: order.productId,
          warehouseId: order.warehouseId as string,
          quantity: good,
          avgCost: unitCost,
          lastCost: unitCost,
        },
      })
    }

    await tx.stockMovement.create({
      data: {
        productId: order.productId,
        warehouseId: order.warehouseId as string,
        inventoryId: outputInventory?.id || null,
        type: "in",
        quantity: good,
        reason: "Produced",
        reference: order.orderNumber,
        referenceType: "production_order",
        unitCost,
        totalCost: materialCost,
        userId: input.userId || null,
      },
    })

    return tx.productionOrder.update({
      where: { id: order.id },
      data: {
        status: "completed",
        producedQty: good,
        rejectedQty: input.rejectedQty ?? 0,
        completedAt: new Date(),
        startedAt: order.startedAt ?? new Date(),
        materialCost: round(materialCost, 2),
        unitCost,
      },
    })
  })

  // Land the output as a tracked lot, outside the transaction so a batching
  // problem cannot roll back a completed run. Without this the batch code
  // stamped on the run means nothing once the stock is in the freezer, and a
  // recall cannot find what is still on hand.
  let batch: { batchCode: string; expiryDate: Date | null } | null = null

  if (order.batchCode && input.producedQty > 0) {
    const product = await db.product.findUnique({
      where: { id: order.productId },
      select: { shelfLifeDays: true },
    })

    const expiryDate =
      order.expiryDate ??
      (product?.shelfLifeDays
        ? new Date(Date.now() + product.shelfLifeDays * 86400_000)
        : null)

    try {
      await receiveBatch({
        productId: order.productId,
        warehouseId: order.warehouseId as string,
        batchCode: order.batchCode,
        quantity: input.producedQty,
        expiryDate,
        sourceType: "production",
        productionOrderId: order.id,
        unitCost: result.unitCost,
      })

      if (expiryDate && !order.expiryDate) {
        await db.productionOrder.update({
          where: { id: order.id },
          data: { expiryDate },
        })
      }

      batch = { batchCode: order.batchCode, expiryDate }
    } catch (error) {
      console.error(`Failed to record batch for ${order.orderNumber}:`, error)
    }
  }

  const planned = order.plannedQty
  const yieldPercent = planned > 0 ? round((input.producedQty / planned) * 100, 1) : 0

  return {
    ok: true as const,
    order: result,
    materialCost: round(materialCost, 2),
    unitCost: result.unitCost,
    yieldPercent,
    batch,
  }
}

/**
 * Recall traceability.
 *
 * Backward: given a finished batch, which supplier lots went into it.
 * Forward: given a supplier lot, which runs used it, and which customers
 * received the resulting product.
 *
 * The forward direction is the one that matters at 6pm on a Friday.
 */
export async function traceBatch(batchCode: string) {
  // Backward: this batch is a production output.
  const asOutput = await db.productionOrder.findMany({
    where: { batchCode },
    include: {
      product: { select: { name: true, sku: true } },
      consumptions: { include: { component: { select: { name: true, sku: true } } } },
    },
  })

  // Forward: this batch is a supplier lot we consumed.
  const asInput = await db.productionConsumption.findMany({
    where: { batchCode },
    include: {
      component: { select: { name: true, sku: true } },
      productionOrder: {
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
    },
  })

  const affectedProductIds = [
    ...new Set(asInput.map((row) => row.productionOrder.productId)),
  ]

  // Who received product made from this lot. Bounded to orders placed after the
  // earliest affected run, so an old customer is not implicated by coincidence.
  const earliestRun = asInput
    .map((row) => row.productionOrder.completedAt || row.productionOrder.createdAt)
    .sort((a, b) => a.getTime() - b.getTime())[0]

  const shipped = affectedProductIds.length
    ? await db.salesOrderItem.findMany({
        where: {
          productId: { in: affectedProductIds },
          order: {
            status: { notIn: ["draft", "cancelled"] },
            ...(earliestRun ? { orderDate: { gte: earliestRun } } : {}),
          },
        },
        select: {
          quantity: true,
          product: { select: { name: true, sku: true } },
          order: {
            select: {
              orderNumber: true,
              orderDate: true,
              status: true,
              customer: { select: { id: true, name: true, phone: true, email: true } },
            },
          },
        },
        take: 200,
      })
    : []

  return {
    batchCode,
    producedAs: asOutput.map((run) => ({
      orderNumber: run.orderNumber,
      product: run.product.name,
      producedQty: run.producedQty,
      completedAt: run.completedAt,
      madeFrom: run.consumptions.map((line) => ({
        component: line.component.name,
        sku: line.component.sku,
        qty: line.actualQty,
        supplierBatch: line.batchCode,
      })),
    })),
    usedIn: asInput.map((row) => ({
      orderNumber: row.productionOrder.orderNumber,
      product: row.productionOrder.product.name,
      component: row.component.name,
      qty: row.actualQty,
      completedAt: row.productionOrder.completedAt,
    })),
    shippedTo: shipped.map((line) => ({
      customer: line.order.customer.name,
      customerId: line.order.customer.id,
      phone: line.order.customer.phone,
      email: line.order.customer.email,
      orderNumber: line.order.orderNumber,
      orderDate: line.order.orderDate,
      product: line.product.name,
      quantity: line.quantity,
    })),
    customersAffected: [...new Set(shipped.map((line) => line.order.customer.name))],
  }
}
