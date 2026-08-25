import { describe, expect, it } from "vitest"

import {
  daysOfCover, demandRates, projectedStockoutDate, reorderPoint,
  sortByUrgency, suggestOrderQuantity, urgencyOf,
  type DemandLine, type ReplenishmentLine,
} from "./replenishment"

/**
 * Reordering ran off a static level someone typed once: it knew nothing about
 * how fast a product sells, how long its supplier takes, or whether the stock
 * would last until a replacement landed.
 */

const day = (n: number) => new Date(2026, 7, n)

describe("demandRates", () => {
  it("averages over the whole window, not only the days with orders", () => {
    // A product ordered once a fortnight consumes stock slowly. Averaging over
    // active days alone would make it look like a fast mover between orders.
    const lines: DemandLine[] = [{ productId: "p", quantity: 30, at: day(1) }]

    expect(demandRates(lines, 30).get("p")!.perDay).toBe(1)
  })

  it("adds up several orders for the same product", () => {
    const lines: DemandLine[] = [
      { productId: "p", quantity: 10, at: day(1) },
      { productId: "p", quantity: 20, at: day(5) },
    ]

    const rate = demandRates(lines, 10).get("p")!
    expect(rate.totalUnits).toBe(30)
    expect(rate.orderCount).toBe(2)
    expect(rate.perDay).toBe(3)
  })

  it("counts distinct days, so lumpy demand is visible", () => {
    // Two orders on one day is not the same pattern as two orders a week apart.
    const lines: DemandLine[] = [
      { productId: "p", quantity: 5, at: day(1) },
      { productId: "p", quantity: 5, at: day(1) },
      { productId: "p", quantity: 5, at: day(9) },
    ]

    expect(demandRates(lines, 30).get("p")!.activeDays).toBe(2)
  })

  it("ignores zero and negative quantities", () => {
    const lines: DemandLine[] = [
      { productId: "p", quantity: 0, at: day(1) },
      { productId: "p", quantity: -5, at: day(2) },
    ]

    expect(demandRates(lines, 30).has("p")).toBe(false)
  })

  it("returns nothing for a zero-length window rather than dividing by zero", () => {
    expect(demandRates([{ productId: "p", quantity: 5, at: day(1) }], 0).size).toBe(0)
  })
})

describe("daysOfCover", () => {
  it("divides stock by the rate", () => {
    expect(daysOfCover(100, 4)).toBe(25)
  })

  it("is infinite when nothing is selling", () => {
    // A product with stock and no demand is not about to run out; reporting
    // "0 days" would bury the lines that genuinely are.
    expect(daysOfCover(50, 0)).toBe(Number.POSITIVE_INFINITY)
  })

  it("is zero when there is no stock", () => {
    expect(daysOfCover(0, 4)).toBe(0)
  })
})

describe("reorderPoint", () => {
  it("covers the lead time plus a safety buffer", () => {
    // 5/day, 7 day lead, 3 day buffer → order at 50 on hand.
    expect(reorderPoint(5, 7, 3)).toBe(50)
  })

  it("is zero for something that does not sell", () => {
    expect(reorderPoint(0, 14)).toBe(0)
  })

  it("treats a negative lead time as zero rather than reducing the point", () => {
    expect(reorderPoint(5, -10, 2)).toBe(10)
  })
})

describe("suggestOrderQuantity", () => {
  it("orders enough to reach the target cover", () => {
    // 4/day, want 30 days = 120; 20 on hand → order 100.
    const s = suggestOrderQuantity({ available: 20, onOrder: 0, perDay: 4, targetCoverDays: 30 })
    expect(s.quantity).toBe(100)
  })

  it("counts what is already on the way", () => {
    // Ignoring inbound stock is how a business ends up double-ordering.
    const s = suggestOrderQuantity({ available: 20, onOrder: 60, perDay: 4, targetCoverDays: 30 })
    expect(s.quantity).toBe(40)
  })

  it("orders nothing when cover is already met", () => {
    expect(suggestOrderQuantity({ available: 500, onOrder: 0, perDay: 4, targetCoverDays: 30 }).quantity).toBe(0)
  })

  it("lifts the quantity to the supplier's minimum, and says it did", () => {
    // Ordering below the minimum is not something the supplier offers, so a
    // suggestion that ignores it cannot be acted on.
    const s = suggestOrderQuantity({ available: 100, onOrder: 0, perDay: 4, targetCoverDays: 30, minOrderQty: 50 })

    expect(s.quantity).toBe(50)
    expect(s.raisedToMinimum).toBe(true)
  })

  it("suggests nothing for a product with no demand", () => {
    // Any quantity would be a guess.
    expect(suggestOrderQuantity({ available: 0, onOrder: 0, perDay: 0, targetCoverDays: 30 }).quantity).toBe(0)
  })
})

describe("urgencyOf", () => {
  it("judges against the lead time, not a fixed number of days", () => {
    // Five days of cover is fine from a next-day supplier and a crisis from
    // one who takes a fortnight.
    expect(urgencyOf(5, 1)).toBe("soon")
    expect(urgencyOf(5, 14)).toBe("urgent")
  })

  it("calls an empty shelf a stockout", () => {
    expect(urgencyOf(0, 7)).toBe("stockout")
  })

  it("leaves something that never runs out alone", () => {
    expect(urgencyOf(Number.POSITIVE_INFINITY, 7)).toBe("ok")
  })

  it("is ok when cover comfortably exceeds the lead time", () => {
    expect(urgencyOf(60, 7)).toBe("ok")
  })
})

describe("projectedStockoutDate", () => {
  it("projects the date the shelf empties", () => {
    const from = new Date(2026, 7, 1)
    const out = projectedStockoutDate(20, 4, from)!

    expect(Math.round((out.getTime() - from.getTime()) / 86400000)).toBe(5)
  })

  it("returns nothing when stock is not running out", () => {
    expect(projectedStockoutDate(20, 0)).toBeNull()
  })
})

describe("sortByUrgency", () => {
  it("puts a stockout above everything, then the shortest cover", () => {
    const line = (over: Partial<ReplenishmentLine>): ReplenishmentLine => ({
      productId: "p", sku: "s", name: "n", available: 0, onOrder: 0, perDay: 1,
      coverDays: 10, reorderPoint: 0, urgency: "ok", suggestedQty: 0,
      raisedToMinimum: false, stockoutOn: null, supplierName: null,
      supplierId: null, leadTimeDays: 7, unitCost: null, ...over,
    })

    const sorted = sortByUrgency([
      line({ sku: "ok", urgency: "ok", coverDays: 90 }),
      line({ sku: "soon", urgency: "soon", coverDays: 12 }),
      line({ sku: "out", urgency: "stockout", coverDays: 0 }),
      line({ sku: "urgent", urgency: "urgent", coverDays: 3 }),
    ])

    expect(sorted.map((l) => l.sku)).toEqual(["out", "urgent", "soon", "ok"])
  })
})
