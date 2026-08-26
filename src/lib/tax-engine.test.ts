import { describe, expect, it } from "vitest"

import { calculateTax, extractGSTFromInclusive } from "@/lib/tax-engine"

/**
 * The engine deliberately does not round its own output — rounding is the
 * caller's policy, chosen per company as line-level or document-level. What it
 * must do is be arithmetically right, and never return two figures that
 * disagree with each other.
 */

describe("extractGSTFromInclusive", () => {
  it("splits a tax-inclusive price so the parts add back exactly", () => {
    // The bug this exists for: the base was derived from an unrounded tax while
    // the tax was returned rounded, so the two never reconciled.
    const { baseAmount, taxAmount } = extractGSTFromInclusive(100, 10)

    expect(taxAmount).toBe(9.09)
    expect(baseAmount).toBe(90.91)
    expect(baseAmount + taxAmount).toBe(100)
  })

  it("adds back exactly across a spread of awkward amounts", () => {
    for (const amount of [0.01, 1, 33.33, 99.99, 1234.56, 7.77]) {
      const { baseAmount, taxAmount } = extractGSTFromInclusive(amount, 10)
      expect(Math.round((baseAmount + taxAmount) * 100) / 100).toBe(amount)
    }
  })

  it("returns whole numbers of cents, not float noise", () => {
    const { baseAmount, taxAmount } = extractGSTFromInclusive(33.33, 10)
    expect(Number.isInteger(Math.round(baseAmount * 100))).toBe(true)
    expect(String(taxAmount)).not.toMatch(/\d{5,}/)
  })

  it("treats a zero rate as all base and no tax", () => {
    expect(extractGSTFromInclusive(50, 0)).toEqual({ baseAmount: 50, taxAmount: 0 })
  })

  it("handles zero", () => {
    expect(extractGSTFromInclusive(0, 10)).toEqual({ baseAmount: 0, taxAmount: 0 })
  })
})

describe("calculateTax — Australia", () => {
  it("adds GST to a subtotal", () => {
    const result = calculateTax({ country: "AU", subtotal: 100, gstRate: 10 })

    expect(result.totalTax).toBeCloseTo(10, 6)
    expect(result.grandTotal).toBeCloseTo(110, 6)
  })

  it("charges nothing on a GST-free line and says so", () => {
    const result = calculateTax({ country: "AU", subtotal: 100, gstRate: 0 })

    expect(result.totalTax).toBe(0)
    expect(result.grandTotal).toBe(100)
    expect(result.taxLines[0].code).toBe("AU_GST_FREE")
  })

  it("leaves rounding to the caller rather than deciding it here", () => {
    // Intentional: rounding is a per-company setting, line-level or
    // document-level, and rounding early makes document-level impossible.
    const result = calculateTax({ country: "AU", subtotal: 33.33, gstRate: 10 })
    expect(result.totalTax).toBeCloseTo(3.333, 6)
  })

  it("keeps the subtotal it was given", () => {
    expect(calculateTax({ country: "AU", subtotal: 250.5, gstRate: 10 }).subtotal).toBe(250.5)
  })
})
