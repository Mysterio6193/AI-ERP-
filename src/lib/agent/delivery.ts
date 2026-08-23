import { db } from "@/lib/db"
import { sendTelegramMessage } from "@/lib/agent/channels/telegram"
import { sendCommunicationMessage } from "@/lib/communications"

/**
 * Getting a scheduled run's output to a person.
 *
 * `runScheduledAgent` produced the text, recorded that the run succeeded, and
 * delivered it nowhere — the reply went into the cron endpoint's JSON response,
 * which nothing reads. A briefing that runs every morning and reaches no one is
 * the same shape as a discount engine with no callers: it works, and it does
 * not matter.
 *
 * Delivery follows the person the agent runs as, because that is who is
 * accountable for what it found. Telegram first, since it is where staff
 * already are, and email as the fallback.
 */

/** Exactly what a quiet agent says when there is nothing to report. */
export const NOTHING_TO_REPORT = "nothing needs attention"

export interface DeliveryResult {
  delivered: boolean
  channel: string | null
  reason?: string
}

/**
 * Whether this output is worth interrupting someone for.
 *
 * A proactive agent earns its place by staying silent on a normal day. A report
 * that arrives every morning saying "all fine" trains people to stop reading
 * it, and then the one that matters is missed too.
 */
export function isWorthSending(text: string | null | undefined): boolean {
  const trimmed = (text || "").trim()

  if (!trimmed) return false

  // Compared on letters alone, so trailing punctuation or a stray emoji does
  // not turn a quiet day into an alert.
  const normalised = trimmed.toLowerCase().replace(/[^a-z ]/g, "").trim()

  return normalised !== NOTHING_TO_REPORT
}

export async function deliverAgentOutput(input: {
  userId: string | null
  text: string | null
  subject?: string
  /** Sent even when the agent had nothing to say. Off by default. */
  force?: boolean
}): Promise<DeliveryResult> {
  const text = (input.text || "").trim()

  if (!input.force && !isWorthSending(text)) {
    return { delivered: false, channel: null, reason: "Nothing worth reporting" }
  }

  if (!input.userId) {
    return { delivered: false, channel: null, reason: "No user to deliver to" }
  }

  const identity = await db.channelIdentity.findFirst({
    where: { userId: input.userId, status: "active", channel: "telegram" },
    select: { externalId: true },
  })

  if (identity?.externalId) {
    try {
      await sendTelegramMessage(identity.externalId, text)
      return { delivered: true, channel: "telegram" }
    } catch (error) {
      // Fall through to email rather than losing the report entirely.
      console.error("Scheduled delivery over Telegram failed:", error)
    }
  }

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { email: true, companyId: true },
  })

  if (!user?.email) {
    return { delivered: false, channel: null, reason: "No Telegram link and no email address" }
  }

  const sent = await sendCommunicationMessage({
    to: user.email,
    method: "email",
    subject: input.subject || "Agent report",
    message: text,
    companyId: user.companyId,
  })

  return sent.success
    ? { delivered: true, channel: "email" }
    : { delivered: false, channel: "email", reason: "Email transport unavailable" }
}
