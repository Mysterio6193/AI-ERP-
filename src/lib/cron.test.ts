import { describe, expect, it } from "vitest"

import { describeCron, matches, nextRun, parseCron, validateCron } from "./cron"

/**
 * Scheduling runs unattended, so a mistake here is a job that silently never
 * fires or fires every minute at 3am. The awkward cases are deliberate: the
 * day-of-month/day-of-week OR rule, expressions that can never match, and
 * rollovers across a weekend or a year.
 */

// A Wednesday.
const BASE = new Date("2026-08-19T10:07:00")

const at = (iso: string) => new Date(iso)

describe("nextRun", () => {
  it("advances to the next minute boundary", () => {
    expect(nextRun("* * * * *", BASE)).toEqual(at("2026-08-19T10:08:00"))
  })

  it("honours step values", () => {
    expect(nextRun("*/15 * * * *", BASE)).toEqual(at("2026-08-19T10:15:00"))
  })

  it("rolls to tomorrow when today's time has passed", () => {
    expect(nextRun("0 9 * * *", BASE)).toEqual(at("2026-08-20T09:00:00"))
  })

  it("fires later the same day when the time is still ahead", () => {
    expect(nextRun("0 17 * * 1-5", BASE)).toEqual(at("2026-08-19T17:00:00"))
  })

  it("skips the weekend for a weekday schedule", () => {
    // From Friday night, the next weekday run is Monday - not Saturday.
    expect(nextRun("0 9 * * 1-5", at("2026-08-21T23:59:00"))).toEqual(at("2026-08-24T09:00:00"))
  })

  it("accepts named weekdays", () => {
    expect(nextRun("0 8 * * fri", BASE)).toEqual(at("2026-08-21T08:00:00"))
  })

  it("expands named shorthands", () => {
    expect(nextRun("@daily", BASE)).toEqual(at("2026-08-20T00:00:00"))
  })

  it("crosses a month boundary", () => {
    expect(nextRun("0 0 1 * *", BASE)).toEqual(at("2026-09-01T00:00:00"))
  })

  it("crosses a year boundary", () => {
    expect(nextRun("0 0 1 1 *", at("2026-12-31T23:00:00"))).toEqual(at("2027-01-01T00:00:00"))
  })

  it("handles comma lists", () => {
    expect(nextRun("0,30 * * * *", BASE)).toEqual(at("2026-08-19T10:30:00"))
  })

  it("terminates on an expression that can never match", () => {
    // 31 February. Must return null rather than loop forever.
    expect(nextRun("0 0 31 2 *", BASE)).toBeNull()
  })
})

describe("matches - day-of-month and day-of-week", () => {
  it("ORs the two day fields when both are restricted", () => {
    // Standard cron quirk: "1st of the month OR any Monday", not both.
    const fields = parseCron("0 0 1 * 1")

    expect(matches(fields, at("2026-09-01T00:00:00"))).toBe(true) // 1st, a Tuesday
    expect(matches(fields, at("2026-08-24T00:00:00"))).toBe(true) // Monday, not the 1st
    expect(matches(fields, at("2026-08-19T00:00:00"))).toBe(false) // neither
  })

  it("ANDs the other fields", () => {
    const fields = parseCron("30 14 * * *")

    expect(matches(fields, at("2026-08-19T14:30:00"))).toBe(true)
    expect(matches(fields, at("2026-08-19T14:31:00"))).toBe(false)
    expect(matches(fields, at("2026-08-19T13:30:00"))).toBe(false)
  })

  it("treats Sunday as both 0 and 7", () => {
    const sunday = at("2026-08-23T00:00:00")

    expect(matches(parseCron("0 0 * * 0"), sunday)).toBe(true)
    expect(matches(parseCron("0 0 * * 7"), sunday)).toBe(true)
  })
})

describe("validateCron", () => {
  it.each([
    ["", "needs 5 fields"],
    ["* * *", "needs 5 fields"],
    ["60 * * * *", "out of range"],
    ["* 25 * * *", "out of range"],
    ["abc * * * *", "not a valid value"],
    ["*/0 * * * *", "Invalid step"],
    ["5-1 * * * *", "out of range"],
  ])("rejects %j", (expression, fragment) => {
    const result = validateCron(expression)

    expect(result.ok).toBe(false)
    expect(result.error).toContain(fragment)
  })

  it("rejects an expression that will never fire", () => {
    const result = validateCron("0 0 31 2 *")

    expect(result.ok).toBe(false)
    expect(result.error).toContain("never fire")
  })

  it("accepts valid expressions and reports the next run", () => {
    const result = validateCron("0 8 * * 1-5")

    expect(result.ok).toBe(true)
    expect(result.next).toBeInstanceOf(Date)
  })
})

describe("describeCron", () => {
  it("names common schedules in plain English", () => {
    expect(describeCron("0 9 * * 1-5")).toBe("Weekdays at 9am")
    expect(describeCron("*/15 * * * *")).toBe("Every 15 minutes")
  })

  it("falls back to the raw expression when it has no friendly name", () => {
    expect(describeCron("7 3 * * 2")).toBe("7 3 * * 2")
  })
})
