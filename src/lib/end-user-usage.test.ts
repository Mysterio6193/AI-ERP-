import { describe, expect, it } from "vitest"
import {
  STALE_AFTER_DAYS,
  VERY_STALE_AFTER_DAYS,
  confidenceOf,
  describeConfidence,
  summarisePullThrough,
  weeklyRate,
  type UsageRow,
} from "@/lib/end-user-usage"

const NOW = new Date("2026-08-25T00:00:00Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000)

describe("confidenceOf", () => {
  it("trusts a recent confirmation", () => {
    expect(confidenceOf(daysAgo(10), NOW)).toBe("confirmed")
  })

  it("marks a figure nobody has checked in months", () => {
    expect(confidenceOf(daysAgo(STALE_AFTER_DAYS + 1), NOW)).toBe("ageing")
  })

  it("marks a figure over a year old as stale", () => {
    expect(confidenceOf(daysAgo(VERY_STALE_AFTER_DAYS + 1), NOW)).toBe("stale")
  })

  it("distinguishes never confirmed from merely old", () => {
    // Someone typed a number once and nobody has ever checked it.
    expect(confidenceOf(null, NOW)).toBe("unconfirmed")
  })
})

describe("describeConfidence", () => {
  it("warns before a stale figure gets quoted to a customer", () => {
    expect(describeConfidence(daysAgo(400), NOW)).toMatch(/check before relying/)
  })

  it("says plainly when nothing was ever confirmed", () => {
    expect(describeConfidence(null, NOW)).toBe("never confirmed")
  })

  it("reads naturally for something checked today", () => {
    expect(describeConfidence(NOW, NOW)).toBe("confirmed today")
  })
})

describe("weeklyRate", () => {
  it("leaves a weekly figure alone", () => {
    expect(weeklyRate(10, "week")).toBe(10)
  })

  it("converts a monthly figure so two venues can be compared", () => {
    expect(weeklyRate(43.45, "month")).toBeCloseTo(10, 1)
  })

  it("returns nothing rather than guessing when there is no figure", () => {
    expect(weeklyRate(null, "week")).toBeNull()
    expect(weeklyRate(10, "fortnight")).toBeNull()
  })
})

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  customerId: "c1",
  customerName: "Bella Napoli",
  productId: "p1",
  productName: "Napoli Rustica Base",
  estimatedQty: 10,
  period: "week",
  unit: "boxes",
  status: "using",
  viaDistributorId: "d1",
  viaDistributorName: "Bidfood",
  lastConfirmedAt: daysAgo(5),
  ...over,
})

describe("summarisePullThrough", () => {
  it("adds up what venues say they use", () => {
    const [product] = summarisePullThrough(
      [row(), row({ customerId: "c2", customerName: "Tony's", estimatedQty: 5 })],
      NOW
    )

    expect(product.activeVenues).toBe(2)
    expect(product.impliedWeekly).toBe(15)
  })

  it("normalises periods before adding", () => {
    const [product] = summarisePullThrough(
      [row({ estimatedQty: 10, period: "week" }), row({ customerId: "c2", estimatedQty: 43.45, period: "month" })],
      NOW
    )

    expect(product.impliedWeekly).toBeCloseTo(20, 0)
  })

  it("counts a venue that stopped separately from one still using it", () => {
    const [product] = summarisePullThrough(
      [row(), row({ customerId: "c2", status: "lost_to_competitor" })],
      NOW
    )

    expect(product.activeVenues).toBe(1)
    expect(product.lostVenues).toBe(1)
  })

  it("does not count a lost venue's quantity as demand", () => {
    const [product] = summarisePullThrough(
      [row({ estimatedQty: 10 }), row({ customerId: "c2", status: "lapsed", estimatedQty: 999 })],
      NOW
    )

    expect(product.impliedWeekly).toBe(10)
  })

  it("counts trialling as active — it is real demand today", () => {
    const [product] = summarisePullThrough([row({ status: "trialling" })], NOW)
    expect(product.activeVenues).toBe(1)
  })

  it("flags figures that need re-confirming", () => {
    const [product] = summarisePullThrough(
      [row({ lastConfirmedAt: daysAgo(500) }), row({ customerId: "c2", lastConfirmedAt: daysAgo(2) })],
      NOW
    )

    expect(product.needConfirming).toBe(1)
  })

  it("does not ask anyone to re-check a venue that already stopped", () => {
    const [product] = summarisePullThrough(
      [row({ status: "lapsed", lastConfirmedAt: daysAgo(500) })],
      NOW
    )

    expect(product.needConfirming).toBe(0)
  })

  it("says which distributors the product reaches venues through", () => {
    // The answer to "our orders from Bidfood fell — which venues does that hit".
    const [product] = summarisePullThrough(
      [row(), row({ customerId: "c2" }), row({ customerId: "c3", viaDistributorId: "d2", viaDistributorName: "PFD" })],
      NOW
    )

    expect(product.distributors[0]).toEqual({ id: "d1", name: "Bidfood", venues: 2 })
    expect(product.distributors[1]).toEqual({ id: "d2", name: "PFD", venues: 1 })
  })

  it("names an unrecorded distributor rather than dropping the venue", () => {
    const [product] = summarisePullThrough(
      [row({ viaDistributorId: null, viaDistributorName: null })],
      NOW
    )

    expect(product.distributors[0].name).toBe("Not recorded")
  })

  it("puts the most-used product first", () => {
    const products = summarisePullThrough(
      [
        row({ productId: "small", productName: "Small" }),
        row({ productId: "big", productName: "Big" }),
        row({ productId: "big", customerId: "c2", productName: "Big" }),
      ],
      NOW
    )

    expect(products[0].productName).toBe("Big")
  })

  it("says nothing about nothing", () => {
    expect(summarisePullThrough([], NOW)).toEqual([])
  })
})
