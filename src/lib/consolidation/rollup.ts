/**
 * Rolling several entities up into one set of figures.
 *
 * The app lets you switch entity and see that entity. It has never been able
 * to show the group, and the reason a naive sum is not good enough is that two
 * things go wrong quietly:
 *
 *   1. Entities keep their books in their own currency. Adding an Australian
 *      entity's dollars to a New Zealand one's is adding two different units
 *      and getting a number that looks like money.
 *
 *   2. A sale from one group entity to another is revenue for the seller and
 *      cost for the buyer, and neither is revenue for the group — nothing came
 *      in from outside it. Left in, moving stock between your own warehouses
 *      inflates group turnover, which is the oldest way to flatter a set of
 *      consolidated accounts by accident.
 *
 * A third failure is the one this module is most careful about: an entity
 * whose currency cannot be translated must not be silently dropped. A smaller
 * group total that looks complete is worse than one that says what is missing.
 *
 * Pure. Rates and rows are passed in.
 */

export interface EntityFigures {
  companyId: string
  name: string
  /** The currency this entity keeps its books in. */
  currency: string
  revenue: number
  cost: number
  /** Money owed to this entity. */
  receivable: number
  /** Money this entity owes. */
  payable: number
  /** Stock at cost. */
  inventoryValue: number
  orderCount: number
}

/**
 * A transaction between two group entities.
 *
 * `amount` is in `currency`, which is the selling entity's own.
 */
export interface IntercompanyEntry {
  sellerCompanyId: string
  buyerCompanyId: string
  amount: number
  currency: string
  reference?: string
}

export interface TranslatedEntity extends EntityFigures {
  /** Rate applied to reach the presentation currency. */
  rate: number
  revenuePresented: number
  costPresented: number
  receivablePresented: number
  payablePresented: number
  inventoryValuePresented: number
}

export interface ConsolidationTotals {
  revenue: number
  cost: number
  grossProfit: number
  receivable: number
  payable: number
  inventoryValue: number
  orderCount: number
}

export interface ConsolidationResult {
  presentationCurrency: string
  entities: TranslatedEntity[]
  /** Entities left out because no rate reached the presentation currency. */
  untranslated: Array<{ companyId: string; name: string; currency: string; reason: string }>
  /** What was removed as internal to the group, in the presentation currency. */
  eliminated: { revenue: number; cost: number; entries: number }
  /** Straight sum of what was translated, before eliminations. */
  combined: ConsolidationTotals
  /** After eliminations. The figure that means anything outside the group. */
  consolidated: ConsolidationTotals
  /** True when at least one entity could not be translated. */
  incomplete: boolean
}

/** Looks up the rate from an entity's currency to the presentation currency. */
export type RateResolver = (from: string, to: string) => number | null

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals
  const scaled = value * factor
  const rounded =
    scaled >= 0
      ? Math.round(scaled + Number.EPSILON * Math.abs(scaled))
      : -Math.round(-scaled + Number.EPSILON * Math.abs(scaled))
  return rounded / factor || 0
}

function emptyTotals(): ConsolidationTotals {
  return {
    revenue: 0,
    cost: 0,
    grossProfit: 0,
    receivable: 0,
    payable: 0,
    inventoryValue: 0,
    orderCount: 0,
  }
}

/**
 * Consolidates a group.
 *
 * `eliminateIntercompany` is configurable rather than assumed because the two
 * views answer different questions: combined turnover is what the entities did
 * between them, consolidated turnover is what the group did with the outside
 * world. A finance team wants the second; an operations manager comparing
 * sites often wants the first.
 */
export function consolidate(
  entities: EntityFigures[],
  presentationCurrency: string,
  rateFor: RateResolver,
  intercompany: IntercompanyEntry[] = [],
  options: { eliminateIntercompany?: boolean } = {}
): ConsolidationResult {
  const presentation = presentationCurrency.toUpperCase()
  const eliminate = options.eliminateIntercompany !== false

  const translated: TranslatedEntity[] = []
  const untranslated: ConsolidationResult["untranslated"] = []

  for (const entity of entities) {
    const from = entity.currency.toUpperCase()
    const rate = from === presentation ? 1 : rateFor(from, presentation)

    if (rate === null || !Number.isFinite(rate) || rate <= 0) {
      untranslated.push({
        companyId: entity.companyId,
        name: entity.name,
        currency: from,
        reason: `No rate from ${from} to ${presentation}`,
      })
      continue
    }

    translated.push({
      ...entity,
      rate,
      revenuePresented: round(entity.revenue * rate),
      costPresented: round(entity.cost * rate),
      receivablePresented: round(entity.receivable * rate),
      payablePresented: round(entity.payable * rate),
      inventoryValuePresented: round(entity.inventoryValue * rate),
    })
  }

  const combined = emptyTotals()
  for (const entity of translated) {
    combined.revenue += entity.revenuePresented
    combined.cost += entity.costPresented
    combined.receivable += entity.receivablePresented
    combined.payable += entity.payablePresented
    combined.inventoryValue += entity.inventoryValuePresented
    combined.orderCount += entity.orderCount
  }
  combined.revenue = round(combined.revenue)
  combined.cost = round(combined.cost)
  combined.receivable = round(combined.receivable)
  combined.payable = round(combined.payable)
  combined.inventoryValue = round(combined.inventoryValue)
  combined.grossProfit = round(combined.revenue - combined.cost)

  // Only entries where both sides are entities we actually translated. A sale
  // to a group entity that was itself dropped for want of a rate was never
  // added to the total, so removing it again would understate the group twice.
  const inScope = new Set(translated.map((entity) => entity.companyId))

  let eliminatedRevenue = 0
  let entries = 0

  if (eliminate) {
    for (const entry of intercompany) {
      if (!inScope.has(entry.sellerCompanyId) || !inScope.has(entry.buyerCompanyId)) {
        continue
      }

      // A company selling to itself is not an intercompany transaction; it is
      // a data error, and removing it would take real revenue out.
      if (entry.sellerCompanyId === entry.buyerCompanyId) {
        continue
      }

      const from = entry.currency.toUpperCase()
      const rate = from === presentation ? 1 : rateFor(from, presentation)

      if (rate === null || !Number.isFinite(rate) || rate <= 0) {
        continue
      }

      eliminatedRevenue += entry.amount * rate
      entries += 1
    }
  }

  eliminatedRevenue = round(eliminatedRevenue)

  const consolidated: ConsolidationTotals = {
    // The seller's revenue and the buyer's cost are the same transaction seen
    // from both ends, so the same figure comes off both sides and gross profit
    // is unchanged — which is the point: an internal transfer creates no group
    // profit.
    revenue: round(combined.revenue - eliminatedRevenue),
    cost: round(combined.cost - eliminatedRevenue),
    grossProfit: combined.grossProfit,
    // Receivables and payables between group entities net to zero at group
    // level too, but they are only removable where both sides are known;
    // matching them needs the open balances, not the sales, so they are left
    // alone rather than guessed at.
    receivable: combined.receivable,
    payable: combined.payable,
    inventoryValue: combined.inventoryValue,
    orderCount: combined.orderCount,
  }

  return {
    presentationCurrency: presentation,
    entities: translated,
    untranslated,
    eliminated: { revenue: eliminatedRevenue, cost: eliminatedRevenue, entries },
    combined,
    consolidated,
    incomplete: untranslated.length > 0,
  }
}

/**
 * Each entity's share of the group, largest first.
 *
 * Shares are of the combined figure rather than the consolidated one: an
 * entity's contribution is what it sold, and apportioning an elimination that
 * belongs to a pair of entities across all of them would be arbitrary.
 */
export function contributionShares(result: ConsolidationResult) {
  const total = result.combined.revenue

  return result.entities
    .map((entity) => ({
      companyId: entity.companyId,
      name: entity.name,
      revenue: entity.revenuePresented,
      share: total === 0 ? 0 : round((entity.revenuePresented / total) * 100, 1),
    }))
    .sort((a, b) => b.revenue - a.revenue)
}
