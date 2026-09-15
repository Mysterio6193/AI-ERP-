import type { SettingsOf } from "@/lib/settings/registry"

/**
 * Bin locations, and the order a picker walks them.
 *
 * Stock has lived in a free-text `location` string. That is enough to write on
 * a label and useless for everything else: it cannot be sorted into a sensible
 * walking order, it cannot hold a quantity, and nothing stops two people being
 * sent to the same shelf from opposite ends of the building.
 *
 * Pure, because the part that matters is arithmetic on codes and quantities.
 * The walking order especially: it is easy to write, easy to get subtly wrong,
 * and expensive to discover wrong — a picker finds out by walking.
 */

export type WarehouseSettings = SettingsOf<"warehouse">

export interface ParsedBin {
  zone: string
  aisle: number
  rack: number
  level: number
}

export interface Bin {
  id: string
  code: string
  zone: string
  aisle: number
  rack: number
  level: number
  /** Pickable bins are on the walking route; bulk and quarantine are not. */
  isPickable: boolean
  /** Null means no ceiling, which is different from a ceiling of zero. */
  maxUnits: number | null
  status: string
}

export interface BinStock {
  binId: string
  productId: string
  quantity: number
  /** Present for lot-tracked goods; drives FEFO when it is. */
  batchCode?: string | null
  expiryDate?: Date | null
}

export type ParseResult =
  | { ok: true; bin: ParsedBin }
  | { ok: false; error: string }

/**
 * Reads a bin code of the form ZONE-AISLE-RACK-LEVEL, e.g. `A-01-3-2`.
 *
 * Deliberately strict. A code that nearly parses is worse than one that does
 * not: it sorts into the wrong place on the route and sends someone to the
 * wrong end of the building, which looks like a stock error rather than a
 * typo.
 */
export function parseBinCode(code: string): ParseResult {
  const trimmed = code.trim().toUpperCase()

  if (!trimmed) {
    return { ok: false, error: "Bin code is empty" }
  }

  const parts = trimmed.split("-")

  if (parts.length !== 4) {
    return {
      ok: false,
      error: `"${trimmed}" is not ZONE-AISLE-RACK-LEVEL (for example A-01-3-2)`,
    }
  }

  const [zone, aisle, rack, level] = parts

  if (!/^[A-Z]{1,4}$/.test(zone)) {
    return { ok: false, error: `Zone "${zone}" must be 1-4 letters` }
  }

  for (const [label, value] of [
    ["aisle", aisle],
    ["rack", rack],
    ["level", level],
  ] as const) {
    if (!/^\d{1,3}$/.test(value)) {
      return { ok: false, error: `${label} "${value}" must be 1-3 digits` }
    }
  }

  return {
    ok: true,
    bin: {
      zone,
      aisle: Number(aisle),
      rack: Number(rack),
      level: Number(level),
    },
  }
}

/** Zero-pads so codes sort the same as a person would write them. */
export function formatBinCode(bin: ParsedBin) {
  return [
    bin.zone,
    String(bin.aisle).padStart(2, "0"),
    String(bin.rack),
    String(bin.level),
  ].join("-")
}

/**
 * A sortable position on the picking route.
 *
 * With serpentine on, odd aisles are walked in reverse, so a picker goes up
 * one aisle and back down the next instead of returning to the start of every
 * aisle. On a long run that is the difference between walking the length of
 * the building once per aisle and once per pair.
 *
 * Levels are ordered low to high within a rack regardless: reaching up and
 * down repeatedly at one location is a different cost from walking, and
 * carrying a heavy pick up a ladder is worse.
 */
export function pickSequenceFor(bin: ParsedBin, settings: WarehouseSettings): number {
  const zoneRank = zoneToNumber(bin.zone)
  const rack = settings.serpentinePicking && bin.aisle % 2 === 1
    ? settings.maxRacksPerAisle - bin.rack
    : bin.rack

  // Packed into one number so a database sort reproduces the walking order
  // without re-deriving it per row.
  //
  // Each field gets its own three digits, because the code grammar allows
  // three: at 100-per-rack, bin A-02-100-1 packs to the same number as a bin
  // in aisle 3 and the picker is sent to the wrong aisle. Four-letter zones
  // push the total past a 32-bit integer, so the stored column is a double
  // (exact for integers well beyond anything a warehouse can produce).
  return (
    zoneRank * 1_000_000_000 +
    bin.aisle * 1_000_000 +
    Math.max(rack, 0) * 1_000 +
    bin.level
  )
}

/** "A" → 1, "B" → 2, "AA" → 27. Keeps multi-letter zones ordered sensibly. */
function zoneToNumber(zone: string) {
  let value = 0
  for (const char of zone) {
    value = value * 26 + (char.charCodeAt(0) - 64)
  }
  return value
}

export interface PickTask {
  productId: string
  binId: string
  bin: Bin
  quantity: number
  batchCode?: string | null
}

/**
 * Puts a set of picks into walking order.
 *
 * Sorting by bin code alone would send a picker back and forth: "A-10-…"
 * sorts before "A-2-…" as text, and the zero padding only helps if every code
 * was written with it.
 */
export function orderPickPath(tasks: PickTask[], settings: WarehouseSettings): PickTask[] {
  return [...tasks].sort(
    (a, b) =>
      pickSequenceFor(a.bin, settings) - pickSequenceFor(b.bin, settings)
  )
}

export interface PutawayCandidate {
  bin: Bin
  /** Units already in the bin. */
  used: number
  /** True when this bin already holds the same product. */
  holdsSameProduct: boolean
}

export type PutawayResult =
  | { ok: true; binId: string; reason: string }
  | { ok: false; error: string }

/**
 * Chooses where incoming stock should go.
 *
 * Consolidating onto a bin that already holds the product is preferred, and
 * not only for tidiness: split stock is the thing that makes a picker walk
 * twice for one line, and it is how a bin quietly runs down while the same
 * product sits two aisles away.
 */
export function choosePutawayBin(
  productId: string,
  quantity: number,
  candidates: PutawayCandidate[],
  settings: WarehouseSettings
): PutawayResult {
  if (quantity <= 0) {
    return { ok: false, error: "Nothing to put away" }
  }

  const usable = candidates.filter(
    (candidate) => candidate.bin.status === "active" && candidate.bin.isPickable
  )

  if (!usable.length) {
    return { ok: false, error: "No active pickable bin available" }
  }

  const fits = (candidate: PutawayCandidate) =>
    candidate.bin.maxUnits === null ||
    settings.allowBinOverfill ||
    candidate.used + quantity <= candidate.bin.maxUnits

  const sameProduct = usable
    .filter((candidate) => candidate.holdsSameProduct && fits(candidate))
    .sort((a, b) => pickSequenceFor(a.bin, settings) - pickSequenceFor(b.bin, settings))

  if (sameProduct.length) {
    return {
      ok: true,
      binId: sameProduct[0].bin.id,
      reason: `Consolidated onto ${sameProduct[0].bin.code}, which already holds this product`,
    }
  }

  const empty = usable
    .filter((candidate) => candidate.used === 0 && fits(candidate))
    .sort((a, b) => pickSequenceFor(a.bin, settings) - pickSequenceFor(b.bin, settings))

  if (empty.length) {
    return { ok: true, binId: empty[0].bin.id, reason: `Empty bin ${empty[0].bin.code}` }
  }

  const anyRoom = usable
    .filter(fits)
    .sort((a, b) => pickSequenceFor(a.bin, settings) - pickSequenceFor(b.bin, settings))

  if (anyRoom.length) {
    return { ok: true, binId: anyRoom[0].bin.id, reason: `Space in ${anyRoom[0].bin.code}` }
  }

  return {
    ok: false,
    error: `No bin has room for ${quantity} unit(s). Allow overfill in Warehouse settings, or free up space.`,
  }
}

export interface Allocation {
  binId: string
  binCode: string
  quantity: number
  batchCode?: string | null
}

export interface AllocationResult {
  allocations: Allocation[]
  /** What could not be found. Zero means the pick is fully covered. */
  shortfall: number
}

/**
 * Draws a quantity out of the bins holding it.
 *
 * With lot tracking, the earliest expiry goes first — the whole point of
 * knowing expiry dates. Where two bins are equal on expiry, the one earlier on
 * the walking route wins, so a single line does not send someone to both ends
 * of the building.
 *
 * Returns a shortfall rather than throwing: a short pick is an ordinary
 * warehouse event, and the picker needs the list of what *is* there.
 */
export function allocateFromBins(
  productId: string,
  quantity: number,
  stock: BinStock[],
  bins: Map<string, Bin>,
  settings: WarehouseSettings
): AllocationResult {
  if (quantity <= 0) {
    return { allocations: [], shortfall: 0 }
  }

  const available = stock
    .filter((row) => row.productId === productId && row.quantity > 0)
    .filter((row) => {
      const bin = bins.get(row.binId)
      return bin && bin.status === "active" && bin.isPickable
    })
    .sort((a, b) => {
      if (settings.pickStrategy === "fefo") {
        const aExpiry = a.expiryDate ? a.expiryDate.getTime() : Infinity
        const bExpiry = b.expiryDate ? b.expiryDate.getTime() : Infinity
        if (aExpiry !== bExpiry) return aExpiry - bExpiry
      }

      const binA = bins.get(a.binId)!
      const binB = bins.get(b.binId)!
      return pickSequenceFor(binA, settings) - pickSequenceFor(binB, settings)
    })

  const allocations: Allocation[] = []
  let remaining = quantity

  for (const row of available) {
    if (remaining <= 0) break

    const take = Math.min(row.quantity, remaining)
    const bin = bins.get(row.binId)!

    allocations.push({
      binId: row.binId,
      binCode: bin.code,
      quantity: take,
      batchCode: row.batchCode ?? null,
    })

    remaining -= take
  }

  return { allocations, shortfall: remaining }
}
