/**
 * What venues actually use, when RDM never sees the order.
 *
 * A manufacturer selling through distribution knows what its distributors buy
 * and nothing about what the venues do with it. That is the wrong way round:
 * the venue decides whether the product gets used, and the distributor mostly
 * follows. So an end-user account has to be able to hold what it uses even
 * though no order ever passes through this system.
 *
 * The data is knowledge, not transaction — a rep is told on a visit, a
 * distributor mentions it, a conversation at a trade show. That makes staleness
 * the central problem: a usage figure nobody has checked in a year is a rumour,
 * and the one thing worse than not knowing is believing something that stopped
 * being true. Every figure here is therefore reported with its age, and old
 * ones are labelled rather than quietly presented as current.
 */

/** After this, a figure is described as needing confirmation. */
export const STALE_AFTER_DAYS = 120

/** After this, it is not worth repeating without checking. */
export const VERY_STALE_AFTER_DAYS = 365

export type UsageStatus = "using" | "trialling" | "lapsed" | "lost_to_competitor"

export const USAGE_STATUS_LABEL: Record<UsageStatus, string> = {
  using: "Using",
  trialling: "Trialling",
  lapsed: "Stopped using",
  lost_to_competitor: "Lost to a competitor",
}

export function daysSince(date: Date | null | undefined, now = new Date()): number | null {
  if (!date) return null

  return Math.floor((now.getTime() - date.getTime()) / 86400000)
}

export type Confidence = "confirmed" | "ageing" | "stale" | "unconfirmed"

/**
 * How much to trust a figure, from its age alone.
 *
 * Deliberately not a score. A number implies a precision this does not have —
 * what a reader needs is whether to repeat it to a customer.
 */
export function confidenceOf(lastConfirmedAt: Date | null | undefined, now = new Date()): Confidence {
  const days = daysSince(lastConfirmedAt, now)

  if (days === null) return "unconfirmed"
  if (days >= VERY_STALE_AFTER_DAYS) return "stale"
  if (days >= STALE_AFTER_DAYS) return "ageing"

  return "confirmed"
}

/** Said next to a figure so nobody quotes a rumour as a fact. */
export function describeConfidence(lastConfirmedAt: Date | null | undefined, now = new Date()): string {
  const days = daysSince(lastConfirmedAt, now)

  switch (confidenceOf(lastConfirmedAt, now)) {
    case "unconfirmed":
      return "never confirmed"
    case "stale":
      return `last confirmed over a year ago — check before relying on it`
    case "ageing":
      return `last confirmed ${Math.floor((days as number) / 30)} months ago`
    default:
      return days === 0 ? "confirmed today" : `confirmed ${days} days ago`
  }
}

/** Normalise a usage figure to a weekly rate so two venues can be compared. */
export function weeklyRate(estimatedQty: number | null | undefined, period: string): number | null {
  if (estimatedQty === null || estimatedQty === undefined) return null

  if (period === "month") return estimatedQty / 4.345
  if (period === "week") return estimatedQty

  return null
}

export interface UsageRow {
  customerId: string
  customerName: string
  productId: string
  productName: string
  estimatedQty: number | null
  period: string
  unit: string | null
  status: string
  viaDistributorId: string | null
  viaDistributorName: string | null
  lastConfirmedAt: Date | null
}

export interface PullThrough {
  productId: string
  productName: string
  /** Venues recorded as using or trialling it. */
  activeVenues: number
  lostVenues: number
  /** Weekly demand implied by what venues say they use. */
  impliedWeekly: number | null
  /** Venues whose figure is too old to rely on. */
  needConfirming: number
  /** Which distributors this reaches venues through. */
  distributors: Array<{ id: string | null; name: string; venues: number }>
}

/**
 * Demand implied by venues, summarised per product.
 *
 * This is the number a two-tier manufacturer cannot otherwise get: what the
 * market is using, as against what the distributors happened to order. When a
 * distributor's orders fall and this does not, the product is still being used
 * and the distributor is running down stock or has switched supplier — a
 * different problem with a different answer, and indistinguishable from a real
 * demand drop without it.
 */
export function summarisePullThrough(rows: UsageRow[], now = new Date()): PullThrough[] {
  const byProduct = new Map<string, PullThrough & { distributorMap: Map<string, { name: string; venues: number }> }>()

  for (const row of rows) {
    const entry =
      byProduct.get(row.productId) ??
      {
        productId: row.productId,
        productName: row.productName,
        activeVenues: 0,
        lostVenues: 0,
        impliedWeekly: null,
        needConfirming: 0,
        distributors: [],
        distributorMap: new Map<string, { name: string; venues: number }>(),
      }

    const active = row.status === "using" || row.status === "trialling"

    if (active) {
      entry.activeVenues += 1

      const weekly = weeklyRate(row.estimatedQty, row.period)
      if (weekly !== null) entry.impliedWeekly = (entry.impliedWeekly ?? 0) + weekly

      const key = row.viaDistributorId ?? "unknown"
      const distributor = entry.distributorMap.get(key) ?? {
        name: row.viaDistributorName ?? "Not recorded",
        venues: 0,
      }
      distributor.venues += 1
      entry.distributorMap.set(key, distributor)
    } else {
      entry.lostVenues += 1
    }

    // Only counted for venues still using it — a figure on an account that
    // stopped is not something anyone needs to go and re-check.
    if (active && confidenceOf(row.lastConfirmedAt, now) !== "confirmed") {
      entry.needConfirming += 1
    }

    byProduct.set(row.productId, entry)
  }

  return [...byProduct.values()]
    .map((entry) => ({
      productId: entry.productId,
      productName: entry.productName,
      activeVenues: entry.activeVenues,
      lostVenues: entry.lostVenues,
      impliedWeekly: entry.impliedWeekly === null ? null : Math.round(entry.impliedWeekly * 10) / 10,
      needConfirming: entry.needConfirming,
      distributors: [...entry.distributorMap.entries()]
        .map(([id, value]) => ({ id: id === "unknown" ? null : id, name: value.name, venues: value.venues }))
        .sort((a, b) => b.venues - a.venues),
    }))
    .sort((a, b) => b.activeVenues - a.activeVenues)
}
