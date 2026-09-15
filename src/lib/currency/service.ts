import { db } from "@/lib/db"
import { getSettings } from "@/lib/settings/service"
import {
  convert,
  convertLines,
  decimalsFor,
  findRate,
  formatMoney,
  roundMoney,
  type ExchangeRate,
  type LineToConvert,
} from "@/lib/currency/rates"

/**
 * Currencies and rates, against the database.
 *
 * The arithmetic is in `rates.ts` and takes a rate as an argument. This file
 * is the part that decides which rate — and, just as importantly, refuses when
 * the only rate available is too old to price against.
 */

/** Settings that gate an action are read uncached, as elsewhere. */
function liveSettings(companyId: string | null) {
  return getSettings("currency", { companyId, skipCache: true })
}

/**
 * Rates visible to a company: its own, plus the shared ones.
 *
 * A group entity can quote its own rate — a forward contract, a negotiated
 * intercompany rate — without that leaking to its siblings. Where it has not,
 * the shared rate applies.
 */
async function loadRates(companyId: string | null): Promise<ExchangeRate[]> {
  const rows = await db.exchangeRate.findMany({
    where: { OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])] },
    select: { fromCode: true, toCode: true, rate: true, effectiveFrom: true, companyId: true },
    orderBy: { effectiveFrom: "desc" },
    take: 5_000,
  })

  // A company's own rate must win over the shared one for the same pair and
  // day; sorting it later means the as-of lookup (which takes the newest
  // effective rate) sees it first.
  return rows
    .sort((a, b) => {
      if (a.effectiveFrom.getTime() !== b.effectiveFrom.getTime()) {
        return b.effectiveFrom.getTime() - a.effectiveFrom.getTime()
      }
      return (b.companyId ? 1 : 0) - (a.companyId ? 1 : 0)
    })
    .map((row) => ({
      from: row.fromCode,
      to: row.toCode,
      rate: row.rate,
      effectiveFrom: row.effectiveFrom,
    }))
}

export type PricingRate =
  | { ok: true; rate: number; via: string; effectiveFrom: Date | null; ageDays: number | null }
  | { ok: false; error: string }

/**
 * The rate to price a document at, or a refusal with a reason.
 *
 * Refuses a stale rate on purpose. A three-week-old rate is not a conservative
 * estimate — it is a number that looks authoritative and is wrong by whatever
 * the market has done since, and it will be posted to the ledger as fact.
 */
export async function rateForPricing(
  from: string,
  to: string,
  options: { on?: Date; companyId?: string | null } = {}
): Promise<PricingRate> {
  const companyId = options.companyId ?? null
  const on = options.on ?? new Date()
  const settings = await liveSettings(companyId)

  const found = findRate(
    from,
    to,
    on,
    await loadRates(companyId),
    settings.allowTriangulation ? settings.baseCurrency : undefined
  )

  if (!found.ok) {
    return { ok: false, error: found.error }
  }

  const ageDays = found.effectiveFrom
    ? Math.floor((on.getTime() - found.effectiveFrom.getTime()) / 86_400_000)
    : null

  if (
    settings.maxRateAgeDays > 0 &&
    ageDays !== null &&
    ageDays > settings.maxRateAgeDays
  ) {
    return {
      ok: false,
      error: `The ${from.toUpperCase()}/${to.toUpperCase()} rate is ${ageDays} days old; the limit is ${settings.maxRateAgeDays}. Enter a current rate, or raise the limit in Currency settings.`,
    }
  }

  return { ok: true, rate: found.rate, via: found.via, effectiveFrom: found.effectiveFrom, ageDays }
}

export type PriceResult =
  | {
      ok: true
      currency: string
      baseCurrency: string
      exchangeRate: number
      baseTotal: number
      via: string
    }
  | { ok: false; error: string }

/**
 * What a document in `currency` is worth in the entity's own currency.
 *
 * Returns the rate alongside the figure so the caller can store both. Storing
 * only the converted total means nobody can later answer "at what rate?", and
 * storing only the rate means the figure has to be recomputed — which is how
 * a posted ledger entry and the document it came from drift apart.
 */
export async function priceInBase(
  amount: number,
  currency: string,
  options: { on?: Date; companyId?: string | null } = {}
): Promise<PriceResult> {
  const companyId = options.companyId ?? null
  const settings = await liveSettings(companyId)
  const base = settings.baseCurrency.toUpperCase()

  // No currency means the entity's own. Most orders say nothing, and treating
  // an absent currency as a currency named "" sends every ordinary order
  // looking for a rate that cannot exist.
  const source = (currency || "").trim().toUpperCase() || base

  if (source !== base && !settings.allowForeignCurrencySales) {
    return {
      ok: false,
      error: `Selling in ${source} is turned off. Enable foreign-currency sales in Currency settings.`,
    }
  }

  if (source === base) {
    return {
      ok: true,
      currency: base,
      baseCurrency: base,
      exchangeRate: 1,
      baseTotal: roundMoney(amount, await decimalsForCode(base)),
      via: "direct",
    }
  }

  const rate = await rateForPricing(source, base, { on: options.on, companyId })
  if (!rate.ok) {
    return { ok: false, error: rate.error }
  }

  const converted = convert(amount, base, rate.rate, { decimals: await decimalsForCode(base) })

  return {
    ok: true,
    currency: source,
    baseCurrency: base,
    exchangeRate: rate.rate,
    baseTotal: converted.amount,
    via: rate.via,
  }
}

/** A currency's stored decimal override, if it has one. */
async function decimalsForCode(code: string) {
  const row = await db.currency.findUnique({
    where: { code: code.toUpperCase() },
    select: { decimals: true },
  })

  return decimalsFor(code, row?.decimals ?? null)
}

/**
 * Converts a document's lines and total together.
 *
 * Uses the stored rate rather than looking one up, so re-rendering an old
 * invoice reproduces exactly what was posted.
 */
export async function convertDocument(
  lines: LineToConvert[],
  to: string,
  rate: number
): Promise<{ lines: Array<{ id: string; amount: number }>; total: number }> {
  return convertLines(lines, to, rate, { decimals: await decimalsForCode(to) })
}

/**
 * Records a rate.
 *
 * Effective-dated rather than updated in place: overwriting means every
 * document already raised silently changes value.
 */
export async function recordRate(input: {
  from: string
  to: string
  rate: number
  effectiveFrom?: Date
  source?: string
  companyId?: string | null
}) {
  const from = input.from.toUpperCase()
  const to = input.to.toUpperCase()

  if (from === to) {
    return { ok: false as const, error: "A currency is always worth one of itself" }
  }

  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    return { ok: false as const, error: "Rate must be greater than zero" }
  }

  const known = await db.currency.findMany({
    where: { code: { in: [from, to] } },
    select: { code: true },
  })

  if (known.length < 2) {
    const missing = [from, to].filter((code) => !known.some((row) => row.code === code))
    return { ok: false as const, error: `Not a configured currency: ${missing.join(", ")}` }
  }

  // Midnight, so a day has one rate rather than one per entry time — two
  // rates hours apart make "the rate on the 3rd" ambiguous.
  const effectiveFrom = input.effectiveFrom ?? new Date()
  effectiveFrom.setUTCHours(0, 0, 0, 0)

  const companyId = input.companyId ?? null

  // Found and updated rather than upserted: Prisma's compound-unique input
  // cannot express a null `companyId`, which a shared rate has. The database
  // still enforces the constraint — the index is NULLS NOT DISTINCT, so a
  // second shared rate for the same pair and day is refused there.
  const existing = await db.exchangeRate.findFirst({
    where: { fromCode: from, toCode: to, effectiveFrom, companyId },
    select: { id: true },
  })

  const row = existing
    ? await db.exchangeRate.update({
        where: { id: existing.id },
        data: { rate: input.rate, source: input.source ?? "manual" },
        select: { id: true, effectiveFrom: true },
      })
    : await db.exchangeRate.create({
        data: {
          fromCode: from,
          toCode: to,
          rate: input.rate,
          effectiveFrom,
          source: input.source ?? "manual",
          companyId,
        },
        select: { id: true, effectiveFrom: true },
      })

  return { ok: true as const, id: row.id, effectiveFrom: row.effectiveFrom }
}

/** Configured currencies, with the rate each is at today. */
export async function listCurrencies(companyId: string | null = null) {
  const settings = await liveSettings(companyId)
  const base = settings.baseCurrency.toUpperCase()
  const on = new Date()

  const [currencies, rates] = await Promise.all([
    db.currency.findMany({ orderBy: { code: "asc" } }),
    loadRates(companyId),
  ])

  return {
    baseCurrency: base,
    displayLocale: settings.displayLocale,
    currencies: currencies.map((currency) => {
      const found =
        currency.code === base
          ? ({ ok: true, rate: 1, via: "direct", effectiveFrom: null } as const)
          : findRate(
              currency.code,
              base,
              on,
              rates,
              settings.allowTriangulation ? base : undefined
            )

      return {
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        decimals: decimalsFor(currency.code, currency.decimals),
        isActive: currency.isActive,
        isBase: currency.code === base,
        rateToBase: found.ok ? found.rate : null,
        rateVia: found.ok ? found.via : null,
        rateEffectiveFrom: found.ok ? found.effectiveFrom : null,
        rateError: found.ok ? null : found.error,
        sample: found.ok
          ? formatMoney(found.rate, base, { locale: settings.displayLocale })
          : null,
      }
    }),
  }
}

/** Rate history for a pair, newest first. */
export async function rateHistory(from: string, to: string, companyId: string | null = null) {
  return db.exchangeRate.findMany({
    where: {
      fromCode: from.toUpperCase(),
      toCode: to.toUpperCase(),
      OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
    },
    orderBy: { effectiveFrom: "desc" },
    take: 200,
    select: { id: true, rate: true, effectiveFrom: true, source: true, companyId: true },
  })
}
