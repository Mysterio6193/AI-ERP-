/**
 * Which server this app talks to.
 *
 * A build-time `EXPO_PUBLIC_API_URL` is wrong for this product: the same
 * binary from the App Store has to serve customers we host and customers
 * running their own install, and the second group cannot rebuild the app to
 * put their address in it. So the address is entered by the user, validated,
 * probed, and stored on the device.
 *
 * Adapted from Rakazo (https://github.com/elie222/rakazo), Apache-2.0 —
 * `apps/mobile/lib/endpoint.ts`. Changes: probes this product's `/api/health`
 * and its response shape, drops the i18n layer, and returns structured
 * failures so the caller can tell "unreachable" from "not our server".
 *
 * The rule worth keeping from the original is the http/https one. A driver
 * signs in from a phone on a stranger's network; allowing plain http to a
 * public host would put those credentials on the wire. http stays allowed on
 * a LAN, because that is exactly how a warehouse reaches its own box.
 */

/** Where the app looks when the user has set nothing. */
const FALLBACK_API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"

export const PROBE_TIMEOUT_MS = 8_000
/** A hostile or misconfigured host must not be able to stream us to death. */
export const MAX_PROBE_BYTES = 64 * 1024

export type EndpointResult =
  | { ok: true; url: string }
  | { ok: false; error: string; reason: "invalid" | "insecure" | "unreachable" | "not-ours" }

export function defaultApiBase() {
  const parsed = normalizeApiBase(FALLBACK_API)
  return parsed.ok ? parsed.url : "http://localhost:3000"
}

/**
 * Turns what someone typed into an origin, or explains why it cannot be one.
 *
 * Accepts a bare host, because that is what people type. Keeps only the
 * origin: a path would silently break every request built on top of it.
 */
export function normalizeApiBase(input: string): EndpointResult {
  const trimmed = input.trim()

  if (!trimmed) {
    return { ok: false, error: "Enter your server address", reason: "invalid" }
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return { ok: false, error: "That does not look like a web address", reason: "invalid" }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Use an http or https address", reason: "invalid" }
  }

  if (!parsed.hostname) {
    return { ok: false, error: "That address is missing a host", reason: "invalid" }
  }

  if (parsed.protocol === "http:" && !isLanOrLocalHost(parsed.hostname)) {
    return {
      ok: false,
      error: "A server on the internet needs https — http only works on your own network",
      reason: "insecure",
    }
  }

  return { ok: true, url: `${parsed.protocol}//${parsed.host}` }
}

/** The host alone, for showing in the UI. */
export function displayApiHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function usesCustomApiBase(url: string, fallback = defaultApiBase()) {
  return url !== fallback
}

/**
 * Checks the address actually hosts this product before it is saved.
 *
 * Without this, a typo is discovered later as a confusing failure on the sign
 * in screen; here it is one clear message while the person is still looking at
 * the field they typed it into.
 */
export async function probeApiBase(
  input: string,
  fetchImpl: typeof fetch = fetch
): Promise<EndpointResult> {
  const parsed = normalizeApiBase(input)
  if (!parsed.ok) return parsed

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

  try {
    const response = await fetchImpl(`${parsed.url}/api/health`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        ok: false,
        error: "That address answered, but it is not a SupplySure server",
        reason: "not-ours",
      }
    }

    const text = await readBounded(response, MAX_PROBE_BYTES)

    let body: { status?: string } = {}
    try {
      body = JSON.parse(text)
    } catch {
      return {
        ok: false,
        error: "That address answered, but it is not a SupplySure server",
        reason: "not-ours",
      }
    }

    if (body.status !== "ok") {
      return {
        ok: false,
        error: "That server is reachable but reports it is not healthy",
        reason: "not-ours",
      }
    }

    return parsed
  } catch {
    // Covers both the timeout and a genuine network failure. The distinction
    // does not help the person holding the phone: either way it is unreachable.
    return { ok: false, error: "Could not reach that server", reason: "unreachable" }
  } finally {
    clearTimeout(timer)
  }
}

/** Reads at most `limit` bytes, so a huge body cannot hang the probe. */
async function readBounded(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader()

  if (!reader) {
    // React Native does not always expose a stream; fall back but stay bounded.
    const text = await response.text()
    return text.slice(0, limit)
  }

  const chunks: Uint8Array[] = []
  let total = 0

  while (total < limit) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.length
    }
  }

  void reader.cancel().catch(() => undefined)

  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.length
  }

  return new TextDecoder().decode(joined).slice(0, limit)
}

/**
 * Whether a host is somewhere plain http is acceptable.
 *
 * Covers loopback, mDNS, the three private IPv4 ranges, and the carrier-grade
 * NAT range that Tailscale and similar overlays hand out — a warehouse
 * reaching its own server over a private mesh is the ordinary case, not an
 * attempt to dodge the https rule.
 */
function isLanOrLocalHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()

  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true
  if (host.endsWith(".local")) return true
  if (/^10(?:\.\d{1,3}){3}$/.test(host)) return true
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(host)) return true
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])(?:\.\d{1,3}){2}$/.test(host)) return true

  return false
}
