import { describe, expect, it } from "vitest"

import {
  applyOrderDiscounts,
  pickDefaultList,
  resolveLinePrice,
  type CandidateDiscountRule,
  type CandidatePriceItem,
  type CandidatePriceList,
} from "./pricing"
import { defaultsFor } from "./settings/registry"

const settings = defaultsFor("pricing")
/** Price lists are off by default; most tests need them on to say anything. */
const on = { ...settings, enablePriceLists: true }

const asOf = new Date(2026, 7, 22)

const product = { wholesalePrice: 54, retailPrice: 79 }

function list(overrides: Partial<CandidatePriceList> = {}): CandidatePriceList {
  return {
    id: "list-1",
    isDefault: false,
    type: "wholesale",
    status: "active",
    validFrom: null,
    validTo: null,
    createdAt: new Date(2026, 0, 1),
    ...overrides,
  }
}

function item(overrides: Partial<CandidatePriceItem> = {}): CandidatePriceItem {
  return {
    id: "item-1",
    priceListId: "list-1",
    price: 47.52,
    minQty: 1,
    maxQty: null,
    discountPercent: 0,
    discountFlat: 0,
    ...overrides,
  }
}

describe("the kill switch", () => {
  it("ignores price lists entirely while disabled, which is the default", () => {
    const resolved = resolveLinePrice(
      {
        quantity: 100,
        product,
        customer: { priceListId: "list-1" },
        items: [item()],
        lists: [list()],
        asOf,
      },
      settings
    )

    // 54, not 47.52 — landing this must change no price at all.
    expect(resolved).toEqual({
      unitPrice: 54,
      source: "wholesale",
      priceListItemId: null,
      reason: "lists_disabled",
    })
  })

  it("applies the contract price once enabled", () => {
    const resolved = resolveLinePrice(
      {
        quantity: 100,
        product,
        customer: { priceListId: "list-1" },
        items: [item()],
        lists: [list()],
        asOf,
      },
      on
    )

    expect(resolved).toEqual({ unitPrice: 47.52, source: "priceList", priceListItemId: "item-1" })
  })
})

describe("resolution order", () => {
  it("lets a typed override beat a contract price", () => {
    const resolved = resolveLinePrice(
      {
        quantity: 100,
        unitPriceOverride: 40,
        product,
        customer: { priceListId: "list-1" },
        items: [item()],
        lists: [list()],
        asOf,
      },
      on
    )

    expect(resolved).toEqual({ unitPrice: 40, source: "override", priceListItemId: null })
  })

  it("ignores an override when manual pricing is switched off", () => {
    const noOverride = { ...on, allowManualPriceOverride: false }

    expect(
      resolveLinePrice(
        {
          quantity: 100,
          unitPriceOverride: 40,
          product,
          customer: { priceListId: "list-1" },
          items: [item()],
          lists: [list()],
          asOf,
        },
        noOverride
      ).source
    ).toBe("priceList")
  })

  it("treats a zero override as a real price, not a missing one", () => {
    // A deliberate free line — `||` would have discarded it.
    const resolved = resolveLinePrice(
      { quantity: 1, unitPriceOverride: 0, product, asOf },
      on
    )

    expect(resolved).toEqual({ unitPrice: 0, source: "override", priceListItemId: null })
  })

  it("falls back to wholesale when the customer's list has no line for the product", () => {
    const resolved = resolveLinePrice(
      { quantity: 10, product, customer: { priceListId: "list-1" }, items: [], lists: [list()], asOf },
      on
    )

    expect(resolved).toEqual({
      unitPrice: 54,
      source: "wholesale",
      priceListItemId: null,
      reason: "product_not_in_list",
    })
  })

  it("can fall back to retail instead when configured", () => {
    const retail = { ...on, fallback: "retailPrice" as const }

    expect(resolveLinePrice({ quantity: 1, product, asOf }, retail)).toEqual({
      unitPrice: 79,
      source: "retail",
      priceListItemId: null,
      reason: "no_list_assigned",
    })
  })
})

describe("why a line fell back", () => {
  it("distinguishes a missing product from a quantity no band covers", () => {
    // This is the difference between "the list is incomplete" and "the list
    // only kicks in above 50 units" — different fixes, so the report must not
    // conflate them.
    const bulkOnly = [item({ id: "bulk", price: 47.52, minQty: 50, maxQty: null })]

    expect(
      resolveLinePrice(
        { quantity: 10, product, customer: { priceListId: "list-1" }, items: bulkOnly, lists: [list()], asOf },
        on
      ).reason
    ).toBe("no_band_for_quantity")

    expect(
      resolveLinePrice(
        { quantity: 10, product, customer: { priceListId: "list-1" }, items: [], lists: [list()], asOf },
        on
      ).reason
    ).toBe("product_not_in_list")
  })

  it("reports an inactive list separately from a missing product", () => {
    expect(
      resolveLinePrice(
        {
          quantity: 10,
          product,
          customer: { priceListId: "list-1" },
          items: [item()],
          lists: [list({ status: "archived" })],
          asOf,
        },
        on
      ).reason
    ).toBe("list_inactive")
  })

  it("sets no reason when a list actually priced the line", () => {
    expect(
      resolveLinePrice(
        { quantity: 10, product, customer: { priceListId: "list-1" }, items: [item()], lists: [list()], asOf },
        on
      ).reason
    ).toBeUndefined()
  })
})

describe("volume bands", () => {
  const banded = [
    item({ id: "base", price: 54, minQty: 1, maxQty: 49 }),
    item({ id: "bulk", price: 47.52, minQty: 50, maxQty: null }),
  ]

  it("picks the band covering the quantity", () => {
    const at10 = resolveLinePrice(
      { quantity: 10, product, customer: { priceListId: "list-1" }, items: banded, lists: [list()], asOf },
      on
    )
    const at50 = resolveLinePrice(
      { quantity: 50, product, customer: { priceListId: "list-1" }, items: banded, lists: [list()], asOf },
      on
    )

    expect(at10.unitPrice).toBe(54)
    expect(at50.unitPrice).toBe(47.52)
    expect(at50.priceListItemId).toBe("bulk")
  })

  it("takes the tightest band when two overlap", () => {
    // Nothing in the schema prevents overlap; row order must not decide price.
    const overlapping = [
      item({ id: "wide", price: 54, minQty: 1, maxQty: null }),
      item({ id: "narrow", price: 44, minQty: 50, maxQty: null }),
    ]

    expect(
      resolveLinePrice(
        { quantity: 60, product, customer: { priceListId: "list-1" }, items: overlapping, lists: [list()], asOf },
        on
      ).priceListItemId
    ).toBe("narrow")

    // Reversed input order must give the same answer.
    expect(
      resolveLinePrice(
        { quantity: 60, product, customer: { priceListId: "list-1" }, items: [...overlapping].reverse(), lists: [list()], asOf },
        on
      ).priceListItemId
    ).toBe("narrow")
  })

  it("uses only the base band when volume breaks are disabled", () => {
    const noBreaks = { ...on, volumeBreaks: false }

    expect(
      resolveLinePrice(
        { quantity: 100, product, customer: { priceListId: "list-1" }, items: banded, lists: [list()], asOf },
        noBreaks
      ).unitPrice
    ).toBe(54)
  })
})

describe("list validity", () => {
  it("ignores an expired list", () => {
    const expired = list({ validTo: new Date(2026, 0, 31) })

    expect(
      resolveLinePrice(
        { quantity: 10, product, customer: { priceListId: "list-1" }, items: [item()], lists: [expired], asOf },
        on
      ).source
    ).toBe("wholesale")
  })

  it("ignores a list that has not started", () => {
    const future = list({ validFrom: new Date(2026, 11, 1) })

    expect(
      resolveLinePrice(
        { quantity: 10, product, customer: { priceListId: "list-1" }, items: [item()], lists: [future], asOf },
        on
      ).source
    ).toBe("wholesale")
  })

  it("ignores an inactive list", () => {
    expect(
      resolveLinePrice(
        {
          quantity: 10,
          product,
          customer: { priceListId: "list-1" },
          items: [item()],
          lists: [list({ status: "archived" })],
          asOf,
        },
        on
      ).source
    ).toBe("wholesale")
  })
})

describe("pickDefaultList", () => {
  const retailDefault = list({ id: "retail", isDefault: true, type: "retail", createdAt: new Date(2026, 2, 1) })
  const tradeDefault = list({ id: "trade", isDefault: true, type: "wholesale", createdAt: new Date(2026, 1, 1) })

  it("prefers the default whose type matches the customer", () => {
    // A real case: one company carries two lists both flagged isDefault.
    expect(pickDefaultList([retailDefault, tradeDefault], "retail", asOf)?.id).toBe("retail")
    expect(pickDefaultList([retailDefault, tradeDefault], "wholesale", asOf)?.id).toBe("trade")
  })

  it("breaks a remaining tie by the oldest list, not by row order", () => {
    expect(pickDefaultList([retailDefault, tradeDefault], "contract", asOf)?.id).toBe("trade")
    expect(pickDefaultList([tradeDefault, retailDefault], "contract", asOf)?.id).toBe("trade")
  })

  it("ignores non-default and inactive lists", () => {
    expect(pickDefaultList([list()], "wholesale", asOf)).toBeNull()
    expect(pickDefaultList([list({ isDefault: true, status: "archived" })], "wholesale", asOf)).toBeNull()
  })
})

describe("the default list for customers who have none", () => {
  const defaultList = list({ id: "default-1", isDefault: true })
  const defaultItem = item({ id: "default-item", priceListId: "default-1", price: 50 })

  it("is not used unless explicitly enabled", () => {
    expect(
      resolveLinePrice(
        { quantity: 10, product, customer: {}, items: [defaultItem], lists: [defaultList], asOf },
        on
      ).source
    ).toBe("wholesale")
  })

  it("prices from the default list once enabled", () => {
    const withDefault = { ...on, useDefaultPriceListWhenCustomerHasNone: true }

    expect(
      resolveLinePrice(
        { quantity: 10, product, customer: {}, items: [defaultItem], lists: [defaultList], asOf },
        withDefault
      )
    ).toEqual({ unitPrice: 50, source: "defaultPriceList", priceListItemId: "default-item" })
  })

  it("does not override a customer's own list with the default", () => {
    const withDefault = { ...on, useDefaultPriceListWhenCustomerHasNone: true }

    expect(
      resolveLinePrice(
        {
          quantity: 10,
          product,
          customer: { priceListId: "list-1" },
          items: [item(), defaultItem],
          lists: [list(), defaultList],
          asOf,
        },
        withDefault
      ).priceListItemId
    ).toBe("item-1")
  })
})

describe("item discounts", () => {
  it("applies percent then flat on top of the band price", () => {
    // 100 - 10% = 90, then -5 = 85.
    const discounted = item({ price: 100, discountPercent: 10, discountFlat: 5 })

    expect(
      resolveLinePrice(
        { quantity: 1, product, customer: { priceListId: "list-1" }, items: [discounted], lists: [list()], asOf },
        on
      ).unitPrice
    ).toBe(85)
  })

  it("caps the discount at the configured maximum", () => {
    const capped = { ...on, maxLineDiscountPercent: 20 }
    const greedy = item({ price: 100, discountPercent: 90 })

    expect(
      resolveLinePrice(
        { quantity: 1, product, customer: { priceListId: "list-1" }, items: [greedy], lists: [list()], asOf },
        capped
      ).unitPrice
    ).toBe(80)
  })

  it("never turns a line into a credit", () => {
    const absurd = item({ price: 10, discountFlat: 999 })

    expect(
      resolveLinePrice(
        { quantity: 1, product, customer: { priceListId: "list-1" }, items: [absurd], lists: [list()], asOf },
        on
      ).unitPrice
    ).toBe(0)
  })

  it("rounds to the configured precision", () => {
    const thirds = item({ price: 10, discountPercent: 33.333 })

    expect(
      resolveLinePrice(
        { quantity: 1, product, customer: { priceListId: "list-1" }, items: [thirds], lists: [list()], asOf },
        on
      ).unitPrice
    ).toBe(6.67)
  })
})

/* ------------------------------------------------------------------------ */

function rule(overrides: Partial<CandidateDiscountRule> = {}): CandidateDiscountRule {
  return {
    id: "rule-1",
    name: "Volume rebate",
    type: "order_total",
    discountType: "percentage",
    discountValue: 10,
    minOrderValue: null,
    minQty: null,
    customerIds: null,
    requiresApproval: false,
    approvalThreshold: null,
    validFrom: null,
    validTo: null,
    status: "active",
    ...overrides,
  }
}

const rulesOn = { ...settings, enableDiscountRules: true }
const context = { subtotal: 1000, quantity: 100, customerId: "cust-1", asOf }

describe("applyOrderDiscounts", () => {
  it("does nothing while disabled, which is the default", () => {
    expect(applyOrderDiscounts(context, [rule()], settings)).toEqual({
      discountAmount: 0,
      applied: [],
      requiresApproval: false,
    })
  })

  it("applies a percentage of the subtotal", () => {
    expect(applyOrderDiscounts(context, [rule()], rulesOn).discountAmount).toBe(100)
  })

  it("applies a flat amount", () => {
    expect(
      applyOrderDiscounts(context, [rule({ discountType: "flat", discountValue: 75 })], rulesOn)
        .discountAmount
    ).toBe(75)
  })

  it("takes only the largest when stacking is 'best'", () => {
    const result = applyOrderDiscounts(
      context,
      [rule({ id: "small", discountValue: 5 }), rule({ id: "big", discountValue: 12 })],
      rulesOn
    )

    expect(result.discountAmount).toBe(120)
    expect(result.applied).toHaveLength(1)
    expect(result.applied[0].ruleId).toBe("big")
  })

  it("adds them when stacking is 'sum'", () => {
    const summed = { ...rulesOn, discountStacking: "sum" as const }
    const result = applyOrderDiscounts(
      context,
      [rule({ id: "a", discountValue: 5 }), rule({ id: "b", discountValue: 12 })],
      summed
    )

    expect(result.discountAmount).toBe(170)
    expect(result.applied).toHaveLength(2)
  })

  it("takes the first match when stacking is 'first'", () => {
    const first = { ...rulesOn, discountStacking: "first" as const }
    const result = applyOrderDiscounts(
      context,
      [rule({ id: "a", discountValue: 5 }), rule({ id: "b", discountValue: 12 })],
      first
    )

    expect(result.applied[0].ruleId).toBe("a")
  })

  it("respects minimum order value and quantity", () => {
    expect(
      applyOrderDiscounts(context, [rule({ minOrderValue: 5000 })], rulesOn).discountAmount
    ).toBe(0)
    expect(applyOrderDiscounts(context, [rule({ minQty: 500 })], rulesOn).discountAmount).toBe(0)
  })

  it("respects the validity window and status", () => {
    expect(
      applyOrderDiscounts(context, [rule({ validTo: new Date(2026, 0, 1) })], rulesOn).discountAmount
    ).toBe(0)
    expect(
      applyOrderDiscounts(context, [rule({ status: "paused" })], rulesOn).discountAmount
    ).toBe(0)
  })

  it("limits a rule to its named customers", () => {
    const targeted = rule({ customerIds: JSON.stringify(["cust-9"]) })
    expect(applyOrderDiscounts(context, [targeted], rulesOn).discountAmount).toBe(0)

    const included = rule({ customerIds: JSON.stringify(["cust-1", "cust-9"]) })
    expect(applyOrderDiscounts(context, [included], rulesOn).discountAmount).toBe(100)
  })

  it("does not apply a rule whose customer list is malformed", () => {
    // Failing open here would discount every order in the system.
    const broken = rule({ customerIds: "{not json" })
    expect(applyOrderDiscounts(context, [broken], rulesOn).discountAmount).toBe(0)
  })

  it("never discounts below zero", () => {
    const huge = rule({ discountType: "flat", discountValue: 99999 })
    expect(applyOrderDiscounts(context, [huge], rulesOn).discountAmount).toBe(1000)
  })

  it("flags approval when a rule demands it or crosses its threshold", () => {
    expect(
      applyOrderDiscounts(context, [rule({ requiresApproval: true })], rulesOn).requiresApproval
    ).toBe(true)

    expect(
      applyOrderDiscounts(context, [rule({ approvalThreshold: 50 })], rulesOn).requiresApproval
    ).toBe(true)

    expect(
      applyOrderDiscounts(context, [rule({ approvalThreshold: 500 })], rulesOn).requiresApproval
    ).toBe(false)
  })
})
