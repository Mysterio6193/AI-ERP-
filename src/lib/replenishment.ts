/**
 * Working out what to buy, from what actually sells.
 *
 * Reordering was driven by a static `reorderLevel` per inventory row: a number
 * someone typed once. It knows nothing about how fast a product moves, nothing
 * about how long its supplier takes, and nothing about whether the stock will
 * last until a replacement lands. A line that sells eight units a day and one
 * that sells eight a month get the same threshold.
 *
 * The maths here is ordinary inventory science — demand rate, lead-time
 * demand, safety stock, days of cover — and every function is pure so the
 * arithmetic can be checked without a database.
 */

/** One line of real demand: what a customer ordered, and when. */
export interface DemandLine {
  productId: string
  quantity: number
  at: Date
}

export interface DemandRate {
  productId: string
  /** Units per day across the window. */
  perDay: number
  totalUnits: number
  orderCount: number
  /** How many distinct days had an order — a crude read on how lumpy it is. */
  activeDays: number
}

/**
 * Average daily demand over a window.
 *
 * Divided by the whole window rather than only the days with orders. A product
 * ordered once a fortnight genuinely consumes stock slowly, and averaging over
 * active days alone would make it look like a fast mover between orders.
 */
export function demandRates(lines: DemandLine[], windowDays: number): Map<string, DemandRate> {
  const rates = new Map<string, DemandRate>()
  if (windowDays <= 0) return rates

  const days = new Map<string, Set<string>>()

  for (const line of lines) {
    if (line.quantity <= 0) continue

    const existing = rates.get(line.productId) ?? {
      productId: line.productId,
      perDay: 0,
      totalUnits: 0,
      orderCount: 0,
      activeDays: 0,
    }

    existing.totalUnits += line.quantity
    existing.orderCount += 1
    rates.set(line.productId, existing)

    const key = line.at.toISOString().slice(0, 10)
    const seen = days.get(line.productId) ?? new Set<string>()
    seen.add(key)
    days.set(line.productId, seen)
  }

  for (const rate of rates.values()) {
    rate.perDay = Number((rate.totalUnits / windowDays).toFixed(3))
    rate.activeDays = days.get(rate.productId)?.size ?? 0
  }

  return rates
}

/**
 * How long the stock on hand will last.
 *
 * Infinite when nothing is selling — a product with stock and no demand is not
 * about to run out, and reporting "0 days" for it would bury the lines that
 * genuinely are.
 */
export function daysOfCover(available: number, perDay: number): number {
  if (perDay <= 0) return Number.POSITIVE_INFINITY
  if (available <= 0) return 0

  return Number((available / perDay).toFixed(1))
}

/**
 * The level at which an order has to be placed to avoid running out.
 *
 * Lead-time demand plus a safety buffer. Ordering at this point means the
 * delivery lands roughly as the buffer is reached, rather than after the shelf
 * is already empty — which is what a static threshold cannot express, because
 * it does not know the lead time.
 */
export function reorderPoint(perDay: number, leadTimeDays: number, safetyDays = 3): number {
  if (perDay <= 0) return 0

  return Math.ceil(perDay * (Math.max(leadTimeDays, 0) + Math.max(safetyDays, 0)))
}

export interface OrderSuggestion {
  /** Units to order, honouring the supplier's minimum. */
  quantity: number
  /** True when the minimum forced the quantity up. */
  raisedToMinimum: boolean
  /** Days of stock the suggested quantity buys. */
  coverDays: number
}

/**
 * How much to order.
 *
 * Enough to reach a target number of days of cover, counting what is already
 * on the way, then lifted to the supplier's minimum. Ordering below the
 * minimum is not an option the supplier offers, so a suggestion that ignores
 * it is a suggestion nobody can act on.
 */
export function suggestOrderQuantity(input: {
  available: number
  onOrder: number
  perDay: number
  targetCoverDays: number
  minOrderQty?: number
}): OrderSuggestion {
  const { available, onOrder, perDay, targetCoverDays } = input
  const minimum = Math.max(input.minOrderQty ?? 1, 1)

  if (perDay <= 0) {
    // Nothing is selling. Any order is a guess, so suggest the minimum only.
    return { quantity: 0, raisedToMinimum: false, coverDays: Number.POSITIVE_INFINITY }
  }

  const target = Math.ceil(perDay * targetCoverDays)
  const shortfall = Math.max(target - available - onOrder, 0)

  if (shortfall === 0) {
    return { quantity: 0, raisedToMinimum: false, coverDays: daysOfCover(available + onOrder, perDay) }
  }

  const quantity = Math.max(shortfall, minimum)

  return {
    quantity,
    raisedToMinimum: quantity > shortfall,
    coverDays: daysOfCover(available + onOrder + quantity, perDay),
  }
}

export type Urgency = "stockout" | "urgent" | "soon" | "ok"

/**
 * How worried to be.
 *
 * Judged against the lead time rather than a fixed number of days: running out
 * in five days is fine for a supplier who delivers tomorrow and a crisis for
 * one who takes a fortnight.
 */
export function urgencyOf(coverDays: number, leadTimeDays: number): Urgency {
  if (coverDays <= 0) return "stockout"
  if (!Number.isFinite(coverDays)) return "ok"

  const lead = Math.max(leadTimeDays, 0)

  // Will run out before a replacement could possibly arrive.
  if (coverDays <= lead) return "urgent"
  if (coverDays <= lead + 7) return "soon"

  return "ok"
}

/** The date stock is projected to run out, or null if it is not going to. */
export function projectedStockoutDate(available: number, perDay: number, from = new Date()): Date | null {
  const cover = daysOfCover(available, perDay)
  if (!Number.isFinite(cover)) return null

  return new Date(from.getTime() + cover * 86400000)
}

export interface ReplenishmentLine {
  productId: string
  sku: string
  name: string
  available: number
  onOrder: number
  perDay: number
  coverDays: number
  reorderPoint: number
  urgency: Urgency
  suggestedQty: number
  raisedToMinimum: boolean
  stockoutOn: Date | null
  supplierName: string | null
  supplierId: string | null
  leadTimeDays: number
  unitCost: number | null
}

/** Worst first: a stockout outranks everything, then the shortest cover. */
export function sortByUrgency(lines: ReplenishmentLine[]): ReplenishmentLine[] {
  const rank: Record<Urgency, number> = { stockout: 0, urgent: 1, soon: 2, ok: 3 }

  return [...lines].sort((a, b) => {
    if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency]
    return a.coverDays - b.coverDays
  })
}
