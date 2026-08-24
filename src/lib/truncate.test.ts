import { describe, expect, it } from "vitest"

import { initials, truncateLabel } from "./truncate"

describe("truncateLabel", () => {
  it("leaves a short name alone", () => {
    expect(truncateLabel("Coles", 18)).toBe("Coles")
  })

  it("marks a shortened name so it is not mistaken for the real one", () => {
    // The bug: "Independent Grocers Network".slice(0, 16) === "Independent Groc",
    // which reads as a company by that name.
    const result = truncateLabel("Independent Grocers Network", 18)

    expect(result.endsWith("…")).toBe(true)
    expect(result).not.toBe("Independent Groc")
  })

  it("never exceeds the budget it was given", () => {
    for (const name of ["Independent Grocers Network", "Woolworths Metro Sydney", "A".repeat(40)]) {
      expect(truncateLabel(name, 18).length, name).toBeLessThanOrEqual(18)
    }
  })

  it("breaks on a word boundary when one is close to the cut", () => {
    expect(truncateLabel("Woolworths Metro Sydney", 18)).toBe("Woolworths Metro…")
  })

  it("does not break so early that the name loses what identifies it", () => {
    // Breaking at the first space would give "Independent", which does not
    // distinguish it from any other Independent.
    // 18 characters cannot fit "Independent Grocers", so the test is that it
    // reaches into the second word rather than stopping at the first.
    expect(truncateLabel("Independent Grocers Network", 18)).toContain("Groc")
  })

  it("cuts mid-word when there is no usable boundary", () => {
    expect(truncateLabel("Supercalifragilistic", 10)).toBe("Supercali…")
  })

  it("handles empty and nullish input", () => {
    expect(truncateLabel(null)).toBe("")
    expect(truncateLabel(undefined)).toBe("")
    expect(truncateLabel("   ")).toBe("")
  })
})

describe("initials", () => {
  it("takes at most two, so a long trading name stays readable", () => {
    expect(initials("Independent Grocers Network")).toBe("IG")
    expect(initials("Coles")).toBe("C")
    expect(initials("")).toBe("")
  })
})
