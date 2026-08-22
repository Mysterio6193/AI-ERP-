import { describe, expect, it } from "vitest"

import { rateLimit, resetRateLimit } from "./rate-limit"

/**
 * This is the only thing standing between a six-digit OTP and a few minutes of
 * unattended guessing, so the counting has to be exact — off by one in the
 * permissive direction is a real hole.
 */

let counter = 0
const uniqueKey = () => `test:${Date.now()}:${counter++}`

describe("rateLimit", () => {
  it("allows exactly the limit, then blocks", () => {
    const key = uniqueKey()

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(rateLimit({ key, limit: 5, windowSeconds: 60 }).ok).toBe(true)
    }

    expect(rateLimit({ key, limit: 5, windowSeconds: 60 }).ok).toBe(false)
  })

  it("counts down remaining", () => {
    const key = uniqueKey()

    expect(rateLimit({ key, limit: 3, windowSeconds: 60 }).remaining).toBe(2)
    expect(rateLimit({ key, limit: 3, windowSeconds: 60 }).remaining).toBe(1)
    expect(rateLimit({ key, limit: 3, windowSeconds: 60 }).remaining).toBe(0)
  })

  it("reports how long to wait once blocked", () => {
    const key = uniqueKey()

    rateLimit({ key, limit: 1, windowSeconds: 60 })
    const blocked = rateLimit({ key, limit: 1, windowSeconds: 60 })

    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it("keeps separate keys independent", () => {
    const a = uniqueKey()
    const b = uniqueKey()

    rateLimit({ key: a, limit: 1, windowSeconds: 60 })

    // One account being throttled must not lock out another.
    expect(rateLimit({ key: b, limit: 1, windowSeconds: 60 }).ok).toBe(true)
  })

  it("clears on reset, so a successful sign-in unblocks", () => {
    const key = uniqueKey()

    rateLimit({ key, limit: 1, windowSeconds: 60 })
    expect(rateLimit({ key, limit: 1, windowSeconds: 60 }).ok).toBe(false)

    resetRateLimit(key)

    expect(rateLimit({ key, limit: 1, windowSeconds: 60 }).ok).toBe(true)
  })

  it("stops a brute-force run dead", () => {
    const key = uniqueKey()
    let allowed = 0

    // A six-digit OTP is a million guesses; only the first 10 may land.
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      if (rateLimit({ key, limit: 10, windowSeconds: 600 }).ok) {
        allowed += 1
      }
    }

    expect(allowed).toBe(10)
  })
})
