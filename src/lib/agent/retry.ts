/**
 * Telling a provider hiccup apart from a provider refusal.
 *
 * The agent runs on OpenRouter's free tier, where 429s are routine rather than
 * exceptional. What was here retried once, immediately, with no wait — which
 * against a rate limit is the one strategy guaranteed not to work, because the
 * window has not moved. And it only ran for models whose id ended `:free`,
 * which the configured default (`nvidia/nemotron-3-super-120b-a12b`) does not,
 * so the model the business actually uses had no retry at all.
 *
 * The distinction that matters is not "did it fail" but "would trying again
 * help". A 429 or a 503 clears on its own; a 401 or an unknown model id will
 * fail identically forever, and retrying it three times just makes the user
 * wait three times as long for the same error.
 *
 * The classification approach here follows OpenMausBot's `server/drivers/retry.ts`
 * (Apache-2.0) — see docs/THIRD_PARTY.md.
 */

/** Three tries total: one real attempt and two retries. */
export const MAX_ATTEMPTS = 3

/** Waits before each retry. Long enough for a per-minute window to roll. */
export const BACKOFF_MS = [1_000, 4_000, 12_000] as const

export type TransientReason = "rate_limited" | "overloaded" | "server_error" | "network" | "timeout"

export type TerminalReason =
  | "auth"
  | "credit"
  | "unknown_model"
  | "invalid_request"
  | "context_too_long"
  | "cancelled"
  | "unknown"

export interface Classification {
  transient: boolean
  reason: TransientReason | TerminalReason
}

/**
 * HTTP status is the strongest signal, so it is read first.
 *
 * 402 and 403 are called out separately from 401: on OpenRouter they mean the
 * account is out of credit or the model is not available to this key, and both
 * report as "failed" in a way that reads like an outage when it is a billing
 * problem. Retrying either one wastes the user's time and tells them nothing.
 */
export function classifyStatus(status: number): Classification | null {
  if (status === 429) return { transient: true, reason: "rate_limited" }
  if (status === 408 || status === 504) return { transient: true, reason: "timeout" }
  if (status === 502 || status === 503) return { transient: true, reason: "overloaded" }
  if (status >= 500) return { transient: true, reason: "server_error" }

  if (status === 401) return { transient: false, reason: "auth" }
  if (status === 402) return { transient: false, reason: "credit" }
  if (status === 403) return { transient: false, reason: "auth" }
  if (status === 404) return { transient: false, reason: "unknown_model" }
  if (status === 413) return { transient: false, reason: "context_too_long" }
  if (status >= 400) return { transient: false, reason: "invalid_request" }

  return null
}

const TRANSIENT_PATTERNS: Array<[RegExp, TransientReason]> = [
  [/rate.?limit|too many requests|quota exceeded temporarily/i, "rate_limited"],
  [/overloaded|capacity|is busy|try again later|no instances available/i, "overloaded"],
  [/internal server error|bad gateway|service unavailable|upstream error/i, "server_error"],
  [/econnreset|econnrefused|epipe|etimedout|eai_again|socket hang up|fetch failed|network/i, "network"],
  [/timed? ?out|timeout/i, "timeout"],
]

const TERMINAL_PATTERNS: Array<[RegExp, TerminalReason]> = [
  [/unauthorized|invalid api key|no auth credentials|authentication/i, "auth"],
  [/insufficient credit|payment required|billing|add more credits/i, "credit"],
  [/model not found|unknown model|no endpoints found|not a valid model/i, "unknown_model"],
  [/context length|too many tokens|maximum context/i, "context_too_long"],
  [/abort|cancell?ed/i, "cancelled"],
]

/** Read the failure text when there is no status to go on — a thrown fetch. */
export function classifyMessage(text: string): Classification {
  // Terminal first: "invalid api key" would otherwise match nothing and fall
  // through to unknown, and an auth failure retried is three identical errors.
  for (const [pattern, reason] of TERMINAL_PATTERNS) {
    if (pattern.test(text)) return { transient: false, reason }
  }

  for (const [pattern, reason] of TRANSIENT_PATTERNS) {
    if (pattern.test(text)) return { transient: true, reason }
  }

  // Unrecognised failures are not retried. An unknown error repeated three
  // times is still unknown, and the delay hides it from whoever is watching.
  return { transient: false, reason: "unknown" }
}

/** Classify a response the provider actually returned. */
export function classifyResponse(status: number, body = ""): Classification {
  const byStatus = classifyStatus(status)

  /**
   * A 200 carrying an error body happens on OpenRouter when an upstream
   * provider fails mid-stream. Status alone would call that a success.
   */
  if (!byStatus) {
    return body ? classifyMessage(body) : { transient: false, reason: "unknown" }
  }

  return byStatus
}

/**
 * How long to wait before retry `attempt` (0-based).
 *
 * Jitter is ±25%, so several agents rate-limited by the same tick do not all
 * come back on the same tick and rate-limit each other again.
 */
export function computeBackoff(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)
  const base = BACKOFF_MS[index]
  const jitter = base * 0.25

  return Math.round(base - jitter + random() * jitter * 2)
}

/**
 * `Retry-After` is the provider saying exactly when to come back, which beats
 * guessing. Honoured up to a cap — a header asking for four minutes is not
 * worth holding a request open for, and the caller is better served by an
 * error it can report.
 */
export const MAX_RETRY_AFTER_MS = 30_000

export function retryAfterMs(header: string | null): number | null {
  if (!header) return null

  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
  }

  // The HTTP-date form.
  const at = Date.parse(header)
  if (Number.isNaN(at)) return null

  return Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_AFTER_MS)
}

/** What to tell a person when every attempt failed. */
export function describeFailure(reason: TransientReason | TerminalReason, model: string): string {
  switch (reason) {
    case "rate_limited":
      return `The model provider is rate-limiting us on ${model}. This usually clears within a minute.`
    case "overloaded":
    case "server_error":
      return `The model provider is having trouble serving ${model} right now.`
    case "network":
    case "timeout":
      return "Could not reach the model provider."
    case "auth":
      return "The model provider rejected our API key. Check OPENROUTER_API_KEY."
    case "credit":
      return "The model provider account is out of credit."
    case "unknown_model":
      return `The provider does not serve "${model}". Check AGENT_MODEL.`
    case "context_too_long":
      return "That conversation is too long for the model. Start a new one."
    case "cancelled":
      return "That request was cancelled."
    default:
      return `The model call failed on ${model}.`
  }
}
