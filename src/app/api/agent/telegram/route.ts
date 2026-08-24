import { NextRequest, NextResponse } from "next/server"

import { consumeLinkCode, lookupIdentity } from "@/lib/agent/channels/identity"
import {
  answerCallbackQuery,
  downloadTelegramFile,
  isTelegramConfigured,
  logTelegramMessage,
  sendRecordVoiceAction,
  sendTelegramMessage,
  sendTelegramVoice,
  sendTypingIndicator,
  verifyTelegramSecret,
} from "@/lib/agent/channels/telegram"
import { resolveProposal, runAgentTurn, type AgentTurn, type PendingApproval } from "@/lib/agent/runtime"
import { db } from "@/lib/db"
import { processDocumentOcr } from "@/lib/ocr/engine"
import { transcribeAudio } from "@/lib/voice/transcribe"
import { synthesizeSpeech } from "@/lib/voice/tts"

/**
 * Telegram webhook.
 *
 * Telegram retries anything that is not answered quickly, so this always
 * returns 200 immediately and does the work before responding only because the
 * agent turn is fast enough; long tools stream their result as a follow-up
 * message rather than holding the webhook open.
 */

const CHANNEL = "telegram"

/** Cached bot username, resolved on first use from TELEGRAM_BOT_TOKEN's getMe. */
let botUsername = "SupplySureOSBot"
let botId: number | null = null

async function ensureBotInfo() {
  if (botId) return
  try {
    const { getTelegramMe } = await import("@/lib/agent/channels/telegram")
    const me = await getTelegramMe()
    if (me) {
      botUsername = me.username || botUsername
      botId = me.id
    }
  } catch { /* use defaults */ }
}

type MessageLike = NonNullable<TelegramUpdate["message"]>

/** True if any @-mention entity in the message points at the bot. */
function isBotMentioned(message: MessageLike): boolean {
  if (!message.entities) return false
  const text = message.text || ""
  for (const entity of message.entities) {
    if (entity.type === "mention") {
      const mentionText = text.slice(entity.offset, entity.offset + entity.length)
      if (mentionText.toLowerCase() === `@${botUsername.toLowerCase()}`) return true
    }
    if (entity.type === "text_mention" && entity.user?.id === botId) return true
  }
  return false
}

/** True if the message is a reply to one of the bot's own messages. */
function isReplyToBot(message: MessageLike): boolean {
  if (!message.reply_to_message?.from) return false
  if (botId && message.reply_to_message.from.id === botId) return true
  if (message.reply_to_message.from.is_bot && message.reply_to_message.from.username?.toLowerCase() === botUsername.toLowerCase()) return true
  return false
}

/** Auto-register a Telegram group as an AgentGroupChannel if it doesn't exist yet. */
async function autoRegisterGroup(chatId: string, title: string) {
  await db.agentGroupChannel.upsert({
    where: { channel_externalId: { channel: CHANNEL, externalId: chatId } },
    create: {
      channel: CHANNEL,
      externalId: chatId,
      name: title,
      purpose: "general",
      // Pending, not active. Anyone can add a bot to a Telegram group, and a
      // group that works the moment it is added means a stranger's room gets
      // business answers as soon as one linked staff member speaks there. An
      // admin in the group approves it with /channel approve.
      status: "pending",
    },
    update: {
      name: title,
    },
  })
}

interface TelegramUpdate {
  message?: {
    message_id: number
    chat: { id: number; type: string; title?: string }
    from?: { id: number; first_name?: string; username?: string }
    text?: string
    caption?: string
    voice?: { file_id: string; duration?: number; mime_type?: string }
    audio?: { file_id: string; duration?: number; mime_type?: string }
    photo?: Array<{ file_id: string; width: number; height: number }>
    document?: { file_id: string; file_name?: string; mime_type?: string }
    reply_to_message?: { from?: { id: number; is_bot?: boolean; username?: string } }
    entities?: Array<{ type: string; offset: number; length: number; user?: { id: number; username?: string } }>
    new_chat_members?: Array<{ id: number; is_bot?: boolean; username?: string }>
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

export async function processTelegramUpdate(update: TelegramUpdate) {
  await ensureBotInfo()
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query)
      return { ok: true }
    }

    if (update.message) {
      await handleMessage(update.message)
      return { ok: true }
    }
  } catch (error) {
    console.error("Telegram update failed:", error)

    const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id
    if (chatId) {
      await sendTelegramMessage(chatId, "Something went wrong handling that. Try again in a moment.")
    }
    return { ok: false, error }
  }

  return { ok: true }
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

  await processTelegramUpdate(update)
  return NextResponse.json({ ok: true })
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = String(message.chat.id)
  const chatType = message.chat.type // "private", "group", "supergroup", "channel"
  const isGroup = chatType === "group" || chatType === "supergroup"
  let text = (message.text || message.caption || "").trim()
  const displayName = message.from?.first_name || message.from?.username
  const senderId = message.from?.id ? String(message.from.id) : null

  // ── Handle bot being added to a group ──
  if (isGroup && message.new_chat_members?.some((m) => m.is_bot && m.username === botUsername)) {
    await autoRegisterGroup(chatId, message.chat.title || "Unnamed Group")
    await sendTelegramMessage(
      chatId,
      [
        `👋 Hey team! I'm your SupplySure OS AI assistant, now active in this group.`,
        ``,
        `Here's how to talk to me:`,
        `• **@${botUsername}** followed by your question`,
        `• **Reply** to any of my messages`,
        `• **/ask** followed by your question`,
        ``,
        `Examples:`,
        `• @${botUsername} what's our stock on roma tomatoes?`,
        `• /ask who's overdue and by how much?`,
        `• /ask how are we tracking today?`,
        ``,
        `I can do everything I do in DMs — orders, inventory, finance, CRM, you name it. 🚀`,
        ``,
        `Use **/channel** to configure this group's purpose (e.g. /channel operations).`,
      ].join("\n")
    )
    return
  }

  // ── Group message filtering: only respond when addressed ──
  if (isGroup) {
    const groupChannel = await db.agentGroupChannel.findUnique({
      where: { channel_externalId: { channel: CHANNEL, externalId: chatId } },
    })

    // If group not registered, auto-register silently (no spam)
    if (!groupChannel) {
      await autoRegisterGroup(chatId, message.chat.title || "Unnamed Group")
    }

    const activeGroup = groupChannel || await db.agentGroupChannel.findUnique({
      where: { channel_externalId: { channel: CHANNEL, externalId: chatId } },
    })

    // Handle /channel command to configure this group
    if (text.toLowerCase().startsWith("/channel")) {
      const purpose = text.split(/\s+/).slice(1).join(" ").trim()
      if (purpose && activeGroup) {
        await db.agentGroupChannel.update({
          where: { id: activeGroup.id },
          data: { purpose, name: message.chat.title || activeGroup.name },
        })
        await sendTelegramMessage(chatId, `✅ Group channel purpose updated to: **${purpose}**`)
      } else {
        await sendTelegramMessage(
          chatId,
          `Current purpose: **${activeGroup?.purpose || "general"}**\n\nUsage: /channel <purpose>\nExamples: /channel operations, /channel sales, /channel warehouse`
        )
      }
      return
    }

    // Approving the group. Only a linked staff admin can do it, and only from
    // inside the group — which is the proof they are actually in the room.
    if (text.toLowerCase().startsWith("/channel approve")) {
      // Resolved by the sender's own id, not the group chat id — the question
      // is who is asking, not where they are asking from.
      const approverKey = senderId || chatId
      const approver = await lookupIdentity({ channel: CHANNEL, externalId: approverKey, displayName })

      const approverIsAdmin =
        approver.status === "linked" &&
        approver.identity.principal.kind === "staff" &&
        approver.identity.principal.role === "admin"

      if (!approverIsAdmin) {
        await sendTelegramMessage(
          chatId,
          "Only a linked admin can approve this group. Link your account in Settings → Agent first."
        )
        return
      }

      await db.agentGroupChannel.updateMany({
        where: { channel: CHANNEL, externalId: chatId },
        data: { status: "active" },
      })

      await sendTelegramMessage(
        chatId,
        `✅ Approved by ${approver.identity.principal.name}. I can answer in this group now.\n\nSet what it is for with /channel <purpose> — for example /channel warehouse.`
      )
      return
    }

    // An unapproved group gets no answers at all — not a refusal after the
    // work is done, but before any tool runs or any data is read.
    if (activeGroup && activeGroup.status !== "active") {
      if (isBotMentioned(message) || text.toLowerCase().startsWith("/ask")) {
        await sendTelegramMessage(
          chatId,
          "This group has not been approved yet. An admin who is linked to SupplySure can approve it here with /channel approve."
        )
      }
      return
    }

    // Handle /ask command
    if (text.toLowerCase().startsWith("/ask")) {
      text = text.slice(4).trim()
      if (!text) {
        await sendTelegramMessage(chatId, `Usage: /ask <your question>\nExample: /ask what orders need dispatching today?`)
        return
      }
      // Fall through to process the question
    }
    // Check if bot is @-mentioned
    else if (isBotMentioned(message)) {
      // Strip the @mention from the text
      text = text.replace(new RegExp(`@${botUsername}\\b`, "gi"), "").trim()
      if (!text) {
        await sendTelegramMessage(chatId, `Yes? Ask me anything! 😊`)
        return
      }
    }
    // Check if this is a reply to one of the bot's messages
    else if (isReplyToBot(message)) {
      // Use the text as-is, it's a reply to the bot
    }
    // Check if autoReply is enabled
    else if (activeGroup?.autoReply) {
      // Fall through to process
    }
    // Otherwise, ignore the message (don't respond to every group message)
    else {
      return
    }

    // Prefix group context for the AI
    const groupLabel = activeGroup?.purpose || "general"
    text = `[Group Channel: ${message.chat.title || "Team Chat"} (${groupLabel})] [From: ${displayName || "Unknown"}] ${text}`
  }

  // 1. Process Voice Notes / Audio messages
  if (!text && (message.voice || message.audio)) {
    const audioObj = message.voice || message.audio!
    await sendTypingIndicator(chatId)
    const downloaded = await downloadTelegramFile(audioObj.file_id)
    if (downloaded) {
      try {
        const transcript = await transcribeAudio({
          audioBuffer: downloaded.buffer,
          mimeType: downloaded.mimeType || audioObj.mime_type || "audio/ogg",
        })
        if (transcript.text) {
          text = `🎙️ Voice Note: "${transcript.text}"`
        }
      } catch (err) {
        console.error("Telegram voice transcription failed:", err)
      }
    }
  }

  // 2. Process Document / Photo Scans
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    await sendTypingIndicator(chatId)
    const largestPhoto = message.photo[message.photo.length - 1]
    const downloaded = await downloadTelegramFile(largestPhoto.file_id)
    if (downloaded) {
      try {
        const ocr = await processDocumentOcr({
          imageBase64: downloaded.buffer.toString("base64"),
          mimeType: downloaded.mimeType || "image/jpeg",
        })
        const itemsSummary = ocr.items?.map((i) => `${i.quantity}x ${i.description} ($${i.lineTotal})`).join(", ")
        const docSummary = `📄 [Scanned ${ocr.documentType?.replace(/_/g, " ").toUpperCase()}]: ${ocr.vendorName || "Vendor"} #${ocr.documentNumber || "N/A"} · Total: $${ocr.totalAmount || 0} (${ocr.items?.length || 0} items: ${itemsSummary || "None"})`
        text = text ? `${text}\n\n${docSummary}` : docSummary
      } catch (err) {
        console.error("Telegram OCR scan failed:", err)
      }
    }
  }

  if (!text) {
    return
  }

  // ── Private chat commands ──
  if (!isGroup) {
    if (text.toLowerCase().startsWith("/start")) {
      const rawArg = text.split(/\s+/)[1]
      if (rawArg) {
        const code = rawArg.replace(/^connect_/i, "").trim().toUpperCase()
        const result = await consumeLinkCode({ channel: CHANNEL, externalId: chatId, code, displayName })

        if (result.status === "linked") {
          await sendTelegramMessage(
            chatId,
            `🎉 Account Connected!\n\nWelcome to SupplySure OS AI, ${result.identity.principal.name}.\n\nYou can now query operations, review live stock, approve purchase/sales orders, and look up customer accounts directly from Telegram.\n\nTry asking: "What needs attention today?" or "Check inventory on roma tomatoes"`
          )
          return
        } else {
          await sendTelegramMessage(
            chatId,
            "⚠️ That connection QR code is invalid or has expired. Please open SupplySure OS Settings → Telegram and scan a new QR code."
          )
          return
        }
      }

      await sendTelegramMessage(chatId, helpText())
      return
    }

    if (text === "/help") {
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
        `🎉 Account Connected!\n\nWelcome to SupplySure OS AI, ${result.identity.principal.name}.\n\nYou can now ask me anything about the business or execute staff actions.`
      )
      return
    }
  }

  // ── Identity resolution ──
  // In groups: resolve by the sender's personal user ID (not group chat ID)
  // In private: resolve by the chat ID (which equals user ID for private chats)
  const identityKey = isGroup && senderId ? senderId : chatId
  const lookup = await lookupIdentity({ channel: CHANNEL, externalId: identityKey, displayName })

  if (lookup.status === "blocked") {
    await sendTelegramMessage(chatId, "This account is not active. Talk to your administrator.")
    return
  }

  if (lookup.status === "unlinked") {
    if (isGroup) {
      await sendTelegramMessage(
        chatId,
        `Hey ${displayName || "there"} — I don't recognise your account yet. DM me @${botUsername} and send /link YOURCODE to connect first, then you can talk to me here in the group. 🔗`
      )
    } else {
      await sendTelegramMessage(
        chatId,
        "You're not linked to a SupplySure account yet. Open Settings → Agent in the app, generate a code, then send me /link YOURCODE."
      )
    }
    return
  }

  const { principal, identityId } = lookup.identity

  await logTelegramMessage({
    customerId: principal.kind === "customer" ? principal.customerId : null,
    direction: "inbound",
    recipient: displayName || chatId,
    message: text,
    externalId: String(message.message_id),
  })

  const isVoiceRequest = Boolean(
    message.voice ||
    message.audio ||
    text.startsWith("🎙️ Voice Note:") ||
    text.toLowerCase().includes("voice note") ||
    text.toLowerCase().includes("voice reply") ||
    text.toLowerCase().includes("reply in voice") ||
    text.toLowerCase().includes("speak to me") ||
    text.toLowerCase().includes("say it")
  )

  // Show immediate & continuous typing / recording indicator
  if (isVoiceRequest) {
    sendRecordVoiceAction(chatId).catch(() => {})
  } else {
    sendTypingIndicator(chatId).catch(() => {})
  }
  const typingTimer = setInterval(() => {
    if (isVoiceRequest) {
      sendRecordVoiceAction(chatId).catch(() => {})
    } else {
      sendTypingIndicator(chatId).catch(() => {})
    }
  }, 4000)

  let turn
  try {
    turn = await runAgentTurn({
      principal,
      channel: CHANNEL,
      threadKey: isGroup ? `group:${chatId}` : chatId,
      userMessage: text,
      identityId,
    })
  } finally {
    clearInterval(typingTimer)
  }

  const reply = ("ok" in turn ? turn.error : turn.text) || (turn.pendingApprovals.length ? "That needs your approval:" : "Done.")

  // 1. Send text reply immediately so the user gets it right away
  await sendTelegramMessage(
    chatId,
    reply,
    turn.pendingApprovals.length ? approvalButtons(turn.pendingApprovals) : undefined
  )

  // 2. Concurrently synthesize and dispatch spoken audio voice note in background
  if (isVoiceRequest && reply) {
    (async () => {
      try {
        await sendRecordVoiceAction(chatId)
        const speech = await synthesizeSpeech({ text: reply })
        if (speech?.buffer) {
          await sendTelegramVoice(chatId, speech.buffer)
        }
      } catch (voiceError) {
        console.warn("Failed to generate voice note reply for Telegram:", voiceError)
      }
    })().catch(() => {})
  }

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

    if ("ok" in turn && turn.ok === false) {
      await sendTelegramMessage(chatId, turn.error)
      return
    }

    const successfulTurn = turn as AgentTurn
    await sendTelegramMessage(
      chatId,
      successfulTurn.text || (approved ? `Done: ${proposal.summary}` : `Cancelled: ${proposal.summary}`)
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete that"
    await sendTelegramMessage(chatId, message)
  }
}
