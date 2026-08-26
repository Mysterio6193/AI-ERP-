import { describe, expect, it } from "vitest"

import { buildIcsFeed, type CalendarEvent } from "@/lib/calendar/ics"

const NOW = new Date("2026-08-25T00:00:00Z")

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  uid: "delivery-1@supplysure",
  start: new Date("2026-08-26T09:30:00Z"),
  end: new Date("2026-08-26T10:00:00Z"),
  summary: "Deliver to Bella Napoli",
  ...over,
})

describe("buildIcsFeed", () => {
  it("produces a calendar a client will accept", () => {
    const ics = buildIcsFeed({ name: "Deliveries", events: [event()], now: NOW })

    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true)
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true)
    expect(ics).toContain("VERSION:2.0")
  })

  it("uses CRLF line endings, which Outlook enforces", () => {
    const ics = buildIcsFeed({ name: "Deliveries", events: [event()], now: NOW })
    expect(ics).toContain("\r\n")
    expect(ics.split("\r\n").length).toBeGreaterThan(5)
  })

  it("writes timestamps in the compact UTC form", () => {
    const ics = buildIcsFeed({ name: "Deliveries", events: [event()], now: NOW })
    expect(ics).toContain("DTSTART:20260826T093000Z")
    expect(ics).toContain("DTEND:20260826T100000Z")
  })

  it("escapes a comma so the rest of the field is not lost", () => {
    // "Smith, Jones & Co" silently truncates the summary to "Smith" otherwise,
    // and the calendar shows a delivery to the wrong customer.
    const ics = buildIcsFeed({
      name: "Deliveries",
      events: [event({ summary: "Deliver to Smith, Jones & Co" })],
      now: NOW,
    })

    expect(ics).toContain("SUMMARY:Deliver to Smith\\, Jones & Co")
  })

  it("escapes semicolons and newlines in a description", () => {
    const ics = buildIcsFeed({
      name: "D",
      events: [event({ description: "Gate code 1234; ring bell\nLeave at dock" })],
      now: NOW,
    })

    expect(ics).toContain("Gate code 1234\; ring bell\\nLeave at dock")
  })

  it("folds a long line rather than losing the whole feed", () => {
    // Outlook rejects the entire calendar over an overlong line, not just that
    // line, so one long address would cost every event.
    const ics = buildIcsFeed({
      name: "D",
      events: [event({ location: "Unit 4, ".repeat(30) })],
      now: NOW,
    })

    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })

  it("gives an all-day entry an exclusive end date", () => {
    // A same-day DTEND makes the event vanish in Outlook.
    const ics = buildIcsFeed({
      name: "D",
      events: [event({ allDay: true, start: new Date("2026-08-26T00:00:00Z"), end: undefined })],
      now: NOW,
    })

    expect(ics).toContain("DTSTART;VALUE=DATE:20260826")
    expect(ics).toContain("DTEND;VALUE=DATE:20260827")
  })

  it("defaults an untimed event to an hour rather than zero length", () => {
    const ics = buildIcsFeed({ name: "D", events: [event({ end: undefined })], now: NOW })
    expect(ics).toContain("DTEND:20260826T103000Z")
  })

  it("keeps the uid stable so a refresh does not duplicate everything", () => {
    const first = buildIcsFeed({ name: "D", events: [event()], now: NOW })
    const later = buildIcsFeed({ name: "D", events: [event()], now: new Date("2026-09-01T00:00:00Z") })

    expect(first).toContain("UID:delivery-1@supplysure")
    expect(later).toContain("UID:delivery-1@supplysure")
  })

  it("marks a cancelled delivery cancelled rather than dropping it", () => {
    // Removing it leaves the old entry sitting in the driver's calendar.
    const ics = buildIcsFeed({ name: "D", events: [event({ status: "CANCELLED" })], now: NOW })
    expect(ics).toContain("STATUS:CANCELLED")
  })

  it("asks clients to refresh sooner than they would by default", () => {
    const ics = buildIcsFeed({ name: "D", events: [], now: NOW })
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT30M")
  })

  it("is still a valid empty calendar with nothing scheduled", () => {
    const ics = buildIcsFeed({ name: "Deliveries", events: [], now: NOW })
    expect(ics).toContain("BEGIN:VCALENDAR")
    expect(ics).not.toContain("BEGIN:VEVENT")
  })
})
