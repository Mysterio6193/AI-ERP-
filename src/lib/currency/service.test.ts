import { beforeEach, describe, expect, it, vi } from "vitest"

const settings = vi.fn()
const findUnique = vi.fn(async () => null)
const findMany = vi.fn(async () => [] as unknown[])
// The base currency comes from the company row, not from settings: Settings
// and the PDFs already read it there, and a second copy could disagree.
const company = vi.fn(async () => ({ baseCurrency: "AUD" }) as { baseCurrency: string } | null)

vi.mock("@/lib/settings/service", () => ({ getSettings: () => settings() }))
vi.mock("@/lib/db", () => ({
  db: {
    currency: { findUnique: (...a: unknown[]) => findUnique(...(a as [])) },
    exchangeRate: { findMany: (...a: unknown[]) => findMany(...(a as [])) },
    company: {
      findUnique: (...a: unknown[]) => company(...(a as [])),
      findFirst: (...a: unknown[]) => company(...(a as [])),
    },
  },
}))

const { priceInBase } = await import("./service")

beforeEach(() => {
  settings.mockReset()
  company.mockReset()
  company.mockResolvedValue({ baseCurrency: "AUD" })
  settings.mockResolvedValue({
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

  it("takes the base currency from the company, not from settings", async () => {
    // Company.baseCurrency is what Settings edits and what the invoice and
    // statement PDFs print. If this module kept its own copy, the ledger
    // could be kept in one currency while documents were printed in another.
    company.mockResolvedValue({ baseCurrency: "NZD" })

    await expect(priceInBase(100, "")).resolves.toMatchObject({
      ok: true,
      currency: "NZD",
      baseCurrency: "NZD",
      exchangeRate: 1,
    })
  })

  it("falls back to AUD when no company row exists", async () => {
    company.mockResolvedValue(null)

    await expect(priceInBase(100, "")).resolves.toMatchObject({ ok: true, currency: "AUD" })
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
