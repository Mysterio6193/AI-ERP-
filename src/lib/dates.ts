/**
 * Calendar-day arithmetic.
 *
 * Shared because getting this subtly wrong in two places is what produced the
 * three disagreeing aging implementations. Due dates and aging must agree on
 * what "one day late" means, or an invoice can be overdue on one screen and
 * current on another.
 */

/** Midnight local time on the same calendar day. */
export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Whole calendar days from `from` to `to`, ignoring time of day.
 *
 * Rounded, not floored: across a daylight-saving boundary the elapsed
 * milliseconds are 23 or 25 hours short of a whole day, and flooring drops a
 * day — which lands an invoice in the wrong aging bucket twice a year.
 */
export function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000)
}

export function addDays(from: Date, days: number) {
  const result = new Date(from.getTime())
  result.setDate(result.getDate() + days)
  return result
}
