/**
 * Money in more than one currency.
 *
 * Two rules drive everything here, and both exist because breaking them is
 * silent:
 *
 *   1. A document keeps the rate it was raised at, forever. Looking the rate
 *      up again at read time means last quarter's invoices change value every
 *      morning, the ledger stops reconciling, and nobody notices until an
 *      audit. So conversion takes a rate as an argument; it never fetches one.
 *
 *   2. Rounding happens once, at the end, to the target currency's own number
 *      of decimals. Rounding an intermediate — or assuming two decimals —
 *      loses yen and misplaces dinars, and the error compounds across lines.
 *
 * Pure. The rate table is passed in.
 */

/**
 * Minor units per currency, where it is not two.
 *
 * Not a complete ISO 4217 table on purpose: the list is the exceptions we can
 * name, and everything else takes the two-decimal default. A currency added in
 * settings that belongs here can be given its own `decimals` on the row rather
 * than requiring a code change.
 */
const DECIMAL_EXCEPTIONS: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
}

export function decimalsFor(code: string, override?: number | null): number {
  if (override !== undefined && override !== null) return override
  return DECIMAL_EXCEPTIONS[code.toUpperCase()] ?? 2
}

/**
 * Rounds to a currency's minor unit, half away from zero.
 *
 * Not `Math.round`, which is half-up and therefore asymmetric about zero:
 * -0.005 rounds to -0.00 while 0.005 rounds to 0.01, so a credit note and the
 * invoice it reverses can differ by a cent.
 */
export function roundMoney(amount: number, decimals = 2): number {
  if (!Number.isFinite(amount)) return 0

  const factor = 10 ** decimals
  // Scaling first and nudging by Number.EPSILON keeps 1.005 from landing just
  // below the halfway point in binary floating point.
  const scaled = amount * factor
  const rounded =
    scaled >= 0
      ? Math.round(scaled + Number.EPSILON * Math.abs(scaled))
      : -Math.round(-scaled + Number.EPSILON * Math.abs(scaled))

  // `|| 0` turns -0 into 0, so a zero line never prints as "-$0.00".
  return rounded / factor || 0
}

export interface ExchangeRate {
  from: string
  to: string
  /** Units of `to` per one unit of `from`. */
  rate: number
  /** The rate applies from this moment until a later one supersedes it. */
  effectiveFrom: Date
}

export type RateLookup =
  | { ok: true; rate: number; via: "direct" | "inverse" | "triangulated"; effectiveFrom: Date | null }
  | { ok: false; error: string }

/**
 * The rate to use between two currencies at a point in time.
 *
 * Tries three things, in the order of how much they can be trusted:
 *
 *   - A rate quoted for this exact pair.
 *   - The inverse of the opposite pair. Arithmetically sound, and worth
 *     distinguishing because a quoted AUD/USD and an inverted USD/AUD can
 *     differ by the spread.
 *   - Both legs through the base currency. Standard practice where a house
 *     currency is quoted against everything, and the one most likely to
 *     surprise someone reading a converted figure — hence `via`.
 *
 * Same currency is 1 without consulting the table: a missing self-rate is not
 * a reason to refuse.
 */
export function findRate(
  from: string,
  to: string,
  on: Date,
  rates: ExchangeRate[],
  baseCurrency?: string
): RateLookup {
  const source = from.toUpperCase()
  const target = to.toUpperCase()

  if (source === target) {
    return { ok: true, rate: 1, via: "direct", effectiveFrom: null }
  }

  const asOf = (a: string, b: string) =>
    rates
      .filter(
        (row) =>
          row.from.toUpperCase() === a &&
          row.to.toUpperCase() === b &&
          row.effectiveFrom.getTime() <= on.getTime() &&
          row.rate > 0
      )
      // Latest rate that had already taken effect. A rate dated tomorrow must
      // not be used to value today's invoice.
      .sort((x, y) => y.effectiveFrom.getTime() - x.effectiveFrom.getTime())[0]

  const direct = asOf(source, target)
  if (direct) {
    return { ok: true, rate: direct.rate, via: "direct", effectiveFrom: direct.effectiveFrom }
  }

  const inverse = asOf(target, source)
  if (inverse) {
    return {
      ok: true,
      rate: 1 / inverse.rate,
      via: "inverse",
      effectiveFrom: inverse.effectiveFrom,
    }
  }

  if (baseCurrency) {
    const base = baseCurrency.toUpperCase()

    if (base !== source && base !== target) {
      const toBase = asOf(source, base) ?? invert(asOf(base, source))
      const fromBase = asOf(base, target) ?? invert(asOf(target, base))

      if (toBase && fromBase) {
        return {
          ok: true,
          rate: toBase.rate * fromBase.rate,
          via: "triangulated",
          // The older of the two legs: the pair is only as current as its
          // staler half, and saying otherwise overstates the rate's age.
          effectiveFrom:
            toBase.effectiveFrom.getTime() <= fromBase.effectiveFrom.getTime()
              ? toBase.effectiveFrom
              : fromBase.effectiveFrom,
        }
      }
    }
  }

  return { ok: false, error: `No exchange rate from ${source} to ${target} on ${on.toISOString().slice(0, 10)}` }
}

function invert(row: ExchangeRate | undefined): ExchangeRate | undefined {
  if (!row || row.rate <= 0) return undefined
  return { from: row.to, to: row.from, rate: 1 / row.rate, effectiveFrom: row.effectiveFrom }
}

export interface Converted {
  amount: number
  currency: string
  rate: number
  decimals: number
}

/**
 * Converts an amount at a given rate.
 *
 * The rate is an argument rather than a lookup so a stored historical rate can
 * be replayed exactly. Passing today's rate to revalue an old document is then
 * a visible decision at the call site, not the default.
 */
export function convert(
  amount: number,
  to: string,
  rate: number,
  options: { decimals?: number | null } = {}
): Converted {
  const decimals = decimalsFor(to, options.decimals)

  return {
    amount: roundMoney(amount * rate, decimals),
    currency: to.toUpperCase(),
    rate,
    decimals,
  }
}

export interface LineToConvert {
  /** Any stable identifier; only used to hand the result back. */
  id: string
  amount: number
}

export interface ConvertedLines {
  lines: Array<{ id: string; amount: number }>
  total: number
}

/**
 * Converts a document's lines so they still add up to the converted total.
 *
 * Rounding each line independently and summing gives a total that can differ
 * from the converted total by a cent or two — enough for an invoice to fail
 * its own arithmetic. The largest line absorbs the difference, which is the
 * convention that hides it best: a cent on the biggest line is invisible,
 * whereas spreading it changes several numbers.
 */
export function convertLines(
  lines: LineToConvert[],
  to: string,
  rate: number,
  options: { decimals?: number | null } = {}
): ConvertedLines {
  const decimals = decimalsFor(to, options.decimals)

  if (!lines.length) {
    return { lines: [], total: 0 }
  }

  const converted = lines.map((line) => ({
    id: line.id,
    amount: roundMoney(line.amount * rate, decimals),
  }))

  const target = roundMoney(
    lines.reduce((sum, line) => sum + line.amount, 0) * rate,
    decimals
  )
  const sum = roundMoney(
    converted.reduce((running, line) => running + line.amount, 0),
    decimals
  )

  const drift = roundMoney(target - sum, decimals)

  if (drift !== 0) {
    let largest = 0
    for (let index = 1; index < converted.length; index++) {
      if (Math.abs(converted[index].amount) > Math.abs(converted[largest].amount)) {
        largest = index
      }
    }

    converted[largest] = {
      ...converted[largest],
      amount: roundMoney(converted[largest].amount + drift, decimals),
    }
  }

  return { lines: converted, total: target }
}

/**
 * Formats an amount in its own currency.
 *
 * Goes through Intl rather than a symbol table: symbol placement, grouping and
 * the decimal mark differ by currency and locale, and a hand-rolled table gets
 * that wrong in ways that look like a typo on a customer's invoice.
 */
export function formatMoney(
  amount: number,
  currency: string,
  options: { locale?: string; decimals?: number | null } = {}
): string {
  const code = currency.toUpperCase()
  const decimals = decimalsFor(code, options.decimals)

  try {
    return new Intl.NumberFormat(options.locale || "en-AU", {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount)
  } catch {
    // An unrecognised code should print the number, not throw on a page that
    // is otherwise fine.
    return `${code} ${amount.toFixed(decimals)}`
  }
}
