import { describe, expect, it } from "vitest"

import {
  convert,
  convertLines,
  decimalsFor,
  findRate,
  formatMoney,
  roundMoney,
  type ExchangeRate,
} from "./rates"

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

const rates: ExchangeRate[] = [
  { from: "AUD", to: "USD", rate: 0.62, effectiveFrom: day("2026-01-01") },
  { from: "AUD", to: "USD", rate: 0.66, effectiveFrom: day("2026-06-01") },
  { from: "AUD", to: "EUR", rate: 0.6, effectiveFrom: day("2026-01-01") },
  { from: "NZD", to: "AUD", rate: 0.92, effectiveFrom: day("2026-01-01") },
  // Dated ahead: must not be used for anything before it takes effect.
  { from: "AUD", to: "USD", rate: 0.99, effectiveFrom: day("2027-01-01") },
]

describe("decimalsFor", () => {
  it("defaults to two", () => {
    expect(decimalsFor("AUD")).toBe(2)
    expect(decimalsFor("usd")).toBe(2)
  })

  it("knows the currencies that are not two", () => {
    expect(decimalsFor("JPY")).toBe(0)
    expect(decimalsFor("KWD")).toBe(3)
  })

  it("lets a row override, so a new currency needs no code change", () => {
    expect(decimalsFor("XYZ", 4)).toBe(4)
    expect(decimalsFor("JPY", 2)).toBe(2)
    // Zero is a real answer, not a missing one.
    expect(decimalsFor("AUD", 0)).toBe(0)
  })
})

describe("roundMoney", () => {
  it("rounds to the minor unit", () => {
    expect(roundMoney(1.005, 2)).toBe(1.01)
    expect(roundMoney(2.675, 2)).toBe(2.68)
    expect(roundMoney(1234.5, 0)).toBe(1235)
  })

  it("rounds negatives symmetrically", () => {
    // Math.round is half-up, so -0.005 would round to -0.00 while 0.005 rounds
    // to 0.01, and a credit note would not reverse its invoice exactly.
    expect(roundMoney(-1.005, 2)).toBe(-1.01)
    expect(roundMoney(-2.675, 2)).toBe(-2.68)
    expect(roundMoney(-0.005, 2)).toBe(-0.01)
  })

  it("never produces negative zero", () => {
    expect(Object.is(roundMoney(-0.001, 2), 0)).toBe(true)
  })

  it("copes with the values that are not numbers", () => {
    expect(roundMoney(NaN)).toBe(0)
    expect(roundMoney(Infinity)).toBe(0)
  })
})

describe("findRate", () => {
  it("uses a rate quoted for the pair", () => {
    const result = findRate("AUD", "USD", day("2026-07-01"), rates)

    expect(result).toMatchObject({ ok: true, rate: 0.66, via: "direct" })
  })

  it("uses the rate in force on the day, not the newest one", () => {
    // An invoice raised in March is valued at March's rate. Re-valuing it at
    // today's rate is the bug this whole module exists to prevent.
    const result = findRate("AUD", "USD", day("2026-03-15"), rates)

    expect(result).toMatchObject({ ok: true, rate: 0.62 })
  })

  it("ignores a rate that has not taken effect yet", () => {
    const result = findRate("AUD", "USD", day("2026-12-31"), rates)

    expect(result).toMatchObject({ ok: true, rate: 0.66 })
  })

  it("inverts the opposite pair when only that is quoted", () => {
    const result = findRate("AUD", "NZD", day("2026-07-01"), rates)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.via).toBe("inverse")
    expect(result.rate).toBeCloseTo(1 / 0.92, 10)
  })

  it("goes through the base currency when neither pair is quoted", () => {
    // USD -> EUR exists nowhere; both legs against AUD do.
    const result = findRate("USD", "EUR", day("2026-07-01"), rates, "AUD")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.via).toBe("triangulated")
    expect(result.rate).toBeCloseTo((1 / 0.66) * 0.6, 10)
  })

  it("dates a triangulated rate by its staler leg", () => {
    const mixed: ExchangeRate[] = [
      { from: "AUD", to: "USD", rate: 0.66, effectiveFrom: day("2026-06-01") },
      { from: "AUD", to: "EUR", rate: 0.6, effectiveFrom: day("2026-01-01") },
    ]

    const result = findRate("USD", "EUR", day("2026-07-01"), mixed, "AUD")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Saying the pair is as current as its newer half overstates it.
    expect(result.effectiveFrom).toEqual(day("2026-01-01"))
  })

  it("does not triangulate through a currency that is one of the two", () => {
    // AUD -> GBP with base AUD: there is no route, and pretending otherwise
    // would produce a rate of 1.
    const result = findRate("AUD", "GBP", day("2026-07-01"), rates, "AUD")

    expect(result.ok).toBe(false)
  })

  it("treats a currency as worth one of itself without a rate", () => {
    const result = findRate("JPY", "JPY", day("2026-07-01"), [])

    expect(result).toMatchObject({ ok: true, rate: 1 })
  })

  it("is not case sensitive", () => {
    expect(findRate("aud", "usd", day("2026-07-01"), rates)).toMatchObject({ rate: 0.66 })
  })

  it("says which pair and which day when it cannot find one", () => {
    const result = findRate("AUD", "GBP", day("2026-07-01"), rates)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("GBP")
    expect(result.error).toContain("2026-07-01")
  })

  it("refuses a rate of zero rather than dividing by it", () => {
    const broken: ExchangeRate[] = [
      { from: "USD", to: "AUD", rate: 0, effectiveFrom: day("2026-01-01") },
    ]

    expect(findRate("AUD", "USD", day("2026-07-01"), broken).ok).toBe(false)
  })

  it("finds nothing before the earliest rate, rather than reaching back", () => {
    const result = findRate("AUD", "USD", day("2025-06-01"), rates)

    expect(result.ok).toBe(false)
  })
})

describe("convert", () => {
  it("applies the rate and rounds to the target currency", () => {
    expect(convert(100, "USD", 0.66)).toMatchObject({ amount: 66, currency: "USD", decimals: 2 })
  })

  it("rounds to no decimals for a zero-decimal currency", () => {
    // 100 AUD at 98.7 is 9870 yen, not 9870.00.
    expect(convert(100, "JPY", 98.765)).toMatchObject({ amount: 9877, decimals: 0 })
  })

  it("keeps three decimals for a three-decimal currency", () => {
    expect(convert(100, "KWD", 0.19876)).toMatchObject({ amount: 19.876, decimals: 3 })
  })

  it("hands back the rate it used, so it can be stored with the document", () => {
    expect(convert(50, "USD", 0.66).rate).toBe(0.66)
  })
})

describe("convertLines", () => {
  it("makes the lines add up to the converted total", () => {
    // Each line rounds down a fraction; summed they fall a cent short of the
    // total, and an invoice that fails its own arithmetic gets queried.
    const result = convertLines(
      [
        { id: "a", amount: 10.01 },
        { id: "b", amount: 10.01 },
        { id: "c", amount: 10.01 },
      ],
      "USD",
      0.665
    )

    const sum = result.lines.reduce((running, line) => running + line.amount, 0)
    expect(roundMoney(sum, 2)).toBe(result.total)
  })

  it("puts the rounding difference on the largest line", () => {
    const result = convertLines(
      [
        { id: "small", amount: 0.03 },
        { id: "big", amount: 1000.07 },
        { id: "mid", amount: 5.03 },
      ],
      "USD",
      0.6666
    )

    const sum = result.lines.reduce((running, line) => running + line.amount, 0)
    expect(roundMoney(sum, 2)).toBe(result.total)

    // The small lines keep their own straightforward conversion.
    expect(result.lines.find((line) => line.id === "small")!.amount).toBe(roundMoney(0.03 * 0.6666, 2))
  })

  it("handles a credit note, where the largest line is the most negative", () => {
    const result = convertLines(
      [
        { id: "a", amount: -1000.07 },
        { id: "b", amount: -0.03 },
      ],
      "USD",
      0.6666
    )

    const sum = result.lines.reduce((running, line) => running + line.amount, 0)
    expect(roundMoney(sum, 2)).toBe(result.total)
    expect(result.total).toBeLessThan(0)
  })

  it("returns nothing for no lines instead of dividing by zero lines", () => {
    expect(convertLines([], "USD", 0.66)).toEqual({ lines: [], total: 0 })
  })

  it("leaves a single line equal to the total", () => {
    const result = convertLines([{ id: "only", amount: 33.33 }], "USD", 0.665)

    expect(result.lines[0].amount).toBe(result.total)
  })
})

describe("formatMoney", () => {
  it("formats in the currency's own decimals", () => {
    expect(formatMoney(1234.5, "AUD")).toContain("1,234.50")
    // Yen has no minor unit; printing ¥1,234.00 looks like a mistake.
    expect(formatMoney(1234, "JPY")).not.toContain(".00")
  })

  it("prints the number rather than throwing on a code Intl does not know", () => {
    const formatted = formatMoney(10, "ZZZ")

    expect(formatted).toContain("10")
    expect(formatted).toContain("ZZZ")
  })
})
