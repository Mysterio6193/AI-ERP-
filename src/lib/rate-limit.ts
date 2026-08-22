import { NextRequest } from "next/server"

/**
 * In-process rate limiting for authentication endpoints.
 *
 * Login and OTP verification were unthrottled, which makes a six-digit OTP
 * guessable in minutes and a password worth brute forcing. This is a fixed
 * window counter held in memory.
 *
 * The memory part matters: it is per-process, so it protects a single instance
 * and resets on deploy. That is a genuine improvement over nothing and the
 * right size for this deployment (one node, SQLite). Move the store to Redis
 * before running more than one instance, or an attacker simply spreads their
 * attempts across processes.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Bounded so a flood of unique keys cannot grow the map without limit.
const MAX_KEYS = 10_000

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) {
    return
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }

  // Still full of live entries: drop the oldest rather than grow unbounded.
  if (buckets.size >= MAX_KEYS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
    for (const [key] of oldest.slice(0, Math.floor(MAX_KEYS / 4))) {
      buckets.delete(key)
    }
  }
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

export function rateLimit(input: {
  key: string
  limit: number
  windowSeconds: number
}): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(input.key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(input.key, { count: 1, resetAt: now + input.windowSeconds * 1000 })
    return { ok: true, remaining: input.limit - 1, retryAfterSeconds: 0 }
  }

  existing.count += 1

  if (existing.count > input.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
    }
  }

  return { ok: true, remaining: input.limit - existing.count, retryAfterSeconds: 0 }
}

/**
 * Best-effort client address.
 *
 * Proxy headers are forgeable, so this is not an identity - it is a cheap way
 * to separate honest clients. Always combine it with something stable from the
 * request (the submitted email) so a rotating-IP attacker still hits a limit.
 */
export function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")
  const address = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip")

  return address || "unknown"
}

/** Clears a subject's counter after a successful attempt. */
export function resetRateLimit(key: string) {
  buckets.delete(key)
}
