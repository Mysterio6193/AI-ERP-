import { startOfDay } from "@/lib/dates"

/**
 * The date window a report covers.
 *
 * The reports page had a period selector wired into the fetch's dependencies
 * and into the export filename, and nothing else. No request carried it and no
 * figure changed, so every period showed identical numbers while looking like
 * it was filtering — worse than having no selector at all, because the numbers
 * looked answered.
 *
 * Pure, so the boundaries can be tested rather than eyeballed.
 */

export type ReportPeriod = "today" | "week" | "month" | "quarter" | "year"

export const REPORT_PERIODS: ReportPeriod[] = ["today", "week", "month", "quarter", "year"]

export function isReportPeriod(value: string): value is ReportPeriod {
  return (REPORT_PERIODS as string[]).includes(value)
}

/** Inclusive start of the period containing `asOf`. */
export function periodStart(period: ReportPeriod, asOf: Date = new Date()): Date {
  const year = asOf.getFullYear()
  const month = asOf.getMonth()

  switch (period) {
    case "today":
      return startOfDay(asOf)
    case "week": {
      // Monday-first, which is how a trading week is counted here.
      const day = asOf.getDay()
      const offset = day === 0 ? 6 : day - 1
      const monday = new Date(year, month, asOf.getDate() - offset)
      return monday
    }
    case "month":
      return new Date(year, month, 1)
    case "quarter":
      return new Date(year, Math.floor(month / 3) * 3, 1)
    case "year":
      return new Date(year, 0, 1)
  }
}

/** Whether a record falls inside the period. Undated records are excluded. */
export function withinPeriod(
  value: string | Date | null | undefined,
  period: ReportPeriod,
  asOf: Date = new Date()
) {
  if (!value) return false

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return false

  return date.getTime() >= periodStart(period, asOf).getTime()
}

/** How the window should read on screen, so the figures are never ambiguous. */
export function periodLabel(period: ReportPeriod, asOf: Date = new Date()) {
  const start = periodStart(period, asOf)
  const format = (date: Date) =>
    date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })

  return period === "today" ? format(asOf) : `${format(start)} – ${format(asOf)}`
}
