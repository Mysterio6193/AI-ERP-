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
  /**
   * A registered group channel to post into instead of a private message.
   *
   * A finding usually belongs to a team rather than to one person — stock to
   * the warehouse, an overdue invoice to accounts — and a report that only
   * ever lands in an admin's DM is seen by exactly one pair of eyes.
   */
  groupId?: string | null
  /**
   * Actions the run wants to take that need a person to say yes.
   *
   * A scheduled agent that proposes a purchase order and delivers the text
   * without it leaves the proposal sitting in the table with nothing pointing
   * at it — the work was done and nobody was asked. These ride along with the
   * report, on the same approve/reject buttons the interactive chat uses, so a
   * decision is one tap rather than a trip to a screen.
   */
  approvals?: Array<{ proposalId: string; summary: string; reason?: string }>
  /** Sent even when the agent had nothing to say. Off by default. */
  force?: boolean
}): Promise<DeliveryResult> {
  const text = (input.text || "").trim()

  const approvals = input.approvals ?? []

  // Something waiting on a person is never a quiet day, whatever the text says.
  if (!input.force && approvals.length === 0 && !isWorthSending(text)) {
    return { delivered: false, channel: null, reason: "Nothing worth reporting" }
  }

  const buttons = approvals.length
    ? approvals.map((a) => [
        { text: `✅ Approve: ${a.summary}`.slice(0, 60), callbackData: `approve:${a.proposalId}` },
        { text: "❌ Reject", callbackData: `reject:${a.proposalId}` },
      ])
    : undefined

  const body = approvals.length
    ? `${text || "Awaiting your decision."}\n\n${approvals.length} action${approvals.length === 1 ? "" : "s"} need${approvals.length === 1 ? "s" : ""} approval:`
    : text

  if (input.groupId) {
    const group = await db.agentGroupChannel.findUnique({
      where: { id: input.groupId },
      select: { externalId: true, name: true, status: true },
    })

    if (group && group.status === "active") {
      try {
        await sendTelegramMessage(group.externalId, body, buttons)
        return { delivered: true, channel: `group:${group.name}` }
      } catch (error) {
        // Fall through to the individual rather than losing the report.
        console.error("Scheduled delivery to group failed:", error)
      }
    }
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
      await sendTelegramMessage(identity.externalId, body, buttons)
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
    // Email has no buttons, so it says where the decision lives instead of
    // silently dropping the actions.
    message: approvals.length
      ? `${body}\n\n${approvals.map((a, i) => `${i + 1}. ${a.summary}`).join("\n")}\n\nApprove or reject these in Settings → Agent, or from Telegram.`
      : text,
    companyId: user.companyId,
  })

  return sent.success
    ? { delivered: true, channel: "email" }
    : { delivered: false, channel: "email", reason: "Email transport unavailable" }
}
