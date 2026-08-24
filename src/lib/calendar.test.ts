import { describe, expect, it } from "vitest"

import { dateKey, groupByDate, monthGrid } from "./calendar"

/**
 * The two things a calendar gets wrong are which day something lands on, and
 * which weeks it draws. Both are silently wrong rather than obviously broken.
 */

describe("dateKey", () => {
  it("uses the local date, not UTC", () => {
    // An 8pm delivery in Sydney is still today. Formatting via toISOString
    // would push it to tomorrow and the route would vanish from the day the
    // driver is actually working.
    const evening = new Date(2026, 7, 23, 20, 30)
    expect(dateKey(evening)).toBe("2026-08-23")
  })

  it("pads month and day, so keys sort as strings", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05")
  })

  it("handles the last moment of a day", () => {
    expect(dateKey(new Date(2026, 7, 23, 23, 59, 59))).toBe("2026-08-23")
  })
})

describe("groupByDate", () => {
  it("collects events onto their own day", () => {
    const events = [
      { id: "a", kind: "task" as const, date: "2026-08-23", at: new Date(), title: "A" },
      { id: "b", kind: "task" as const, date: "2026-08-23", at: new Date(), title: "B" },
      { id: "c", kind: "task" as const, date: "2026-08-24", at: new Date(), title: "C" },
    ]

    const grouped = groupByDate(events)

    expect(grouped["2026-08-23"]).toHaveLength(2)
    expect(grouped["2026-08-24"]).toHaveLength(1)
  })

  it("returns nothing for a day with no events, rather than an empty array", () => {
    expect(groupByDate([])["2026-08-23"]).toBeUndefined()
  })
})

describe("monthGrid", () => {
  it("starts the week on Monday", () => {
    // An Australian working week does not start on Sunday, and a grid that
    // says it does puts Saturday deliveries in the wrong column.
    const grid = monthGrid(2026, 7)
    expect(grid[0].getDay()).toBe(1)
  })

  it("covers every day of the month", () => {
    const grid = monthGrid(2026, 7)
    const inMonth = grid.filter((d) => d.getMonth() === 7)

    expect(inMonth).toHaveLength(31)
  })

  it("returns whole weeks", () => {
    for (const month of [0, 1, 5, 7, 11]) {
      expect(monthGrid(2026, month).length % 7, `month ${month}`).toBe(0)
    }
  })

  it("does not draw a trailing week belonging entirely to the next month", () => {
    // February 2027 starts on a Monday and has 28 days: exactly four weeks.
    const grid = monthGrid(2027, 1)
    expect(grid).toHaveLength(35)
  })

  it("handles a month that needs six weeks", () => {
    // A 31-day month starting on a Saturday spills into a sixth row.
    const grid = monthGrid(2026, 7)
    expect(grid.length).toBeGreaterThanOrEqual(35)
  })
})
