import { db } from "@/lib/db"

/**
 * Telegram transport.
 *
 * Telegram is the staff surface: no app store, no login screen, works on any
 * phone, and its inline keyboards give us Approve / Reject buttons for free -
 * which is what turns an over-threshold proposal into a one-tap decision.
 */

const API_BASE = "https://api.telegram.org"

export interface TelegramButton {
  text: string
  callbackData: string
}

function token() {
  const value = process.env.TELEGRAM_BOT_TOKEN
  if (!value) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured")
  }
  return value
}

export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN)
}

/**
 * Telegram signs webhook calls with a secret we choose at registration time.
 * Anything arriving without it is not from Telegram.
 */
export function verifyTelegramSecret(headerValue: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) {
    return true
  }

  return headerValue === expected
}

async function call<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const data = (await response.json()) as { ok: boolean; result?: T; description?: string }

    if (!data.ok) {
      console.error(`Telegram ${method} failed:`, data.description)
      return null
    }

    return data.result ?? null
  } catch (error) {
    console.error(`Telegram ${method} error:`, error)
    return null
  }
}

/** Telegram rejects messages over 4096 characters, so long answers are split. */
function chunk(text: string, size = 3800) {
  if (text.length <= size) {
    return [text]
  }

  const parts: string[] = []
  let rest = text

  while (rest.length > size) {
    const cut = rest.lastIndexOf("\n", size)
    const at = cut > size * 0.6 ? cut : size
    parts.push(rest.slice(0, at))
    rest = rest.slice(at).trimStart()
  }

  parts.push(rest)
  return parts
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  buttons?: TelegramButton[][]
) {
  const parts = chunk(text || "…")

  for (const [index, part] of parts.entries()) {
    const isLast = index === parts.length - 1

    await call("sendMessage", {
      chat_id: chatId,
      text: part,
      ...(isLast && buttons?.length
        ? {
            reply_markup: {
              inline_keyboard: buttons.map((row) =>
                row.map((button) => ({ text: button.text, callback_data: button.callbackData }))
              ),
            },
          }
        : {}),
    })
  }
}

export async function sendTypingIndicator(chatId: string | number) {
  await call("sendChatAction", { chat_id: chatId, action: "typing" })
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await call("answerCallbackQuery", { callback_query_id: callbackQueryId, text })
}

export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string
) {
  await call("editMessageText", { chat_id: chatId, message_id: messageId, text })
}

export async function registerTelegramWebhook(url: string) {
  return call<boolean>("setWebhook", {
    url,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    allowed_updates: ["message", "callback_query"],
  })
}

export async function getTelegramWebhookInfo() {
  return call<Record<string, unknown>>("getWebhookInfo", {})
}

/** Records an inbound or outbound Telegram message on the customer timeline. */
export async function logTelegramMessage(input: {
  customerId?: string | null
  direction: "inbound" | "outbound"
  recipient: string
  message: string
  externalId?: string | null
}) {
  await db.communicationLog.create({
    data: {
      customerId: input.customerId || null,
      method: "telegram",
      direction: input.direction,
      recipient: input.recipient,
      message: input.message,
      status: input.direction === "inbound" ? "received" : "sent",
      externalId: input.externalId || null,
    },
  })
}
