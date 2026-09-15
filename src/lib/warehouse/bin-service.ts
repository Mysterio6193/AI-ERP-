import { db } from "@/lib/db"
import { getSettings } from "@/lib/settings/service"
import {
  allocateFromBins,
  choosePutawayBin,
  formatBinCode,
  parseBinCode,
  pickSequenceFor,
  type Bin,
  type BinStock,
  type WarehouseSettings,
} from "@/lib/warehouse/bins"

/**
 * Bins, against the database.
 *
 * The decisions — walking order, where to put stock, which lot to draw down —
 * live in `bins.ts` and are pure. This file is the part that reads rows, wraps
 * the writes in transactions, and keeps the bin-level quantities in step with
 * the warehouse-level `Inventory` balance every other module already reads.
 */

/**
 * Settings that refuse an action or move stock are read uncached.
 *
 * `getSettings` memoises for a few seconds per module instance, which is right
 * for rendering and wrong here: an operator who turns off overfill and
 * immediately receives a pallet would otherwise get the old answer, and the
 * pallet would be in the bin before the setting took effect.
 */
function liveSettings(companyId: string | null) {
  return getSettings("warehouse", { companyId, skipCache: true })
}

type BinRow = {
  id: string
  code: string
  zone: string
  aisle: number
  rack: number
  level: number
  isPickable: boolean
  maxUnits: number | null
  status: string
}

function toBin(row: BinRow): Bin {
  return {
    id: row.id,
    code: row.code,
    zone: row.zone,
    aisle: row.aisle,
    rack: row.rack,
    level: row.level,
    isPickable: row.isPickable,
    maxUnits: row.maxUnits,
    status: row.status,
  }
}

export type CreateBinResult =
  | { ok: true; id: string; code: string }
  | { ok: false; error: string }

/**
 * Adds one bin.
 *
 * The code is parsed rather than stored as typed: a bin whose code does not
 * decompose has no position on the route, and discovering that at picking time
 * means someone is already standing in the wrong aisle.
 */
export async function createBin(
  warehouseId: string,
  code: string,
  options: { isPickable?: boolean; maxUnits?: number | null; status?: string; companyId?: string | null } = {}
): Promise<CreateBinResult> {
  const parsed = parseBinCode(code)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error }
  }

  const settings = await liveSettings(options.companyId ?? null)
  const normalised = formatBinCode(parsed.bin)

  const existing = await db.binLocation.findUnique({
    where: { warehouseId_code: { warehouseId, code: normalised } },
    select: { id: true },
  })

  if (existing) {
    return { ok: false, error: `Bin ${normalised} already exists in this warehouse` }
  }

  const created = await db.binLocation.create({
    data: {
      warehouseId,
      code: normalised,
      zone: parsed.bin.zone,
      aisle: parsed.bin.aisle,
      rack: parsed.bin.rack,
      level: parsed.bin.level,
      pickSequence: pickSequenceFor(parsed.bin, settings),
      isPickable: options.isPickable ?? true,
      maxUnits: options.maxUnits ?? null,
      status: options.status ?? "active",
    },
    select: { id: true, code: true },
  })

  return { ok: true, id: created.id, code: created.code }
}

/**
 * Creates a block of bins in one go.
 *
 * Nobody numbers four hundred shelves by hand, and a warehouse that has to
 * will keep using the free-text field instead. Existing codes are skipped
 * rather than failing the run, so this can be re-run after adding an aisle.
 */
export async function generateBins(
  warehouseId: string,
  spec: {
    zone: string
    aisles: number
    racksPerAisle: number
    levels: number
    maxUnits?: number | null
  },
  companyId: string | null = null
): Promise<{ created: number; skipped: number; error?: string }> {
  if (!/^[A-Z]{1,4}$/.test(spec.zone.toUpperCase())) {
    return { created: 0, skipped: 0, error: "Zone must be 1-4 letters" }
  }

  for (const [label, value] of [
    ["aisles", spec.aisles],
    ["racks per aisle", spec.racksPerAisle],
    ["levels", spec.levels],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 999) {
      return { created: 0, skipped: 0, error: `${label} must be between 1 and 999` }
    }
  }

  const settings = await liveSettings(companyId)
  const zone = spec.zone.toUpperCase()

  const rows: Array<{
    warehouseId: string
    code: string
    zone: string
    aisle: number
    rack: number
    level: number
    pickSequence: number
    maxUnits: number | null
  }> = []

  for (let aisle = 1; aisle <= spec.aisles; aisle++) {
    for (let rack = 1; rack <= spec.racksPerAisle; rack++) {
      for (let level = 1; level <= spec.levels; level++) {
        const bin = { zone, aisle, rack, level }
        rows.push({
          warehouseId,
          code: formatBinCode(bin),
          zone,
          aisle,
          rack,
          level,
          pickSequence: pickSequenceFor(bin, settings),
          maxUnits: spec.maxUnits ?? null,
        })
      }
    }
  }

  const result = await db.binLocation.createMany({ data: rows, skipDuplicates: true })

  return { created: result.count, skipped: rows.length - result.count }
}

/**
 * Recomputes every stored walking position in a warehouse.
 *
 * The sequence is a function of the serpentine setting and the aisle length,
 * so changing either leaves every row stale. Silently stale is the bad case:
 * the route still looks like a route, it is just the wrong one.
 */
export async function resequenceBins(warehouseId: string, companyId: string | null = null) {
  const settings = await liveSettings(companyId)
  const bins = await db.binLocation.findMany({
    where: { warehouseId },
    select: { id: true, zone: true, aisle: true, rack: true, level: true },
  })

  await db.$transaction(
    bins.map((bin) =>
      db.binLocation.update({
        where: { id: bin.id },
        data: { pickSequence: pickSequenceFor(bin, settings) },
      })
    )
  )

  return { resequenced: bins.length }
}

export type PutawayOutcome =
  | { ok: true; binId: string; binCode: string; reason: string; quantity: number }
  | { ok: false; error: string }

/**
 * Receives stock into a bin, choosing one when the caller does not name it.
 *
 * Writes the bin quantity and nothing else: the warehouse-level `Inventory`
 * balance is moved by whatever caused the receipt (a purchase receipt, a
 * production run), and double-counting it here would show the stock twice.
 */
export async function putaway(
  warehouseId: string,
  productId: string,
  quantity: number,
  options: { binId?: string | null; batchId?: string | null; companyId?: string | null } = {}
): Promise<PutawayOutcome> {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantity must be greater than zero" }
  }

  const settings = await liveSettings(options.companyId ?? null)

  const batch = options.batchId
    ? await db.inventoryBatch.findUnique({
        where: { id: options.batchId },
        select: { id: true, batchCode: true },
      })
    : null

  if (options.batchId && !batch) {
    return { ok: false, error: "That lot no longer exists" }
  }

  const batchCode = batch?.batchCode ?? ""

  const bins = await db.binLocation.findMany({
    where: { warehouseId },
    select: {
      id: true,
      code: true,
      zone: true,
      aisle: true,
      rack: true,
      level: true,
      isPickable: true,
      maxUnits: true,
      status: true,
      stock: { select: { productId: true, quantity: true } },
    },
  })

  if (!bins.length) {
    return { ok: false, error: "This warehouse has no bins yet" }
  }

  let chosenId = options.binId ?? null
  let reason = "Chosen by the operator"

  if (chosenId) {
    const named = bins.find((bin) => bin.id === chosenId)
    if (!named) {
      return { ok: false, error: "That bin is not in this warehouse" }
    }
    if (named.status !== "active" || !named.isPickable) {
      return { ok: false, error: `Bin ${named.code} is not available for putaway` }
    }

    const used = named.stock.reduce((sum, row) => sum + row.quantity, 0)
    if (named.maxUnits !== null && !settings.allowBinOverfill && used + quantity > named.maxUnits) {
      return {
        ok: false,
        error: `Bin ${named.code} holds ${used} of ${named.maxUnits}; ${quantity} more would overfill it`,
      }
    }
  } else {
    const decision = choosePutawayBin(
      productId,
      quantity,
      bins.map((bin) => ({
        bin: toBin(bin),
        used: bin.stock.reduce((sum, row) => sum + row.quantity, 0),
        holdsSameProduct: bin.stock.some((row) => row.productId === productId && row.quantity > 0),
      })),
      settings
    )

    if (!decision.ok) {
      return { ok: false, error: decision.error }
    }

    chosenId = decision.binId
    reason = decision.reason
  }

  const target = bins.find((bin) => bin.id === chosenId)!

  await db.binStock.upsert({
    where: { binId_productId_batchCode: { binId: target.id, productId, batchCode } },
    create: { binId: target.id, productId, batchId: batch?.id ?? null, batchCode, quantity },
    update: { quantity: { increment: quantity } },
  })

  return { ok: true, binId: target.id, binCode: target.code, reason, quantity }
}

export interface PickPlanLine {
  productId: string
  quantity: number
}

export interface PickPlanRow {
  productId: string
  binId: string
  binCode: string
  quantity: number
  batchCode: string | null
}

export interface PickPlan {
  rows: PickPlanRow[]
  shortfalls: Array<{ productId: string; shortfall: number }>
}

/**
 * Works out where a set of lines is picked from, in walking order.
 *
 * Allocation happens per line and the whole plan is sorted afterwards, so two
 * lines that happen to sit in the same aisle are visited together rather than
 * in the order they were typed onto the order.
 */
export async function planPick(
  warehouseId: string,
  lines: PickPlanLine[],
  companyId: string | null = null
): Promise<PickPlan> {
  const settings = await liveSettings(companyId)
  const productIds = [...new Set(lines.map((line) => line.productId))]

  const bins = await db.binLocation.findMany({
    where: { warehouseId },
    select: {
      id: true,
      code: true,
      zone: true,
      aisle: true,
      rack: true,
      level: true,
      isPickable: true,
      maxUnits: true,
      status: true,
      pickSequence: true,
      stock: {
        where: { productId: { in: productIds } },
        select: {
          binId: true,
          productId: true,
          quantity: true,
          batchCode: true,
          batch: { select: { expiryDate: true, status: true } },
        },
      },
    },
  })

  const binMap = new Map<string, Bin>(bins.map((bin) => [bin.id, toBin(bin)]))
  const sequence = new Map<string, number>(bins.map((bin) => [bin.id, bin.pickSequence]))

  const stock: BinStock[] = bins.flatMap((bin) =>
    bin.stock
      // Quarantined lots stay countable but must not be picked; a recall needs
      // the quantity to still exist somewhere.
      .filter((row) => !row.batch || row.batch.status === "available")
      .map((row) => ({
        binId: row.binId,
        productId: row.productId,
        quantity: row.quantity,
        batchCode: row.batchCode || null,
        expiryDate: row.batch?.expiryDate ?? null,
      }))
  )

  const rows: PickPlanRow[] = []
  const shortfalls: PickPlan["shortfalls"] = []

  for (const line of lines) {
    const result = allocateFromBins(line.productId, line.quantity, stock, binMap, settings)

    for (const allocation of result.allocations) {
      rows.push({
        productId: line.productId,
        binId: allocation.binId,
        binCode: allocation.binCode,
        quantity: allocation.quantity,
        batchCode: allocation.batchCode ?? null,
      })

      // Draw the plan's own allocations down as we go, so two lines for the
      // same product are not both sent to the same 10 units.
      const row = stock.find(
        (candidate) =>
          candidate.binId === allocation.binId &&
          candidate.productId === line.productId &&
          (candidate.batchCode ?? null) === (allocation.batchCode ?? null)
      )
      if (row) row.quantity -= allocation.quantity
    }

    if (result.shortfall > 0) {
      shortfalls.push({ productId: line.productId, shortfall: result.shortfall })
    }
  }

  rows.sort((a, b) => (sequence.get(a.binId) ?? 0) - (sequence.get(b.binId) ?? 0))

  return { rows, shortfalls }
}

/**
 * Takes stock out of a bin after it has been picked.
 *
 * Refuses to go negative. A bin count that reads below zero is not a
 * conservative estimate, it is a number nobody can reconcile against a shelf.
 */
export async function consumeFromBin(
  binId: string,
  productId: string,
  quantity: number,
  batchCode = ""
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantity must be greater than zero" }
  }

  return db.$transaction(async (tx) => {
    const row = await tx.binStock.findUnique({
      where: { binId_productId_batchCode: { binId, productId, batchCode } },
      select: { id: true, quantity: true, bin: { select: { code: true } } },
    })

    if (!row) {
      return { ok: false as const, error: "Nothing of that product in that bin" }
    }

    if (row.quantity < quantity) {
      return {
        ok: false as const,
        error: `Bin ${row.bin.code} holds ${row.quantity}, not ${quantity}`,
      }
    }

    const updated = await tx.binStock.update({
      where: { id: row.id },
      data: { quantity: { decrement: quantity } },
      select: { quantity: true },
    })

    // An empty row is noise on every subsequent read, and an empty bin is the
    // thing putaway wants to find.
    if (updated.quantity === 0) {
      await tx.binStock.delete({ where: { id: row.id } })
    }

    return { ok: true as const, remaining: updated.quantity }
  })
}

export interface BinOccupancy {
  id: string
  code: string
  zone: string
  status: string
  isPickable: boolean
  maxUnits: number | null
  used: number
  lines: Array<{ productId: string; sku: string; name: string; quantity: number; batchCode: string | null }>
}

/** Bins in walking order, with what is in them. */
export async function listBins(warehouseId: string, options: { zone?: string } = {}) {
  const bins = await db.binLocation.findMany({
    where: { warehouseId, ...(options.zone ? { zone: options.zone.toUpperCase() } : {}) },
    orderBy: { pickSequence: "asc" },
    select: {
      id: true,
      code: true,
      zone: true,
      status: true,
      isPickable: true,
      maxUnits: true,
      stock: {
        select: {
          productId: true,
          quantity: true,
          batchCode: true,
          product: { select: { sku: true, name: true } },
        },
      },
    },
  })

  return bins.map<BinOccupancy>((bin) => ({
    id: bin.id,
    code: bin.code,
    zone: bin.zone,
    status: bin.status,
    isPickable: bin.isPickable,
    maxUnits: bin.maxUnits,
    used: bin.stock.reduce((sum, row) => sum + row.quantity, 0),
    lines: bin.stock.map((row) => ({
      productId: row.productId,
      sku: row.product.sku,
      name: row.product.name,
      quantity: row.quantity,
      batchCode: row.batchCode || null,
    })),
  }))
}

export type { WarehouseSettings }
