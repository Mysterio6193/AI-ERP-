/**
 * Accepting a chat message from a client.
 *
 * The AI SDK's `convertToModelMessages` wants UI messages shaped
 * `{ role, parts: [...] }` and reaches straight into `parts` without checking.
 * Anything else — including the obvious `{ role, content: "..." }` that any
 * script or curl would send — makes it throw a TypeError deep inside the SDK,
 * which the route then reports as a 500.
 *
 * A 500 says "we broke". The truth is "you sent something we do not accept",
 * which is a 400, and it should name what was wrong. So the shape is settled
 * here, at the boundary, before anything reaches the SDK.
 *
 * `{ role, content }` is normalised rather than refused. It is the shape
 * everyone reaches for first, the meaning is unambiguous, and refusing it
 * would be pedantry dressed up as strictness.
 */

export type UiRole = "system" | "user" | "assistant"

export interface UiPart {
  type: string
  text?: string
  [key: string]: unknown
}

export interface UiMessage {
  id?: string
  role: UiRole
  parts: UiPart[]
  [key: string]: unknown
}

export type NormaliseResult =
  | { ok: true; messages: UiMessage[] }
  | { ok: false; error: string }

const ROLES = new Set<UiRole>(["system", "user", "assistant"])

/** Caps how much a single request can push into the model context. */
export const MAX_MESSAGES = 200

export function normaliseUiMessages(input: unknown): NormaliseResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "messages must be an array" }
  }

  if (!input.length) {
    return { ok: false, error: "messages are required" }
  }

  if (input.length > MAX_MESSAGES) {
    return {
      ok: false,
      error: `Too many messages in one request (${input.length}; the limit is ${MAX_MESSAGES})`,
    }
  }

  const messages: UiMessage[] = []

  for (const [index, raw] of input.entries()) {
    const at = `messages[${index}]`

    if (!raw || typeof raw !== "object") {
      return { ok: false, error: `${at} is not an object` }
    }

    const message = raw as Record<string, unknown>
    const role = message.role

    if (typeof role !== "string" || !ROLES.has(role as UiRole)) {
      return {
        ok: false,
        error: `${at}.role must be one of system, user, assistant`,
      }
    }

    if (Array.isArray(message.parts)) {
      // Already the SDK's shape. Only check that the parts are objects with a
      // type, which is the one thing the SDK will dereference.
      for (const [partIndex, part] of message.parts.entries()) {
        if (!part || typeof part !== "object" || typeof (part as UiPart).type !== "string") {
          return {
            ok: false,
            error: `${at}.parts[${partIndex}] must be an object with a "type"`,
          }
        }
      }

      messages.push({ ...message, role: role as UiRole, parts: message.parts as UiPart[] })
      continue
    }

    if (typeof message.content === "string") {
      // The shape everyone sends first. Unambiguous, so accept it.
      if (!message.content.trim()) {
        return { ok: false, error: `${at}.content is empty` }
      }

      messages.push({
        ...message,
        role: role as UiRole,
        parts: [{ type: "text", text: message.content }],
      })
      continue
    }

    return {
      ok: false,
      error: `${at} needs either a "parts" array or a "content" string`,
    }
  }

  return { ok: true, messages }
}
