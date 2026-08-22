import { describe, expect, it } from "vitest"

import { computeDueDate, isOverdue } from "./invoicing"
import { defaultsFor } from "./settings/registry"

const settings = defaultsFor("invoicing")

/** 2026-08-22 is a Saturday, mid-month — no month-end edge to confuse results. */
const issuedAt = new Date(2026, 7, 22, 10, 0, 0)

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`

describe("computeDueDate", () => {
  it("honours the customer's terms instead of always adding 30 days", () => {
    // This is the bug: every one of these used to return 21 September.
    expect(iso(computeDueDate({ issuedAt, paymentTerms: 7, settings }))).toBe("2026-08-29")
    expect(iso(computeDueDate({ issuedAt, paymentTerms: 14, settings }))).toBe("2026-09-05")
    expect(iso(computeDueDate({ issuedAt, paymentTerms: 30, settings }))).toBe("2026-09-21")
    expect(iso(computeDueDate({ issuedAt, paymentTerms: 60, settings }))).toBe("2026-10-21")
  })

  it("falls back to 30 days when the customer has no terms, matching the old behaviour", () => {
    expect(iso(computeDueDate({ issuedAt, paymentTerms: null, settings }))).toBe("2026-09-21")
    expect(iso(computeDueDate({ issuedAt, paymentTerms: undefined, settings }))).toBe("2026-09-21")
  })

  it("treats COD as due the same day", () => {
    expect(iso(computeDueDate({ issuedAt, paymentTerms: 0, settings }))).toBe("2026-08-22")
  })

  it("gives COD a day's grace when configured to", () => {
    const relaxed = { ...settings, codDueSameDay: false }
    expect(iso(computeDueDate({ issuedAt, paymentTerms: 0, settings: relaxed }))).toBe("2026-08-23")
  })

  it("puts end-of-month terms on the last day of the month", () => {
    expect(iso(computeDueDate({ issuedAt, paymentTerms: -1, settings }))).toBe("2026-08-31")
  })

  it("gets month lengths right for EOM, including February in a leap year", () => {
    const eom = (year: number, month: number) =>
      iso(
        computeDueDate({
          issuedAt: new Date(year, month, 5),
          paymentTerms: -1,
          settings,
        })
      )

    expect(eom(2026, 1)).toBe("2026-02-28")
    expect(eom(2028, 1)).toBe("2028-02-29") // leap year
    expect(eom(2026, 3)).toBe("2026-04-30") // 30-day month
    expect(eom(2026, 11)).toBe("2026-12-31") // year end
  })

  it("supports EOM of the following month", () => {
    const next = { ...settings, eomHandling: "endOfNextMonth" as const }
    expect(iso(computeDueDate({ issuedAt, paymentTerms: -1, settings: next }))).toBe("2026-09-30")
    // Rolls the year over rather than producing month 12.
    expect(
      iso(
        computeDueDate({
          issuedAt: new Date(2026, 11, 10),
          paymentTerms: -1,
          settings: next,
        })
      )
    ).toBe("2027-01-31")
  })

  it("ignores customer terms entirely when the business invoices on a fixed cycle", () => {
    const fixed = { ...settings, dueDateSource: "fixedDays" as const, fixedDays: 45 }
    expect(iso(computeDueDate({ issuedAt, paymentTerms: 7, settings: fixed }))).toBe("2026-10-06")
  })

  it("never back-dates an invoice from corrupt terms", () => {
    // -5 is not the EOM sentinel; treating it as arithmetic would issue an
    // invoice that is already overdue the moment it is created.
    const due = computeDueDate({ issuedAt, paymentTerms: -5, settings })
    expect(due.getTime()).toBeGreaterThan(issuedAt.getTime())
    expect(iso(due)).toBe("2026-09-21")
  })

  it("crosses month and year boundaries by calendar, not by 30-day arithmetic", () => {
    // The old `+ 30 * 24 * 60 * 60 * 1000` was fixed-width; real months are not.
    expect(
      iso(computeDueDate({ issuedAt: new Date(2026, 0, 31), paymentTerms: 30, settings }))
    ).toBe("2026-03-02")
    expect(
      iso(computeDueDate({ issuedAt: new Date(2026, 11, 20), paymentTerms: 30, settings }))
    ).toBe("2027-01-19")
  })
})

describe("isOverdue", () => {
  const due = new Date(2026, 7, 22)

  it("is not overdue on the due date itself", () => {
    expect(isOverdue(due, settings, new Date(2026, 7, 22, 9, 0))).toBe(false)
  })

  it("is overdue the next day with no grace configured", () => {
    expect(isOverdue(due, settings, new Date(2026, 7, 23, 9, 0))).toBe(true)
  })

  it("respects a grace period", () => {
    const lenient = { ...settings, overdueGraceDays: 3 }
    expect(isOverdue(due, lenient, new Date(2026, 7, 24))).toBe(false)
    expect(isOverdue(due, lenient, new Date(2026, 7, 26, 9, 0))).toBe(true)
  })
})
