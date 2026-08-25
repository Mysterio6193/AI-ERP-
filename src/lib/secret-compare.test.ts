import { describe, expect, it } from "vitest"
import { bearerToken, secretEquals } from "@/lib/secret-compare"

describe("secretEquals", () => {
  it("accepts the right secret", () => {
    expect(secretEquals("s3cret-value", "s3cret-value")).toBe(true)
  })

  it("rejects the wrong one", () => {
    expect(secretEquals("s3cret-value", "s3cret-valuf")).toBe(false)
  })

  it("rejects a wrong length without throwing", () => {
    // timingSafeEqual throws on a length mismatch, so calling it unguarded
    // would turn a wrong-length guess into a 500 rather than a refusal.
    expect(() => secretEquals("short", "much-longer-guess")).not.toThrow()
    expect(secretEquals("short", "much-longer-guess")).toBe(false)
  })

  it("rejects a prefix of the real secret", () => {
    expect(secretEquals("abcdef", "abc")).toBe(false)
  })

  it("never matches when the secret is unset", () => {
    // Returning true here is the fail-open that makes an unconfigured
    // deployment a public endpoint.
    expect(secretEquals(undefined, "anything")).toBe(false)
    expect(secretEquals(null, "anything")).toBe(false)
    expect(secretEquals("", "")).toBe(false)
  })

  it("rejects a missing offer", () => {
    expect(secretEquals("s3cret", undefined)).toBe(false)
    expect(secretEquals("s3cret", null)).toBe(false)
    expect(secretEquals("s3cret", "")).toBe(false)
  })

  it("compares by bytes, not by unicode collation", () => {
    expect(secretEquals("café", "café")).toBe(true)
    expect(secretEquals("café", "cafe")).toBe(false)
  })
})

describe("bearerToken", () => {
  it("reads a Bearer token", () => {
    const headers = new Headers({ authorization: "Bearer abc123" })
    expect(bearerToken(headers)).toBe("abc123")
  })

  it("accepts the scheme in any case, because callers vary", () => {
    expect(bearerToken(new Headers({ authorization: "bearer abc123" }))).toBe("abc123")
    expect(bearerToken(new Headers({ authorization: "BEARER abc123" }))).toBe("abc123")
  })

  it("tolerates extra whitespace", () => {
    expect(bearerToken(new Headers({ authorization: "Bearer   abc123  " }))).toBe("abc123")
  })

  it("falls back to a named header for callers that cannot set Authorization", () => {
    const headers = new Headers({ "x-cron-secret": "abc123" })
    expect(bearerToken(headers, "x-cron-secret")).toBe("abc123")
  })

  it("prefers Bearer over the fallback when both are present", () => {
    const headers = new Headers({ authorization: "Bearer from-auth", "x-cron-secret": "from-header" })
    expect(bearerToken(headers, "x-cron-secret")).toBe("from-auth")
  })

  it("returns null rather than an empty string when there is nothing", () => {
    // The caller compares this against a secret; "" must not be mistaken for
    // an offer that could ever match.
    expect(bearerToken(new Headers())).toBeNull()
    expect(bearerToken(new Headers({ authorization: "Basic abc" }))).toBeNull()
  })

  it("does not treat a bare Authorization value as a token", () => {
    expect(bearerToken(new Headers({ authorization: "abc123" }))).toBeNull()
  })
})

describe("the two together", () => {
  it("refuses a junk Authorization header on a public endpoint", () => {
    const headers = new Headers({ authorization: "Bearer junk" })
    expect(secretEquals("the-real-secret", bearerToken(headers))).toBe(false)
  })

  it("refuses a request carrying no credential at all", () => {
    expect(secretEquals("the-real-secret", bearerToken(new Headers()))).toBe(false)
  })
})
