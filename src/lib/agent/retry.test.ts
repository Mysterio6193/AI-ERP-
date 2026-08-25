import { describe, expect, it } from "vitest"
import {
  BACKOFF_MS,
  MAX_RETRY_AFTER_MS,
  classifyMessage,
  classifyResponse,
  classifyStatus,
  computeBackoff,
  describeFailure,
  retryAfterMs,
} from "@/lib/agent/retry"

describe("classifyStatus", () => {
  it("retries a rate limit, because the window moves on its own", () => {
    expect(classifyStatus(429)).toEqual({ transient: true, reason: "rate_limited" })
  })

  it("retries the provider's own failures", () => {
    expect(classifyStatus(500)?.transient).toBe(true)
    expect(classifyStatus(502)).toEqual({ transient: true, reason: "overloaded" })
    expect(classifyStatus(503)).toEqual({ transient: true, reason: "overloaded" })
  })

  it("never retries a rejected key — three attempts is three identical errors", () => {
    expect(classifyStatus(401)).toEqual({ transient: false, reason: "auth" })
    expect(classifyStatus(403)).toEqual({ transient: false, reason: "auth" })
  })

  it("separates being out of credit from being unauthorised", () => {
    // Both look like "it stopped working"; only one is fixed by topping up.
    expect(classifyStatus(402)).toEqual({ transient: false, reason: "credit" })
  })

  it("does not retry a model the provider does not serve", () => {
    expect(classifyStatus(404)).toEqual({ transient: false, reason: "unknown_model" })
  })

  it("returns null for a success so the caller keeps the response", () => {
    expect(classifyStatus(200)).toBeNull()
  })
})

describe("classifyMessage", () => {
  it("reads a rate limit out of the text when there is no status", () => {
    expect(classifyMessage("Rate limit exceeded for free tier")).toEqual({
      transient: true,
      reason: "rate_limited",
    })
  })

  it("treats a dropped connection as worth retrying", () => {
    expect(classifyMessage("fetch failed: ECONNRESET").transient).toBe(true)
  })

  it("checks terminal patterns first", () => {
    // Retrying a bad key is pure delay, so auth must win over any transient
    // wording in the same message.
    expect(classifyMessage("Invalid API key provided").reason).toBe("auth")
  })

  it("does not retry what it cannot recognise", () => {
    // An unknown error repeated three times is still unknown, and the wait
    // hides it from whoever is watching.
    expect(classifyMessage("something went sideways")).toEqual({
      transient: false,
      reason: "unknown",
    })
  })

  it("does not retry a cancelled request", () => {
    expect(classifyMessage("The operation was aborted").transient).toBe(false)
  })
})

describe("classifyResponse", () => {
  it("catches an error body served with a 200", () => {
    // OpenRouter does this when an upstream provider fails mid-stream; status
    // alone would call it a success.
    expect(classifyResponse(200, "upstream error: model is overloaded")).toEqual({
      transient: true,
      reason: "overloaded",
    })
  })

  it("prefers the status when there is one", () => {
    expect(classifyResponse(429, "").reason).toBe("rate_limited")
  })
})

describe("computeBackoff", () => {
  it("waits longer each time", () => {
    const mid = () => 0.5
    expect(computeBackoff(0, mid)).toBeLessThan(computeBackoff(1, mid))
    expect(computeBackoff(1, mid)).toBeLessThan(computeBackoff(2, mid))
  })

  it("stays within 25% of the base so a wait cannot run away", () => {
    for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
      const base = BACKOFF_MS[attempt]
      expect(computeBackoff(attempt, () => 0)).toBeGreaterThanOrEqual(base * 0.75)
      expect(computeBackoff(attempt, () => 1)).toBeLessThanOrEqual(base * 1.25)
    }
  })

  it("spreads simultaneous retries apart", () => {
    // Several agents rate-limited by the same tick must not all come back on
    // the same tick and rate-limit each other again.
    expect(computeBackoff(0, () => 0)).not.toBe(computeBackoff(0, () => 1))
  })

  it("holds at the last step rather than growing forever", () => {
    const mid = () => 0.5
    expect(computeBackoff(99, mid)).toBe(computeBackoff(BACKOFF_MS.length - 1, mid))
  })
})

describe("retryAfterMs", () => {
  it("honours a seconds value", () => {
    expect(retryAfterMs("5")).toBe(5000)
  })

  it("caps a long wait rather than holding the request open", () => {
    expect(retryAfterMs("600")).toBe(MAX_RETRY_AFTER_MS)
  })

  it("reads the HTTP-date form", () => {
    const soon = new Date(Date.now() + 3000).toUTCString()
    const ms = retryAfterMs(soon)
    expect(ms).toBeGreaterThan(1000)
    expect(ms).toBeLessThanOrEqual(4000)
  })

  it("never returns a negative wait for a date already past", () => {
    expect(retryAfterMs(new Date(Date.now() - 60_000).toUTCString())).toBe(0)
  })

  it("falls back to the schedule when the header is absent or junk", () => {
    expect(retryAfterMs(null)).toBeNull()
    expect(retryAfterMs("soon")).toBeNull()
  })
})

describe("describeFailure", () => {
  it("names the fix for the failures a person can act on", () => {
    expect(describeFailure("auth", "x")).toMatch(/OPENROUTER_API_KEY/)
    expect(describeFailure("unknown_model", "nvidia/nemotron")).toMatch(/AGENT_MODEL/)
    expect(describeFailure("credit", "x")).toMatch(/credit/i)
  })

  it("names the model, so the log says what failed", () => {
    expect(describeFailure("rate_limited", "nvidia/nemotron-3")).toContain("nvidia/nemotron-3")
  })
})
