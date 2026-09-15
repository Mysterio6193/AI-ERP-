import { describe, expect, it } from "vitest"

import {
  consolidate,
  contributionShares,
  type EntityFigures,
  type IntercompanyEntry,
  type RateResolver,
} from "./rollup"

const RATES: Record<string, number> = {
  "NZD>AUD": 0.92,
  "USD>AUD": 1.5,
}

const rateFor: RateResolver = (from, to) => RATES[`${from}>${to}`] ?? null

function entity(overrides: Partial<EntityFigures> & { companyId: string }): EntityFigures {
  return {
    name: overrides.companyId,
    currency: "AUD",
    revenue: 0,
    cost: 0,
    receivable: 0,
    payable: 0,
    inventoryValue: 0,
    orderCount: 0,
    ...overrides,
  }
}

const group: EntityFigures[] = [
  entity({ companyId: "au", name: "Pizzeria AU", currency: "AUD", revenue: 1000, cost: 600, receivable: 200, payable: 150, inventoryValue: 400, orderCount: 10 }),
  entity({ companyId: "nz", name: "Pizzeria NZ", currency: "NZD", revenue: 500, cost: 300, receivable: 100, payable: 50, inventoryValue: 200, orderCount: 5 }),
]

describe("consolidate", () => {
  it("translates each entity into the presentation currency", () => {
    const result = consolidate(group, "AUD", rateFor)

    const nz = result.entities.find((row) => row.companyId === "nz")!
    expect(nz.rate).toBe(0.92)
    expect(nz.revenuePresented).toBe(460)
    expect(nz.revenue).toBe(500)
  })

  it("does not add two currencies as if they were the same unit", () => {
    // The naive answer is 1500. The right one is 1000 + 500*0.92.
    const result = consolidate(group, "AUD", rateFor)

    expect(result.combined.revenue).toBe(1460)
    expect(result.combined.revenue).not.toBe(1500)
  })

  it("leaves an entity already in the presentation currency alone", () => {
    const au = consolidate(group, "AUD", rateFor).entities.find((row) => row.companyId === "au")!

    expect(au.rate).toBe(1)
    expect(au.revenuePresented).toBe(au.revenue)
  })

  it("presents in any currency, not only the biggest entity's", () => {
    const result = consolidate(group, "NZD", (from, to) => {
      if (from === to) return 1
      if (from === "AUD" && to === "NZD") return 1 / 0.92
      return null
    })

    expect(result.incomplete).toBe(false)
    expect(result.combined.revenue).toBeCloseTo(1000 / 0.92 + 500, 1)
  })

  it("adds up counts without translating them", () => {
    // An order is an order in any currency.
    expect(consolidate(group, "AUD", rateFor).combined.orderCount).toBe(15)
  })
})

describe("an entity that cannot be translated", () => {
  const withOrphan = [
    ...group,
    entity({ companyId: "jp", name: "Pizzeria JP", currency: "JPY", revenue: 900_000, orderCount: 7 }),
  ]

  it("is named rather than silently dropped", () => {
    // A smaller total that looks complete is worse than one that says what is
    // missing: nobody queries a number they have no reason to doubt.
    const result = consolidate(withOrphan, "AUD", rateFor)

    expect(result.incomplete).toBe(true)
    expect(result.untranslated).toHaveLength(1)
    expect(result.untranslated[0].name).toBe("Pizzeria JP")
    expect(result.untranslated[0].reason).toContain("JPY")
  })

  it("is left out of the totals rather than counted at one to one", () => {
    const result = consolidate(withOrphan, "AUD", rateFor)

    expect(result.combined.revenue).toBe(1460)
    expect(result.combined.orderCount).toBe(15)
  })

  it("reports complete when everything translated", () => {
    expect(consolidate(group, "AUD", rateFor).incomplete).toBe(false)
  })

  it("refuses a nonsense rate instead of using it", () => {
    const broken: RateResolver = () => 0
    const result = consolidate(group, "AUD", broken)

    expect(result.untranslated.map((row) => row.companyId)).toContain("nz")
  })
})

describe("intercompany elimination", () => {
  // AU sold 300 AUD of stock to NZ. Revenue for AU, cost for NZ, and nothing
  // came into the group from outside.
  const internal: IntercompanyEntry[] = [
    { sellerCompanyId: "au", buyerCompanyId: "nz", amount: 300, currency: "AUD", reference: "SO-1" },
  ]

  it("takes an internal sale out of group revenue", () => {
    const result = consolidate(group, "AUD", rateFor, internal)

    expect(result.combined.revenue).toBe(1460)
    expect(result.consolidated.revenue).toBe(1160)
    expect(result.eliminated.revenue).toBe(300)
    expect(result.eliminated.entries).toBe(1)
  })

  it("takes the same figure off cost, so group profit does not move", () => {
    // An internal transfer creates no profit for the group. If only revenue
    // came off, moving stock between your own sites would show as a loss.
    const result = consolidate(group, "AUD", rateFor, internal)

    expect(result.consolidated.cost).toBe(result.combined.cost - 300)
    expect(result.consolidated.grossProfit).toBe(result.combined.grossProfit)
  })

  it("translates an elimination quoted in another currency", () => {
    const inNzd: IntercompanyEntry[] = [
      { sellerCompanyId: "nz", buyerCompanyId: "au", amount: 100, currency: "NZD" },
    ]

    expect(consolidate(group, "AUD", rateFor, inNzd).eliminated.revenue).toBe(92)
  })

  it("can be turned off, because combined and consolidated answer different questions", () => {
    const result = consolidate(group, "AUD", rateFor, internal, { eliminateIntercompany: false })

    expect(result.consolidated.revenue).toBe(result.combined.revenue)
    expect(result.eliminated.entries).toBe(0)
  })

  it("ignores a sale to an entity outside the group", () => {
    const external: IntercompanyEntry[] = [
      { sellerCompanyId: "au", buyerCompanyId: "someone-else", amount: 300, currency: "AUD" },
    ]

    expect(consolidate(group, "AUD", rateFor, external).eliminated.revenue).toBe(0)
  })

  it("does not eliminate against an entity that was dropped for want of a rate", () => {
    // That entity's revenue never entered the total, so removing the entry
    // would take the figure down twice.
    const withOrphan = [...group, entity({ companyId: "jp", currency: "JPY", revenue: 100 })]
    const toOrphan: IntercompanyEntry[] = [
      { sellerCompanyId: "au", buyerCompanyId: "jp", amount: 300, currency: "AUD" },
    ]

    const result = consolidate(withOrphan, "AUD", rateFor, toOrphan)

    expect(result.eliminated.revenue).toBe(0)
    expect(result.consolidated.revenue).toBe(result.combined.revenue)
  })

  it("ignores an entity recorded as selling to itself", () => {
    // Not an intercompany transaction — a data error. Removing it would take
    // real external revenue out of the group.
    const selfSale: IntercompanyEntry[] = [
      { sellerCompanyId: "au", buyerCompanyId: "au", amount: 300, currency: "AUD" },
    ]

    expect(consolidate(group, "AUD", rateFor, selfSale).eliminated.entries).toBe(0)
  })

  it("adds several entries up", () => {
    const many: IntercompanyEntry[] = [
      { sellerCompanyId: "au", buyerCompanyId: "nz", amount: 100, currency: "AUD" },
      { sellerCompanyId: "nz", buyerCompanyId: "au", amount: 100, currency: "NZD" },
    ]

    const result = consolidate(group, "AUD", rateFor, many)

    expect(result.eliminated.revenue).toBe(192)
    expect(result.eliminated.entries).toBe(2)
  })

  it("leaves receivables and payables alone rather than guessing at them", () => {
    // They do net off at group level, but matching them needs the open
    // balances between entities, not the sales — netting from sales would
    // remove amounts that are still genuinely owed.
    const result = consolidate(group, "AUD", rateFor, internal)

    expect(result.consolidated.receivable).toBe(result.combined.receivable)
    expect(result.consolidated.payable).toBe(result.combined.payable)
  })
})

describe("edges", () => {
  it("returns zeroes for an empty group rather than throwing", () => {
    const result = consolidate([], "AUD", rateFor)

    expect(result.combined.revenue).toBe(0)
    expect(result.consolidated.grossProfit).toBe(0)
    expect(result.incomplete).toBe(false)
  })

  it("is not case sensitive about currency codes", () => {
    const lower = [entity({ companyId: "nz", currency: "nzd", revenue: 500 })]

    expect(consolidate(lower, "aud", rateFor).combined.revenue).toBe(460)
  })

  it("handles a group making a loss", () => {
    const losing = [entity({ companyId: "au", revenue: 100, cost: 400 })]

    expect(consolidate(losing, "AUD", rateFor).combined.grossProfit).toBe(-300)
  })
})

describe("contributionShares", () => {
  it("ranks entities by what they brought in", () => {
    const shares = contributionShares(consolidate(group, "AUD", rateFor))

    expect(shares.map((row) => row.companyId)).toEqual(["au", "nz"])
    expect(shares[0].share).toBeCloseTo(68.5, 1)
    expect(shares[1].share).toBeCloseTo(31.5, 1)
  })

  it("does not divide by zero when nothing was sold", () => {
    const quiet = [entity({ companyId: "au" })]
    const shares = contributionShares(consolidate(quiet, "AUD", rateFor))

    expect(shares[0].share).toBe(0)
  })
})
