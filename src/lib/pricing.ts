import type { SettingsOf } from "@/lib/settings/registry"

/**
 * What a line actually costs.
 *
 * `PriceList`, `PriceListItem` and `DiscountRule` are seeded, displayed on
 * `/pricing`, and assigned to 25 customers — and nothing ever priced a line
 * with them. Every order used `product.wholesalePrice`, so a distributor on a
 * 12% contract list was invoiced at list price.
 *
 * **`price` is the pre-discount unit price for its quantity band.**
 * `discountPercent` then `discountFlat` apply on top of it, in that order.
 * The question was open because `PriceListItem` carries all three; today no
 * seeded item uses the discount columns, so this reading charges exactly the
 * stored `price` and changes nothing, while giving those columns a meaning.
 *
 * Pure: the caller fetches candidates and passes settings in. Nothing here
 * touches the database, so it is testable and the dry-run report can price
 * historical orders without writing anything.
 */

export type PriceSource =
  | "override"
  | "priceList"
  | "defaultPriceList"
  | "wholesale"
  | "retail"

export interface CandidatePriceItem {
  id: string
  priceListId: string
  price: number
  minQty: number
  maxQty: number | null
  discountPercent: number
  discountFlat: number
}

export interface CandidatePriceList {
  id: string
  isDefault: boolean
  /** wholesale | retail | contract | promotional */
  type: string
  status: string
  validFrom: Date | null
  validTo: Date | null
  createdAt: Date
}

export interface ResolvePriceInput {
  quantity: number
  /** An explicit unit price typed by a person. Beats everything. */
  unitPriceOverride?: number | null
  product: { wholesalePrice: number; retailPrice?: number | null }
  customer?: { priceListId?: string | null; customerType?: string | null } | null
  /** Lists in play, keyed by id via `lists`; items already filtered to this product. */
  items?: CandidatePriceItem[]
  lists?: CandidatePriceList[]
  asOf?: Date
}

export interface ResolvedPrice {
  unitPrice: number
  source: PriceSource
  /** Persist this — without it "why was this line $4.20?" is unanswerable. */
  priceListItemId: string | null
}

function isUsable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function roundTo(value: number, dp: number) {
  const factor = 10 ** dp
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/** A list is usable only while active and inside its validity window. */
export function isListActive(list: CandidatePriceList, asOf: Date) {
  if (list.status !== "active") return false
  if (list.validFrom && asOf < list.validFrom) return false
  if (list.validTo && asOf > list.validTo) return false
  return true
}

/**
 * The band covering `quantity`.
 *
 * Bands do not overlap in the seeded data, but nothing in the schema prevents
 * it — the unique key is `[priceListId, productId, minQty]`, so two bands can
 * both cover a quantity. The tightest `minQty` wins, which makes the choice
 * deterministic rather than dependent on row order.
 */
function bandFor(items: CandidatePriceItem[], quantity: number, honourBands: boolean) {
  const matching = items.filter((item) => {
    if (!honourBands) {
      // Volume breaks disabled: only the base band applies.
      return item.minQty <= 1
    }
    return quantity >= item.minQty && (item.maxQty === null || quantity <= item.maxQty)
  })

  if (matching.length === 0) return null

  return matching.reduce((best, item) => (item.minQty > best.minQty ? item : best))
}

/**
 * Pick the default list for a customer who has none assigned.
 *
 * More than one list can carry `isDefault` — company `cmt4nvrx` currently has
 * two. Preferring the list whose `type` matches the customer's own type makes
 * a retail stockist land on retail pricing rather than trade, and the oldest
 * list breaks any remaining tie so the same customer is never priced two ways
 * on two requests.
 */
export function pickDefaultList(
  lists: CandidatePriceList[],
  customerType: string | null | undefined,
  asOf: Date
) {
  const defaults = lists.filter((list) => list.isDefault && isListActive(list, asOf))

  if (defaults.length === 0) return null

  const typed = customerType
    ? defaults.filter((list) => list.type.toLowerCase() === customerType.toLowerCase())
    : []

  const pool = typed.length > 0 ? typed : defaults

  return pool.reduce((oldest, list) => (list.createdAt < oldest.createdAt ? list : oldest))
}

function applyItemDiscounts(item: CandidatePriceItem, settings: SettingsOf<"pricing">) {
  const cappedPercent = Math.min(
    Math.max(item.discountPercent || 0, 0),
    settings.maxLineDiscountPercent
  )

  const afterPercent = item.price * (1 - cappedPercent / 100)
  const afterFlat = afterPercent - (item.discountFlat || 0)

  // A discount must never invert the price into a credit.
  return Math.max(afterFlat, 0)
}

export function resolveLinePrice(
  input: ResolvePriceInput,
  settings: SettingsOf<"pricing">
): ResolvedPrice {
  const asOf = input.asOf ?? new Date()

  const fallbackPrice = () => {
    const retail = input.product.retailPrice
    if (settings.fallback === "retailPrice" && isUsable(retail)) {
      return { unitPrice: retail, source: "retail" as const, priceListItemId: null }
    }
    return {
      unitPrice: input.product.wholesalePrice,
      source: "wholesale" as const,
      priceListItemId: null,
    }
  }

  const finish = (resolved: ResolvedPrice): ResolvedPrice => ({
    ...resolved,
    unitPrice: roundTo(resolved.unitPrice, settings.roundPricesTo),
  })

  if (settings.allowManualPriceOverride && isUsable(input.unitPriceOverride)) {
    return finish({
      unitPrice: input.unitPriceOverride,
      source: "override",
      priceListItemId: null,
    })
  }

  // The kill switch. Off by default, so landing this changes no price at all
  // until someone deliberately turns it on after reading the dry-run report.
  if (!settings.enablePriceLists) {
    return finish(fallbackPrice())
  }

  const lists = input.lists ?? []
  const items = input.items ?? []
  const listById = new Map(lists.map((list) => [list.id, list]))

  const usableItems = (listId: string) =>
    items.filter((item) => {
      const list = listById.get(item.priceListId)
      return item.priceListId === listId && list && isListActive(list, asOf)
    })

  const assignedListId = input.customer?.priceListId

  if (assignedListId) {
    const item = bandFor(usableItems(assignedListId), input.quantity, settings.volumeBreaks)

    if (item) {
      return finish({
        unitPrice: applyItemDiscounts(item, settings),
        source: "priceList",
        priceListItemId: item.id,
      })
    }
  }

  if (settings.useDefaultPriceListWhenCustomerHasNone && !assignedListId) {
    const defaultList = pickDefaultList(lists, input.customer?.customerType, asOf)

    if (defaultList) {
      const item = bandFor(usableItems(defaultList.id), input.quantity, settings.volumeBreaks)

      if (item) {
        return finish({
          unitPrice: applyItemDiscounts(item, settings),
          source: "defaultPriceList",
          priceListItemId: item.id,
        })
      }
    }
  }

  return finish(fallbackPrice())
}

/* ------------------------------------------------------------------------ */
/* Order-level discount rules                                               */
/* ------------------------------------------------------------------------ */

export interface CandidateDiscountRule {
  id: string
  name: string
  /** order_total | line_item | customer_group */
  type: string
  /** percentage | flat */
  discountType: string
  discountValue: number
  minOrderValue: number | null
  minQty: number | null
  /** JSON array of customer ids, or null for everyone. */
  customerIds: string | null
  requiresApproval: boolean
  approvalThreshold: number | null
  validFrom: Date | null
  validTo: Date | null
  status: string
}

export interface AppliedDiscount {
  ruleId: string
  name: string
  amount: number
  requiresApproval: boolean
}

export interface OrderDiscountResult {
  discountAmount: number
  applied: AppliedDiscount[]
  /** Maps onto the existing `SalesOrder.requiresApproval` / `pending_approval`. */
  requiresApproval: boolean
}

function ruleApplies(
  rule: CandidateDiscountRule,
  context: { subtotal: number; quantity: number; customerId?: string | null },
  asOf: Date
) {
  if (rule.status !== "active") return false
  if (rule.validFrom && asOf < rule.validFrom) return false
  if (rule.validTo && asOf > rule.validTo) return false
  if (rule.minOrderValue !== null && context.subtotal < rule.minOrderValue) return false
  if (rule.minQty !== null && context.quantity < rule.minQty) return false

  if (rule.customerIds) {
    try {
      const ids = JSON.parse(rule.customerIds)
      if (Array.isArray(ids) && ids.length > 0) {
        return Boolean(context.customerId && ids.includes(context.customerId))
      }
    } catch {
      // A malformed rule must not silently apply to everyone.
      return false
    }
  }

  return true
}

/**
 * Order-level discounts.
 *
 * `discountStacking` decides what happens when several rules match: `best`
 * takes the single largest, `sum` adds them, `first` takes the earliest
 * matching rule. `best` is the default because it is the one a salesperson
 * would defend to a customer without having to explain arithmetic.
 */
export function applyOrderDiscounts(
  context: { subtotal: number; quantity: number; customerId?: string | null; asOf?: Date },
  rules: CandidateDiscountRule[],
  settings: SettingsOf<"pricing">
): OrderDiscountResult {
  const empty: OrderDiscountResult = { discountAmount: 0, applied: [], requiresApproval: false }

  if (!settings.enableDiscountRules) {
    return empty
  }

  const asOf = context.asOf ?? new Date()
  const matching = rules.filter((rule) => ruleApplies(rule, context, asOf))

  if (matching.length === 0) {
    return empty
  }

  const valueOf = (rule: CandidateDiscountRule) =>
    rule.discountType === "percentage"
      ? context.subtotal * (Math.max(rule.discountValue, 0) / 100)
      : Math.max(rule.discountValue, 0)

  const chosen =
    settings.discountStacking === "sum"
      ? matching
      : settings.discountStacking === "first"
        ? [matching[0]]
        : [matching.reduce((best, rule) => (valueOf(rule) > valueOf(best) ? rule : best))]

  const applied = chosen.map((rule) => ({
    ruleId: rule.id,
    name: rule.name,
    amount: valueOf(rule),
    requiresApproval:
      rule.requiresApproval ||
      (rule.approvalThreshold !== null && valueOf(rule) > rule.approvalThreshold),
  }))

  // Never discount an order below zero, however the rules stack.
  const raw = applied.reduce((sum, entry) => sum + entry.amount, 0)
  const discountAmount = roundTo(Math.min(raw, context.subtotal), settings.roundPricesTo)

  return {
    discountAmount,
    applied,
    requiresApproval: applied.some((entry) => entry.requiresApproval),
  }
}
