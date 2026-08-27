import type { SettingsOf } from "@/lib/settings/registry"
import { calculateTax, type TaxBreakdown } from "@/lib/tax-engine"
import type { CountryCode } from "@/lib/types"

/**
 * Line-level tax resolution.
 *
 * `tax-engine.ts` has a complete, correct calculator — including Indian
 * CGST/SGST/IGST splitting — and nothing called it. Meanwhile the order and
 * quote paths resolved a rate as `item.taxRate || product.gstRate`, which
 * stopped two steps short: a tax-exempt customer was still charged GST, and
 * `Company.gstRate` was editable on screen while nothing read it.
 *
 * This module supplies the missing chain and hands the result to the engine.
 * Pure: the caller resolves settings and passes the context in.
 */

export interface TaxContext {
  /** An explicit rate on the line, if the user overrode it. */
  lineRate?: number | null
  product?: {
    gstRate?: number | null
    gstExempt?: boolean | null
    /**
     * A named rate the product is sold under. Wins over the bare `gstRate`,
     * because it is the one someone deliberately chose — and the one that can
     * be changed in a single place.
     */
    taxRate?: { rate: number; status?: string | null; taxType?: string | null } | null
  } | null
  customer?: { customerType?: string | null } | null
  company?: { gstRate?: number | null; country?: string | null } | null
}

export type TaxSource = "line" | "product" | "customer" | "company" | "default" | "exempt"

export interface ResolvedRate {
  rate: number
  /** Which link in the chain supplied it — worth persisting for "why 0%?". */
  source: TaxSource
}

function isUsable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

/**
 * Walk the configured chain, first usable rate wins.
 *
 * Exemption is checked before the chain, not as part of it: an exempt customer
 * pays no GST regardless of what the product carries. That is the whole point
 * of the flag, and folding it into the ordering would let a product rate
 * override it.
 */
export function resolveLineTaxRate(
  context: TaxContext,
  settings: SettingsOf<"tax">
): ResolvedRate {
  const customerType = context.customer?.customerType?.toLowerCase()

  if (customerType && settings.exemptCustomerTypes.some((t) => t.toLowerCase() === customerType)) {
    return { rate: 0, source: "exempt" }
  }

  if (context.product?.gstExempt) {
    return { rate: 0, source: "exempt" }
  }

  for (const step of settings.resolutionOrder) {
    switch (step) {
      case "line":
        if (isUsable(context.lineRate)) return { rate: context.lineRate, source: "line" }
        break
      case "product": {
        // A named rate first. An archived one is ignored rather than applied,
        // so retiring a rate does not keep charging it.
        const named = context.product?.taxRate
        if (named && named.status !== "archived" && isUsable(named.rate)) {
          return { rate: named.rate, source: "product" }
        }

        if (isUsable(context.product?.gstRate)) {
          return { rate: context.product.gstRate, source: "product" }
        }
        break
      }
      case "customer":
        // No customer-level rate column exists yet; customers participate via
        // exemption only. Listed so the ordering stays honest and adding the
        // column later is a one-line change here.
        break
      case "company":
        if (isUsable(context.company?.gstRate)) {
          return { rate: context.company.gstRate, source: "company" }
        }
        break
    }
  }

  if (isUsable(settings.defaultRate)) {
    return { rate: settings.defaultRate, source: "default" }
  }

  return { rate: 0, source: "default" }
}

function roundTo(value: number, dp: number) {
  const factor = 10 ** dp
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export interface LineTaxResult extends ResolvedRate {
  taxableAmount: number
  taxAmount: number
  total: number
  breakdown: TaxBreakdown
}

/**
 * Tax for a single line, rounded per `roundingMode`.
 *
 * `roundingMode: "document"` defers rounding to the caller summing the lines —
 * this returns the unrounded figure in that case, so the two modes genuinely
 * differ rather than both rounding here.
 */
export function computeLineTax(
  taxableAmount: number,
  context: TaxContext,
  settings: SettingsOf<"tax">,
  options?: { fromState?: string; toState?: string }
): LineTaxResult {
  const resolved = resolveLineTaxRate(context, settings)

  const country = (settings.country ??
    context.company?.country ??
    "AU") as CountryCode

  const breakdown = calculateTax({
    country,
    subtotal: taxableAmount,
    gstRate: resolved.rate,
    fromState: options?.fromState,
    toState: options?.toState,
  })

  const taxAmount =
    settings.roundingMode === "line"
      ? roundTo(breakdown.totalTax, settings.roundingDp)
      : breakdown.totalTax

  return {
    ...resolved,
    taxableAmount,
    taxAmount,
    total: taxableAmount + taxAmount,
    breakdown,
  }
}

/**
 * The rate a new product or line should start on.
 *
 * Settings win, then the company's own rate. Neither is a literal, which is the
 * point: creating a product used to fall back to `|| 10`, so a business on any
 * other rate got 10% on everything it added — and that then propagated into
 * purchase orders, which read the rate off the product.
 *
 * Returns null rather than guessing when nothing is configured. A caller that
 * cannot find a rate should say so; inventing one is how the wrong number gets
 * onto an invoice quietly.
 */
export async function resolveDefaultTaxRate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  settings: SettingsOf<"tax">,
  companyId?: string | null
): Promise<number | null> {
  if (settings.defaultRate !== null && settings.defaultRate !== undefined) {
    return settings.defaultRate
  }

  const company = await db.company.findFirst(
    companyId
      ? { where: { id: companyId }, select: { gstRate: true } }
      : { select: { gstRate: true } }
  )

  return company?.gstRate ?? null
}
