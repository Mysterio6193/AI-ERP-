import { describe, expect, it } from "vitest"

import { resolveDefaultTaxRate } from "@/lib/tax"

/**
 * The rate a new product starts on. Creating one used to fall back to `|| 10`,
 * so a business on any other rate got 10% on everything it added — and that
 * propagated, because purchase orders read the rate off the product.
 */

const settings = (defaultRate: number | null) => ({ defaultRate }) as never
const dbWith = (gstRate: number | null) => ({
  company: { findFirst: async () => (gstRate === null ? null : { gstRate }) },
})

describe("resolveDefaultTaxRate", () => {
  it("uses the configured rate when there is one", async () => {
    expect(await resolveDefaultTaxRate(dbWith(10), settings(15))).toBe(15)
  })

  it("falls back to the company's own rate", async () => {
    // The setting is explicitly nullable and documented as inheriting it.
    expect(await resolveDefaultTaxRate(dbWith(8.5), settings(null))).toBe(8.5)
  })

  it("honours a configured zero rather than treating it as unset", async () => {
    // `|| 10` was the old bug: a genuine zero-rated business read as unset.
    expect(await resolveDefaultTaxRate(dbWith(10), settings(0))).toBe(0)
  })

  it("returns nothing rather than inventing a rate", async () => {
    // A caller that cannot find a rate should say so. Guessing is how the
    // wrong number reaches an invoice quietly.
    expect(await resolveDefaultTaxRate(dbWith(null), settings(null))).toBeNull()
  })

  it("prefers settings over the company even when both exist", async () => {
    expect(await resolveDefaultTaxRate(dbWith(10), settings(20))).toBe(20)
  })
})
