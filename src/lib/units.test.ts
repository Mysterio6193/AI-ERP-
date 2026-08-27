import { describe, expect, it } from "vitest"

import { convertWithUnits, describeWithUnits, type ResolvedUnit } from "@/lib/units"

/**
 * This arithmetic decides how much physically leaves the building. Ten pallets
 * and ten boxes differ by a factor of sixty, and getting it wrong is a truck
 * with the wrong load on it and no error message anywhere.
 */

const unit = (over: Partial<ResolvedUnit> & { code: string; factor: number }): ResolvedUnit => ({
  id: `u-${over.code}`,
  name: over.code.toLowerCase(),
  isBase: over.factor === 1,
  price: 0,
  explicitPrice: false,
  weightKg: null,
  ...over,
})

// A base pizza carton, twelve to a layer, sixty to a pallet.
const UNITS: ResolvedUnit[] = [
  unit({ code: "CTN", name: "carton", factor: 1, price: 20 }),
  unit({ code: "LAYER", name: "layer", factor: 12, price: 230 }),
  unit({ code: "PLT", name: "pallet", factor: 60, price: 1100 }),
]

describe("convertWithUnits", () => {
  it("converts pallets to base cartons", () => {
    const result = convertWithUnits(UNITS, 10, "PLT")
    expect(result).toMatchObject({ ok: true, baseQuantity: 600 })
  })

  it("defaults to the base unit when none is named", () => {
    // The dangerous default: if this fell through to the largest unit, an order
    // for 10 would ship 600.
    expect(convertWithUnits(UNITS, 10)).toMatchObject({ baseQuantity: 10 })
  })

  it("accepts the unit by name as well as code", () => {
    expect(convertWithUnits(UNITS, 2, "pallet")).toMatchObject({ baseQuantity: 120 })
  })

  it("is not case sensitive about what someone typed", () => {
    expect(convertWithUnits(UNITS, 2, "plt")).toMatchObject({ baseQuantity: 120 })
    expect(convertWithUnits(UNITS, 2, " PLT ")).toMatchObject({ baseQuantity: 120 })
  })

  it("prices by the selling unit, not the base", () => {
    // A pallet is not sixty times the carton price, which is the whole reason a
    // unit may carry its own price.
    const result = convertWithUnits(UNITS, 2, "PLT")
    expect(result).toMatchObject({ unitPrice: 1100, lineTotal: 2200 })
  })

  it("says when it had to round rather than shipping a different number", () => {
    // Half a pallet is 30 cartons; half a layer is 6. But 0.55 of a layer is
    // 6.6, and quietly sending 7 is how a short delivery becomes an argument.
    const result = convertWithUnits(UNITS, 0.55, "LAYER")
    expect(result).toMatchObject({ baseQuantity: 7 })
    expect((result as { rounded?: unknown }).rounded).toEqual({ requested: 6.6000000000000005, actual: 7 })
  })

  it("does not flag rounding when the maths is exact", () => {
    const result = convertWithUnits(UNITS, 0.5, "PLT")
    expect(result).toMatchObject({ baseQuantity: 30 })
    expect((result as { rounded?: unknown }).rounded).toBeUndefined()
  })

  it("refuses a unit the product does not have, and lists what it does", () => {
    const result = convertWithUnits(UNITS, 5, "TRUCK")
    expect(result).toMatchObject({ ok: false })
    if (!("baseQuantity" in result)) {
      expect(result.error).toContain("CTN")
      expect(result.error).toContain("PLT")
    }
  })

  it("refuses a product with no units rather than assuming one", () => {
    expect(convertWithUnits([], 5, "CTN")).toMatchObject({ ok: false })
  })

  it("handles zero without inventing a line", () => {
    expect(convertWithUnits(UNITS, 0, "PLT")).toMatchObject({ baseQuantity: 0, lineTotal: 0 })
  })

  it("rounds money to cents", () => {
    const priced = [unit({ code: "BOX", name: "box", factor: 1, price: 3.333 })]
    expect(convertWithUnits(priced, 3, "BOX")).toMatchObject({ lineTotal: 10 })
  })
})

describe("describeWithUnits", () => {
  it("says it the way a picker would read it", () => {
    expect(describeWithUnits(UNITS, 192)).toBe("3 pallet + 12 carton")
  })

  it("omits the remainder when it divides evenly", () => {
    expect(describeWithUnits(UNITS, 120)).toBe("2 pallet")
  })

  it("drops to the base unit below a full pack", () => {
    expect(describeWithUnits(UNITS, 7)).toBe("7 carton")
  })

  it("uses the largest pack that fits, not the largest defined", () => {
    // 40 is more than three layers but less than a pallet.
    expect(describeWithUnits(UNITS, 40)).toBe("3 layer + 4 carton")
  })

  it("handles zero", () => {
    expect(describeWithUnits(UNITS, 0)).toBe("0 carton")
  })

  it("falls back to a bare number when nothing is defined", () => {
    expect(describeWithUnits([], 42)).toBe("42")
  })
})
