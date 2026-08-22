import { NextRequest, NextResponse } from "next/server"

import { consumeLinkCode, lookupIdentity } from "@/lib/agent/channels/identity"
import {
  answerCallbackQuery,
  isTelegramConfigured,
  logTelegramMessage,
  sendTelegramMessage,
  sendTypingIndicator,
  verifyTelegramSecret,
} from "@/lib/agent/channels/telegram"
import { resolveProposal, runAgentTurn, type PendingApproval } from "@/lib/agent/runtime"
import { db } from "@/lib/db"

/**
 * Telegram webhook.
 *
 * Telegram retries anything that is not answered quickly, so this always
 * returns 200 immediately and does the work before responding only because the
 * agent turn is fast enough; long tools stream their result as a follow-up
 * message rather than holding the webhook open.
 */

const CHANNEL = "telegram"

interface TelegramUpdate {
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { id: number; first_name?: string; username?: string }
    text?: string
  }
  callback_query?: {
    id: string
    data?: string
    message?: { message_id: number; chat: { id: number } }
    from?: { id: number; first_name?: string; username?: string }
  }
}

function approvalButtons(approvals: PendingApproval[]) {
  return approvals.map((approval) => [
    { text: `✅ Approve: ${approval.summary}`, callbackData: `approve:${approval.proposalId}` },
    { text: "❌ Reject", callbackData: `reject:${approval.proposalId}` },
  ])
}

function helpText() {
  return [
    "SupplySure agent.",
    "",
    "Link your account first: send /link followed by the code from Settings → Agent.",
    "",
    "Then just talk to me:",
    "• how are we tracking today",
    "• who's overdue and by how much",
    "• stock on roma tomatoes",
    "• order 5 cartons of olive oil for Codex Flow",
    "• remind me to call Sarah tomorrow about the credit app",
  ].join("\n")
}

export async function POST(request: NextRequest) {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: true, skipped: "not_configured" })
  }

  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let update: TelegramUpdate

  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query)
      return NextResponse.json({ ok: true })
    }

    if (update.message) {
      await handleMessage(update.message)
    }
  } catch (error) {
    console.error("Telegram update failed:", error)

    const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id
    if (chatId) {
      await sendTelegramMessage(chatId, "Something went wrong handling that. Try again in a moment.")
    }
  }

  return NextResponse.json({ ok: true })
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = String(message.chat.id)
  const text = (message.text || "").trim()
  const displayName = message.from?.first_name || message.from?.username

  if (!text) {
    return
  }

  if (text === "/start" || text === "/help") {
    await sendTelegramMessage(chatId, helpText())
    return
  }

  if (text.toLowerCase().startsWith("/link")) {
    const code = text.split(/\s+/)[1]

    if (!code) {
      await sendTelegramMessage(chatId, "Send /link followed by your code, e.g. /link A1B2C3")
      return
    }

    const result = await consumeLinkCode({ channel: CHANNEL, externalId: chatId, code, displayName })

    if (result.status !== "linked") {
      await sendTelegramMessage(chatId, "That code is not valid or has expired. Generate a new one in Settings → Agent.")
      return
    }

    await sendTelegramMessage(
      chatId,
      `Linked. You're signed in as ${result.identity.principal.name}. Ask me anything about the business.`
    )
    return
  }

  const lookup = await lookupIdentity({ channel: CHANNEL, externalId: chatId, displayName })

  if (lookup.status === "blocked") {
    await sendTelegramMessage(chatId, "This account is not active. Talk to your administrator.")
    return
  }

  if (lookup.status === "unlinked") {
    await sendTelegramMessage(
      chatId,
      "You're not linked to a SupplySure account yet. Open Settings → Agent in the app, generate a code, then send me /link YOURCODE."
    )
    return
  }

  await sendTypingIndicator(chatId)

  const { principal, identityId } = lookup.identity

  await logTelegramMessage({
    customerId: principal.kind === "customer" ? principal.customerId : null,
    direction: "inbound",
    recipient: displayName || chatId,
    message: text,
    externalId: String(message.message_id),
  })

  const turn = await runAgentTurn({
    principal,
    channel: CHANNEL,
    threadKey: chatId,
    userMessage: text,
    identityId,
  })

  const reply = turn.text || (turn.pendingApprovals.length ? "That needs your approval:" : "Done.")

  await sendTelegramMessage(
    chatId,
    reply,
    turn.pendingApprovals.length ? approvalButtons(turn.pendingApprovals) : undefined
  )

  await logTelegramMessage({
    customerId: principal.kind === "customer" ? principal.customerId : null,
    direction: "outbound",
    recipient: displayName || chatId,
    message: reply,
  })
}

async function handleCallback(callback: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatId = callback.message?.chat.id ? String(callback.message.chat.id) : null
  const [action, proposalId] = (callback.data || "").split(":")

  if (!chatId || !proposalId || (action !== "approve" && action !== "reject")) {
    await answerCallbackQuery(callback.id)
    return
  }

  const lookup = await lookupIdentity({ channel: CHANNEL, externalId: chatId })

  if (lookup.status !== "linked") {
    await answerCallbackQuery(callback.id, "Link your account first")
    return
  }

  const proposal = await db.agentProposal.findUnique({
    where: { id: proposalId },
    select: { status: true, summary: true },
  })

  if (!proposal) {
    await answerCallbackQuery(callback.id, "That request no longer exists")
    return
  }

  if (proposal.status !== "pending") {
    await answerCallbackQuery(callback.id, `Already ${proposal.status}`)
    return
  }

  const approved = action === "approve"
  await answerCallbackQuery(callback.id, approved ? "Approved" : "Rejected")

  const { principal } = lookup.identity

  try {
    const turn = await resolveProposal({
      proposalId,
      approved,
      principal,
      decidedByUserId: principal.kind === "staff" ? principal.userId : undefined,
      note: approved ? "Approved from Telegram" : "Rejected from Telegram",
    })

    await sendTelegramMessage(
      chatId,
      turn.text || (approved ? `Done: ${proposal.summary}` : `Cancelled: ${proposal.summary}`)
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete that"
    await sendTelegramMessage(chatId, message)
  }
}
