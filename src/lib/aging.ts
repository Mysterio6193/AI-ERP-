import { daysBetween } from "@/lib/dates"
import type { SettingsOf } from "@/lib/settings/registry"

export { daysBetween }

/**
 * Receivables aging — one definition.
 *
 * There were three, and they disagreed:
 *
 *   invoices/page.tsx          clamped days to >= 0, so nothing was ever "Current"
 *   finance/page.tsx           4 buckets ending "60+"
 *   CustomerStatementPDF.tsx   4 buckets ending "61+", computed inside the PDF
 *
 * The third is the one customers actually receive, which made the disagreement
 * a billing-credibility problem rather than a cosmetic one. The structural fix
 * is that the PDF no longer computes its own — it takes buckets as a prop.
 *
 * Pure by design: takes settings and a clock, touches no database, so the
 * client pages and the server-rendered PDF share one implementation.
 */

export interface AgeableInvoice {
  dueDate: Date | string | null | undefined
  invoiceDate?: Date | string | null
  /** Amount still owed. */
  outstanding: number
  status?: string | null
}

export interface AgingBucket {
  label: string
  minDays: number
  maxDays: number | null
  amount: number
  count: number
}

/** Statuses that carry no receivable, so they never age. */
const SETTLED_STATUSES = new Set(["paid", "cancelled", "void", "voided", "credited"])

/**
 * How many days past due. Negative means not yet due — which is what makes a
 * "Current" bucket possible. The old `Math.max(0, ...)` on the invoices page
 * collapsed every not-yet-due invoice into 0 days.
 */
export function daysOverdue(
  invoice: AgeableInvoice,
  settings: SettingsOf<"aging">,
  asOf: Date = new Date()
) {
  const basis =
    settings.basis === "invoiceDate"
      ? invoice.invoiceDate ?? invoice.dueDate
      : invoice.dueDate ?? invoice.invoiceDate

  if (!basis) {
    return 0
  }

  return daysBetween(new Date(basis), asOf)
}

function bucketFor(days: number, buckets: SettingsOf<"aging">["buckets"]) {
  return buckets.findIndex(
    (bucket) => days >= bucket.minDays && (bucket.maxDays === null || days <= bucket.maxDays)
  )
}

/**
 * Distribute invoices across the configured buckets.
 *
 * Invoices that match no bucket are returned in `unbucketed` rather than
 * silently dropped — the previous PDF implementation dropped them, so a
 * misconfigured range would quietly understate what a customer owed.
 */
export function bucketise(
  invoices: AgeableInvoice[],
  settings: SettingsOf<"aging">,
  asOf: Date = new Date()
): { buckets: AgingBucket[]; total: number; unbucketed: number } {
  const buckets: AgingBucket[] = settings.buckets.map((bucket) => ({
    ...bucket,
    amount: 0,
    count: 0,
  }))

  let total = 0
  let unbucketed = 0

  for (const invoice of invoices) {
    if (invoice.status && SETTLED_STATUSES.has(invoice.status.toLowerCase())) {
      continue
    }

    const amount = Number(invoice.outstanding) || 0
    if (amount === 0) {
      continue
    }

    total += amount

    const index = bucketFor(daysOverdue(invoice, settings, asOf), settings.buckets)

    if (index === -1) {
      unbucketed += amount
      continue
    }

    buckets[index].amount += amount
    buckets[index].count += 1
  }

  return { buckets, total, unbucketed }
}
