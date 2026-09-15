import { beforeEach, describe, expect, it, vi } from "vitest"

const settings = vi.fn()
const findUnique = vi.fn(async () => null)
const findMany = vi.fn(async () => [] as unknown[])

vi.mock("@/lib/settings/service", () => ({ getSettings: () => settings() }))
vi.mock("@/lib/db", () => ({
  db: {
    currency: { findUnique: (...a: unknown[]) => findUnique(...(a as [])) },
    exchangeRate: { findMany: (...a: unknown[]) => findMany(...(a as [])) },
  },
}))

const { priceInBase } = await import("./service")

beforeEach(() => {
  settings.mockReset()
  settings.mockResolvedValue({
    baseCurrency: "AUD",
    allowForeignCurrencySales: true,
    allowTriangulation: true,
    maxRateAgeDays: 7,
    displayLocale: "en-AU",
  })
  findUnique.mockResolvedValue(null)
  findMany.mockResolvedValue([])
})

describe("priceInBase", () => {
  it("treats a missing currency as the entity's own", async () => {
    // Most orders name no currency. Reading an absent one as a currency
    // called "" sends every ordinary order looking for a rate from "" to AUD,
    // which cannot exist — so nothing could be ordered at all.
    for (const absent of [undefined, null, "", "   "]) {
      const result = await priceInBase(100, absent as unknown as string)

      expect(result, String(absent)).toMatchObject({
        ok: true,
        currency: "AUD",
        exchangeRate: 1,
        baseTotal: 100,
      })
    }
  })

  it("refuses a foreign currency when foreign sales are off", async () => {
    settings.mockResolvedValue({
      baseCurrency: "AUD",
      allowForeignCurrencySales: false,
      allowTriangulation: true,
      maxRateAgeDays: 7,
      displayLocale: "en-AU",
    })

    const result = await priceInBase(100, "USD")

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("Currency settings")
  })

  it("still prices in the base currency when foreign sales are off", async () => {
    settings.mockResolvedValue({
      baseCurrency: "AUD",
      allowForeignCurrencySales: false,
      allowTriangulation: true,
      maxRateAgeDays: 7,
      displayLocale: "en-AU",
    })

    // Turning foreign sales off must not stop ordinary trading.
    await expect(priceInBase(100, "AUD")).resolves.toMatchObject({ ok: true })
    await expect(priceInBase(100, "")).resolves.toMatchObject({ ok: true })
  })

  it("refuses a rate older than the limit rather than posting it as fact", async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)
    findMany.mockResolvedValue([
      { fromCode: "USD", toCode: "AUD", rate: 1.5, effectiveFrom: thirtyDaysAgo, companyId: null },
    ])

    const result = await priceInBase(100, "USD")

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("30 days old")
  })

  it("uses a current rate and hands back what it used", async () => {
    findMany.mockResolvedValue([
      { fromCode: "USD", toCode: "AUD", rate: 1.5, effectiveFrom: new Date(), companyId: null },
    ])

    await expect(priceInBase(100, "usd")).resolves.toMatchObject({
      ok: true,
      currency: "USD",
      exchangeRate: 1.5,
      baseTotal: 150,
    })
  })
})
