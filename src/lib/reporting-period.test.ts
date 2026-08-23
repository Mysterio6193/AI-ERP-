import { describe, expect, it } from "vitest"

import { isReportPeriod, periodLabel, periodStart, withinPeriod } from "./reporting-period"

// A Wednesday, mid-month, mid-quarter.
const asOf = new Date(2026, 7, 19, 14, 30)

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

describe("periodStart", () => {
  it("gives each period its own start, which is the whole point", () => {
    expect(iso(periodStart("today", asOf))).toBe("2026-08-19")
    expect(iso(periodStart("week", asOf))).toBe("2026-08-17")
    expect(iso(periodStart("month", asOf))).toBe("2026-08-01")
    expect(iso(periodStart("quarter", asOf))).toBe("2026-07-01")
    expect(iso(periodStart("year", asOf))).toBe("2026-01-01")
  })

  it("starts the week on Monday, including when today is Sunday", () => {
    // A Sunday must look back to the Monday just gone, not forward.
    const sunday = new Date(2026, 7, 23)
    expect(iso(periodStart("week", sunday))).toBe("2026-08-17")

    const monday = new Date(2026, 7, 17)
    expect(iso(periodStart("week", monday))).toBe("2026-08-17")
  })

  it("puts each quarter on its real boundary", () => {
    expect(iso(periodStart("quarter", new Date(2026, 0, 15)))).toBe("2026-01-01")
    expect(iso(periodStart("quarter", new Date(2026, 5, 30)))).toBe("2026-04-01")
    expect(iso(periodStart("quarter", new Date(2026, 11, 1)))).toBe("2026-10-01")
  })

  it("ignores the time of day", () => {
    expect(periodStart("today", new Date(2026, 7, 19, 23, 59)).getHours()).toBe(0)
  })
})

describe("withinPeriod", () => {
  it("includes something from earlier today and excludes yesterday", () => {
    expect(withinPeriod(new Date(2026, 7, 19, 1, 0), "today", asOf)).toBe(true)
    expect(withinPeriod(new Date(2026, 7, 18, 23, 59), "today", asOf)).toBe(false)
  })

  it("widens as the period widens", () => {
    const lastMonth = new Date(2026, 6, 15)

    expect(withinPeriod(lastMonth, "month", asOf)).toBe(false)
    expect(withinPeriod(lastMonth, "quarter", asOf)).toBe(true)
    expect(withinPeriod(lastMonth, "year", asOf)).toBe(true)
  })

  it("accepts an ISO string, which is what the API returns", () => {
    expect(withinPeriod("2026-08-19T02:00:00.000Z", "month", asOf)).toBe(true)
    expect(withinPeriod("2025-01-01T00:00:00.000Z", "year", asOf)).toBe(false)
  })

  it("excludes a missing or unparseable date rather than counting it", () => {
    // Counting an undated record would quietly inflate every total.
    expect(withinPeriod(null, "year", asOf)).toBe(false)
    expect(withinPeriod(undefined, "year", asOf)).toBe(false)
    expect(withinPeriod("not a date", "year", asOf)).toBe(false)
  })
})

describe("isReportPeriod", () => {
  it("rejects anything not offered by the selector", () => {
    expect(isReportPeriod("month")).toBe(true)
    expect(isReportPeriod("decade")).toBe(false)
  })
})

describe("periodLabel", () => {
  it("states the window, so a figure is never ambiguous", () => {
    expect(periodLabel("today", asOf)).toContain("19 Aug 2026")
    expect(periodLabel("month", asOf)).toContain("1 Aug 2026")
    expect(periodLabel("month", asOf)).toContain("–")
  })
})
