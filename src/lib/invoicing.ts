import { addDays, daysBetween } from "@/lib/dates"
import type { SettingsOf } from "@/lib/settings/registry"

/**
 * When an invoice falls due.
 *
 * Every invoice in the system was previously dated `now + 30 days`
 * (`order-fulfillment.ts`), regardless of what the customer had actually
 * agreed. `Customer.paymentTerms` was captured on screen, stored, and never
 * read — so a Net 7 account and a Net 60 account received identical dates.
 *
 * Pure by design: no database, no settings lookup. The caller resolves
 * settings and passes them in, which keeps this testable and lets client
 * components reuse it.
 */

/** Sentinels already encoded in `PAYMENT_TERMS_OPTIONS` (`types.ts`). */
export const TERMS_COD = 0
export const TERMS_END_OF_MONTH = -1

export interface ComputeDueDateInput {
  issuedAt: Date
  /** `Customer.paymentTerms`. null/undefined means the customer has none set. */
  paymentTerms?: number | null
  settings: SettingsOf<"invoicing">
}

/** Last moment of `year`/`month` (0-indexed month), in local time. */
function endOfMonth(year: number, month: number) {
  // Day 0 of the *next* month is the last day of this one, which sidesteps
  // leap years and 30/31-day months entirely.
  return new Date(year, month + 1, 0, 23, 59, 59, 999)
}

export function computeDueDate({
  issuedAt,
  paymentTerms,
  settings,
}: ComputeDueDateInput): Date {
  // `fixedDays` overrides the customer entirely — a business that invoices
  // everyone on the same cycle regardless of account terms.
  if (settings.dueDateSource === "fixedDays") {
    return addDays(issuedAt, settings.fixedDays)
  }

  // No terms on the account. `fallbackDays` defaults to 30, reproducing the
  // previous hardcoded behaviour for exactly the customers it used to apply to.
  if (paymentTerms === null || paymentTerms === undefined) {
    return addDays(issuedAt, settings.fallbackDays)
  }

  if (paymentTerms === TERMS_COD) {
    return settings.codDueSameDay ? new Date(issuedAt.getTime()) : addDays(issuedAt, 1)
  }

  if (paymentTerms === TERMS_END_OF_MONTH) {
    const monthOffset = settings.eomHandling === "endOfNextMonth" ? 1 : 0
    return endOfMonth(issuedAt.getFullYear(), issuedAt.getMonth() + monthOffset)
  }

  // A negative value that is not the EOM sentinel is corrupt data, not an
  // instruction to back-date an invoice. Fall back rather than issue something
  // already overdue.
  if (paymentTerms < 0) {
    return addDays(issuedAt, settings.fallbackDays)
  }

  return addDays(issuedAt, paymentTerms)
}

/**
 * Whether an invoice is overdue as at `asOf`, honouring the grace period.
 *
 * Compared by calendar day, not by instant: an invoice due today is not
 * overdue at 9am on the due date. `overdueGraceDays` defaults to 0.
 */
export function isOverdue(
  dueDate: Date,
  settings: SettingsOf<"invoicing">,
  asOf: Date = new Date()
) {
  return daysBetween(dueDate, asOf) > settings.overdueGraceDays
}
