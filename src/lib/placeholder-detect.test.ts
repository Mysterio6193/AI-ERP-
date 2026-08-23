import { describe, expect, it } from "vitest"

import { looksLikeFillerText, looksLikePlaceholder } from "./placeholder-detect"

/**
 * A reseed populated an entity's bank details with invented numbers, and
 * preflight then reported its invoices as payable. That is worse than leaving
 * them empty: absence is caught, but a fabricated account number reaches a
 * customer looking exactly like a real one.
 */

describe("looksLikePlaceholder", () => {
  it("flags the patterns seed data actually used", () => {
    for (const value of ["55667788", "88221144", "012-345", "000-000"]) {
      expect(looksLikePlaceholder(value).suspicious, value).toBe(true)
    }
  })

  it("flags all zeros and obvious filler starts", () => {
    expect(looksLikePlaceholder("00000000").reason).toBe("all zeros")
    expect(looksLikePlaceholder("12340987").suspicious).toBe(true)
  })

  it("ignores formatting when looking for a pattern", () => {
    // A BSB is written with a dash; the pattern is in the digits.
    expect(looksLikePlaceholder("01-2345").suspicious).toBe(true)
  })

  it("leaves a real-looking account alone", () => {
    for (const value of ["10293847", "062-000", "4835 2917", "738104"]) {
      expect(looksLikePlaceholder(value).suspicious, value).toBe(false)
    }
  })

  it("says nothing about an empty value, which absence already covers", () => {
    expect(looksLikePlaceholder("").suspicious).toBe(false)
    expect(looksLikePlaceholder(null).suspicious).toBe(false)
  })

  it("needs five digits before calling a run sequential", () => {
    // Four ascending digits is unremarkable on its own. "1234" is still
    // caught, but by the filler-prefix rule rather than this one.
    expect(looksLikePlaceholder("2345").suspicious).toBe(false)
    expect(looksLikePlaceholder("23456").reason).toBe("sequential digits")
    expect(looksLikePlaceholder("1234").suspicious).toBe(true)
  })
})

describe("looksLikeFillerText", () => {
  it("catches the usual stand-ins", () => {
    for (const v of ["Test", "demo", "Your Company", "N/A", "TBC", "placeholder"]) {
      expect(looksLikeFillerText(v), v).toBe(true)
    }
  })

  it("leaves a real business name alone", () => {
    for (const v of ["RDM Manufacturing Pty Ltd", "Westpac Banking Corporation", "Contoso"]) {
      expect(looksLikeFillerText(v), v).toBe(false)
    }
  })
})
