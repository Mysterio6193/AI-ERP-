import { beforeEach, describe, expect, it } from "vitest"

import { guardRate, RATE_LIMITS } from "./rate-guard"
import { resetRateLimit } from "./rate-limit"

/**
 * The counter itself is tested in rate-limit.test.ts. This covers the parts a
 * route depends on: that it eventually refuses, that it says when to come
 * back, and that two callers cannot exhaust each other's budget.
 */

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as never
}

const OPTS = { name: "test-guard", limit: 3, windowSeconds: 60 }

describe("guardRate", () => {
  beforeEach(() => {
    for (const s of ["a", "b"]) {
      resetRateLimit(`test-guard:1.1.1.1:${s}`)
      resetRateLimit(`test-guard:2.2.2.2:${s}`)
    }
    resetRateLimit("test-guard:1.1.1.1")
  })

  it("allows traffic up to the limit, then refuses", () => {
    const r = req({ "x-forwarded-for": "1.1.1.1" })

    for (let i = 0; i < 3; i++) {
      expect(guardRate(r, { ...OPTS, subject: "a" }), `call ${i + 1}`).toBeNull()
    }

    const blocked = guardRate(r, { ...OPTS, subject: "a" })
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
  })

  it("tells the caller when to come back", () => {
    const r = req({ "x-forwarded-for": "1.1.1.1" })
    for (let i = 0; i < 4; i++) guardRate(r, { ...OPTS, subject: "a" })

    const blocked = guardRate(r, { ...OPTS, subject: "a" })!
    // A client that cannot tell how long to wait retries immediately, which is
    // the behaviour the limit exists to stop.
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0)
  })

  it("keeps subjects separate, so one user cannot exhaust another's budget", () => {
    const r = req({ "x-forwarded-for": "1.1.1.1" })
    for (let i = 0; i < 4; i++) guardRate(r, { ...OPTS, subject: "a" })

    expect(guardRate(r, { ...OPTS, subject: "a" })).not.toBeNull()
    expect(guardRate(r, { ...OPTS, subject: "b" })).toBeNull()
  })

  it("keeps addresses separate", () => {
    for (let i = 0; i < 4; i++) {
      guardRate(req({ "x-forwarded-for": "1.1.1.1" }), { ...OPTS, subject: "a" })
    }

    expect(guardRate(req({ "x-forwarded-for": "2.2.2.2" }), { ...OPTS, subject: "a" })).toBeNull()
  })

  it("still limits a caller with no forwarded address", () => {
    // Falls back to a shared "unknown" bucket rather than letting them through.
    const r = req()
    for (let i = 0; i < 3; i++) guardRate(r, { ...OPTS, name: "no-addr", subject: "a" })
    expect(guardRate(r, { ...OPTS, name: "no-addr", subject: "a" })).not.toBeNull()
  })

  it("gives the paid endpoints tighter limits than a conversation", () => {
    // Transcription costs more per call than a chat turn.
    expect(RATE_LIMITS.voiceTranscribe.limit).toBeLessThan(RATE_LIMITS.agentChat.limit)
    // Sign-in is the one people retry by hand, so its window is long.
    expect(RATE_LIMITS.login.windowSeconds).toBeGreaterThanOrEqual(300)
  })
})
