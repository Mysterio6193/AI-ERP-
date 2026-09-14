/**
 * Turning a failed model call into something a person can act on.
 *
 * The AI SDK's `AI_APICallError` carries the HTTP status text as its
 * `message` — "Forbidden", "Unauthorized", "Too Many Requests" — and puts the
 * part that actually explains the failure in `responseBody`. Surfacing only
 * `message` leaves an operator reading "Forbidden" when the provider said
 * "Host not in allowlist: openrouter.ai", or "Unauthorized" when it said the
 * key is expired.
 *
 * So the response body is folded in, and the host named, because "which
 * provider refused" is the first question and the URL is the only place it is
 * written down.
 *
 * Two limits on that:
 *
 *   - The body is truncated. Some providers return a wall of JSON, and an
 *     error that fills the screen is read as noise.
 *   - Anything that looks like a credential is redacted. Provider errors
 *     sometimes echo the request, and an error message is exactly the kind of
 *     thing that gets pasted into a chat or a ticket.
 */

const MAX_BODY = 400

/** Long random-looking runs that follow a known key prefix, plus bearer tokens. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "$1-***"],
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer ***"],
  [/"(api[_-]?key|authorization|token)"\s*:\s*"[^"]+"/gi, '"$1":"***"'],
]

export function redactSecrets(text: string) {
  let out = text
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

function hostOf(url: unknown): string | null {
  if (typeof url !== "string") return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/**
 * The message to show for a failed agent run.
 *
 * Deliberately not a thrown error type check: the SDK's error classes change
 * between versions, and the fields wanted here are stable while the class
 * names are not.
 */
export function describeAgentError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error || "Agent failed")
  }

  const shaped = error as { message?: unknown; responseBody?: unknown; url?: unknown }
  const message =
    typeof shaped.message === "string" && shaped.message.trim()
      ? shaped.message.trim()
      : "Agent failed"

  const host = hostOf(shaped.url)
  const body =
    typeof shaped.responseBody === "string" && shaped.responseBody.trim()
      ? shaped.responseBody.trim()
      : null

  if (!body) {
    return host ? `${message} (${host})` : message
  }

  const trimmed =
    body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}…` : body

  // Providers sometimes repeat the status text in the body; saying it twice
  // reads as a stutter rather than as detail.
  const detail = trimmed === message ? null : redactSecrets(trimmed)

  if (!detail) {
    return host ? `${message} (${host})` : message
  }

  return host ? `${message} (${host}): ${detail}` : `${message}: ${detail}`
}
