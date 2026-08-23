import { describe, expect, it } from "vitest"

import { defaultsFor } from "./settings/registry"
import { computeLineTax, resolveLineTaxRate } from "./tax"

const settings = defaultsFor("tax")

describe("resolveLineTaxRate", () => {
  it("prefers an explicit line rate over everything else", () => {
    const resolved = resolveLineTaxRate(
      { lineRate: 5, product: { gstRate: 10 }, company: { gstRate: 15 } },
      settings
    )

    expect(resolved).toEqual({ rate: 5, source: "line" })
  })

  it("falls back to the product rate, which is what the code did before", () => {
    const resolved = resolveLineTaxRate({ product: { gstRate: 10 }, company: { gstRate: 15 } }, settings)

    expect(resolved).toEqual({ rate: 10, source: "product" })
  })

  it("finally reaches Company.gstRate, which nothing used to read", () => {
    const resolved = resolveLineTaxRate({ product: { gstRate: null }, company: { gstRate: 15 } }, settings)

    expect(resolved).toEqual({ rate: 15, source: "company" })
  })

  it("treats a zero line rate as a real rate, not a missing one", () => {
    // `item.taxRate || product.gstRate` silently upgraded a deliberate 0% line
    // to the product's 10%. This is that bug.
    const resolved = resolveLineTaxRate({ lineRate: 0, product: { gstRate: 10 } }, settings)

    expect(resolved).toEqual({ rate: 0, source: "line" })
  })

  it("honours a product marked GST-exempt regardless of any rate on it", () => {
    const resolved = resolveLineTaxRate(
      { product: { gstRate: 10, gstExempt: true }, company: { gstRate: 15 } },
      settings
    )

    expect(resolved).toEqual({ rate: 0, source: "exempt" })
  })

  it("exempts a customer whose type is configured as exempt", () => {
    const withExempt = { ...settings, exemptCustomerTypes: ["export"] }

    expect(
      resolveLineTaxRate({ customer: { customerType: "export" }, product: { gstRate: 10 } }, withExempt)
    ).toEqual({ rate: 0, source: "exempt" })

    expect(
      resolveLineTaxRate({ customer: { customerType: "wholesale" }, product: { gstRate: 10 } }, withExempt)
    ).toEqual({ rate: 10, source: "product" })
  })

  it("matches exempt customer types case-insensitively", () => {
    const withExempt = { ...settings, exemptCustomerTypes: ["Export"] }

    expect(
      resolveLineTaxRate({ customer: { customerType: "EXPORT" }, product: { gstRate: 10 } }, withExempt)
    ).toEqual({ rate: 0, source: "exempt" })
  })

  it("lets customer exemption beat an explicit line rate", () => {
    // Exemption is a property of who is buying, not of how the line was typed.
    const withExempt = { ...settings, exemptCustomerTypes: ["export"] }

    expect(
      resolveLineTaxRate({ lineRate: 10, customer: { customerType: "export" } }, withExempt)
    ).toEqual({ rate: 0, source: "exempt" })
  })

  it("follows a reordered resolution chain", () => {
    const companyFirst = {
      ...settings,
      resolutionOrder: [...(["company", "product", "line", "customer"] as const)],
    }

    expect(
      resolveLineTaxRate({ lineRate: 5, product: { gstRate: 10 }, company: { gstRate: 15 } }, companyFirst)
    ).toEqual({ rate: 15, source: "company" })
  })

  it("uses the configured default when the whole chain is empty", () => {
    const withDefault = { ...settings, defaultRate: 12 }

    expect(resolveLineTaxRate({}, withDefault)).toEqual({ rate: 12, source: "default" })
    expect(resolveLineTaxRate({}, settings)).toEqual({ rate: 0, source: "default" })
  })

  it("skips a negative or non-finite rate rather than charging it", () => {
    expect(resolveLineTaxRate({ lineRate: -5, product: { gstRate: 10 } }, settings)).toEqual({
      rate: 10,
      source: "product",
    })
    expect(resolveLineTaxRate({ lineRate: NaN, product: { gstRate: 10 } }, settings)).toEqual({
      rate: 10,
      source: "product",
    })
  })
})

describe("computeLineTax", () => {
  it("reproduces the arithmetic the order path used before", () => {
    const result = computeLineTax(100, { product: { gstRate: 10 } }, settings)

    expect(result.taxAmount).toBe(10)
    expect(result.total).toBe(110)
    expect(result.source).toBe("product")
  })

  it("rounds to the configured decimal places per line", () => {
    // 33.33 * 10% = 3.333
    const result = computeLineTax(33.33, { product: { gstRate: 10 } }, settings)

    expect(result.taxAmount).toBe(3.33)
  })

  it("rounds half up rather than to even", () => {
    // 12.25 * 10% = 1.225 -> 1.23, not 1.22.
    expect(computeLineTax(12.25, { product: { gstRate: 10 } }, settings).taxAmount).toBe(1.23)
  })

  it("leaves the figure unrounded when rounding is deferred to the document", () => {
    const perDocument = { ...settings, roundingMode: "document" as const }
    const result = computeLineTax(33.33, { product: { gstRate: 10 } }, perDocument)

    expect(result.taxAmount).toBeCloseTo(3.333, 10)
  })

  it("charges nothing on an exempt line", () => {
    const result = computeLineTax(250, { product: { gstRate: 10, gstExempt: true } }, settings)

    expect(result.taxAmount).toBe(0)
    expect(result.total).toBe(250)
  })

  it("splits Indian GST into CGST and SGST within a state", () => {
    // The engine could always do this; nothing ever called it.
    const india = { ...settings, country: "IN" as const }
    const result = computeLineTax(
      1000,
      { product: { gstRate: 18 } },
      india,
      { fromState: "MH", toState: "MH" }
    )

    expect(result.taxAmount).toBe(180)
    expect(result.breakdown.taxLines.map((line) => line.name)).toEqual(
      expect.arrayContaining([expect.stringContaining("CGST"), expect.stringContaining("SGST")])
    )
  })

  it("uses IGST across state lines", () => {
    const india = { ...settings, country: "IN" as const }
    const result = computeLineTax(
      1000,
      { product: { gstRate: 18 } },
      india,
      { fromState: "MH", toState: "KA" }
    )

    expect(result.taxAmount).toBe(180)
    expect(result.breakdown.taxLines).toHaveLength(1)
    expect(result.breakdown.taxLines[0].name).toContain("IGST")
  })

  it("takes the country from the company when settings do not pin one", () => {
    const result = computeLineTax(
      1000,
      { product: { gstRate: 18 }, company: { country: "IN" } },
      settings,
      { fromState: "MH", toState: "MH" }
    )

    expect(result.breakdown.taxLines.length).toBeGreaterThan(1)
  })
})

describe("named tax rates", () => {
  it("prefers a named rate over the product's bare percentage", () => {
    // The named rate is the one someone deliberately chose, and the one that
    // can be changed in a single place.
    const resolved = resolveLineTaxRate(
      { product: { gstRate: 10, taxRate: { rate: 5, status: "active" } } },
      settings
    )

    expect(resolved).toEqual({ rate: 5, source: "product" })
  })

  it("ignores an archived rate rather than continuing to charge it", () => {
    const resolved = resolveLineTaxRate(
      { product: { gstRate: 10, taxRate: { rate: 5, status: "archived" } } },
      settings
    )

    expect(resolved).toEqual({ rate: 10, source: "product" })
  })

  it("falls back to the bare rate when no named rate is set", () => {
    // Every product that has always carried a plain percentage keeps working.
    expect(resolveLineTaxRate({ product: { gstRate: 10, taxRate: null } }, settings)).toEqual({
      rate: 10,
      source: "product",
    })
  })

  it("honours a named zero rate rather than treating it as unset", () => {
    // "GST Free" is a real answer, not a missing one.
    expect(
      resolveLineTaxRate(
        { product: { gstRate: 10, taxRate: { rate: 0, status: "active" } } },
        settings
      )
    ).toEqual({ rate: 0, source: "product" })
  })

  it("still lets an exempt product beat any named rate", () => {
    expect(
      resolveLineTaxRate(
        { product: { gstRate: 10, gstExempt: true, taxRate: { rate: 18, status: "active" } } },
        settings
      )
    ).toEqual({ rate: 0, source: "exempt" })
  })
})
