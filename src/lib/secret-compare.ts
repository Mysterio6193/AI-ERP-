import { timingSafeEqual } from "node:crypto"

/**
 * Comparing a secret without telling the caller how close they got.
 *
 * `provided === secret` stops at the first byte that differs, so the time it
 * takes to say no depends on how much of the secret was right. Over enough
 * requests that difference is measurable, and it turns guessing a secret from
 * one impossible problem into a few hundred tractable ones — a byte at a time,
 * keeping whichever guess was answered slowest.
 *
 * Both places this now guards are public webhook endpoints that anyone on the
 * internet may call as often as they like, which is the condition that makes
 * the attack practical rather than theoretical. `driver-auth.ts` already got
 * this right; the cron tick and the Telegram webhook did not.
 *
 * The approach is OpenBot's `agent-computer/src/authorisation.ts` (MIT) — see
 * docs/THIRD_PARTY.md. Node's `timingSafeEqual` does the comparison here, but
 * the length guard in front of it is the part worth copying: `timingSafeEqual`
 * throws on a length mismatch rather than returning false, so calling it
 * unguarded turns a wrong-length guess into a 500.
 */
export function secretEquals(expected: string | undefined | null, provided: string | undefined | null): boolean {
  // An unset secret can never be matched. Returning true here would be the
  // fail-open that makes an unconfigured deployment a public endpoint.
  if (!expected) return false
  if (!provided) return false

  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(provided, "utf8")

  /**
   * Length is compared first and is genuinely leaked — there is no way around
   * that without hashing both sides, and knowing a secret's length is not much
   * of a foothold when its contents stay hidden.
   */
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

/**
 * The token a caller offered, whichever way they carried it.
 *
 * Bearer first because that is what the schedulers send, then the bare header
 * for the callers that find `Authorization` awkward.
 */
export function bearerToken(headers: Headers, fallbackHeader?: string): string | null {
  const authorization = headers.get("authorization")?.trim()

  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i)
    if (match) return match[1].trim()
  }

  if (fallbackHeader) {
    const value = headers.get(fallbackHeader)?.trim()
    if (value) return value
  }

  return null
}
