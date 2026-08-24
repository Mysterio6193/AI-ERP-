import { NextRequest, NextResponse } from "next/server"

import { clientKey, rateLimit } from "@/lib/rate-limit"

/**
 * Rate limiting for routes, in one place.
 *
 * `rateLimit` existed and was tested, and was applied to two routes out of a
 * hundred and forty. The two endpoints that spend real money on every call —
 * the agent chat and voice transcription — had no limit at all, so a loop
 * against either is a billing incident rather than an outage. Sign-in had none
 * either, which is an open door for credential stuffing.
 *
 * This wraps the counter with the parts every caller needs and nobody should
 * rewrite: a namespaced key, a proper 429, and a Retry-After header so a
 * well-behaved client backs off instead of hammering.
 */

export interface GuardOptions {
  /** Namespace, so two routes never share a counter. */
  name: string
  limit: number
  windowSeconds: number
  /**
   * Something stable about the caller beyond their address — an email, a user
   * id, a session. Proxy headers are forgeable, so an address alone lets a
   * rotating-IP caller past; pairing it with a subject keeps the limit real.
   */
  subject?: string | null
  /** Shown to the caller. Say what to do, not just what went wrong. */
  message?: string
}

export function guardRate(request: NextRequest, options: GuardOptions): NextResponse | null {
  const subject = options.subject ? `:${options.subject.toLowerCase()}` : ""
  const key = `${options.name}:${clientKey(request)}${subject}`

  const result = rateLimit({
    key,
    limit: options.limit,
    windowSeconds: options.windowSeconds,
  })

  if (result.ok) {
    return null
  }

  const wait = result.retryAfterSeconds

  return NextResponse.json(
    {
      success: false,
      error:
        options.message ||
        `Too many requests. Try again in ${wait} second${wait === 1 ? "" : "s"}.`,
      retryAfterSeconds: wait,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(wait),
        "X-RateLimit-Limit": String(options.limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  )
}

/**
 * Limits for the endpoints that cost money or protect credentials.
 *
 * Deliberately generous for humans and immediately painful for loops. The
 * agent chat allows a fast back-and-forth conversation and stops a script;
 * transcription is tighter because each call is a longer, dearer request.
 */
export const RATE_LIMITS = {
  agentChat: { name: "agent-chat", limit: 30, windowSeconds: 60 },
  voiceTranscribe: { name: "voice-transcribe", limit: 12, windowSeconds: 60 },
  login: { name: "login", limit: 8, windowSeconds: 300 },
  register: { name: "register", limit: 5, windowSeconds: 900 },
} as const
