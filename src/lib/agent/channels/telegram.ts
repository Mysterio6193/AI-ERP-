import { db } from "@/lib/db"
import { secretEquals } from "@/lib/secret-compare"

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
    console.warn("TELEGRAM_WEBHOOK_SECRET is not set. Rejecting incoming webhook.")
    return false
  }

  // Constant-time. The webhook is public, so a comparison that returns faster
  // the sooner it finds a wrong byte is a way to learn the secret.
  return secretEquals(expected, headerValue)
}

async function call<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
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

export async function sendTelegramVoice(
  chatId: string | number,
  audioBuffer: Buffer,
  caption?: string,
  buttons?: TelegramButton[][]
) {
  const formData = new FormData()
  formData.append("chat_id", String(chatId))
  // Buffer is not a BlobPart under this lib target; the underlying
  // ArrayBuffer is.
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" })
  formData.append("voice", blob, "voice_reply.mp3")
  if (caption) {
    formData.append("caption", caption.slice(0, 1024))
  }
  if (buttons?.length) {
    formData.append(
      "reply_markup",
      JSON.stringify({
        inline_keyboard: buttons.map((row) =>
          row.map((button) => ({ text: button.text, callback_data: button.callbackData }))
        ),
      })
    )
  }

  try {
    const response = await fetch(`${API_BASE}/bot${token()}/sendVoice`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("sendVoice failed:", response.status, errorText)
    }
  } catch (error) {
    console.error("Failed to send Telegram voice note:", error)
  }
}

export async function sendTelegramDocument(
  chatId: string | number,
  fileBuffer: Buffer,
  fileName: string,
  caption?: string
) {
  const mimeType = fileName.endsWith(".csv")
    ? "text/csv"
    : fileName.endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : fileName.endsWith(".ics")
    ? "text/calendar"
    : fileName.endsWith(".json")
    ? "application/json"
    : fileName.endsWith(".txt")
    ? "text/plain"
    : "application/pdf"

  const formData = new FormData()
  formData.append("chat_id", String(chatId))
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType })
  formData.append("document", blob, fileName)
  if (caption) {
    formData.append("caption", caption.slice(0, 1024))
  }

  try {
    const response = await fetch(`${API_BASE}/bot${token()}/sendDocument`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("sendDocument failed:", response.status, errorText)
      return false
    }
    return true
  } catch (error) {
    console.error("Failed to send Telegram document:", error)
    return false
  }
}

export async function sendUploadDocumentAction(chatId: string | number) {
  await call("sendChatAction", { chat_id: chatId, action: "upload_document" })
}

export async function sendTypingIndicator(chatId: string | number) {
  await call("sendChatAction", { chat_id: chatId, action: "typing" })
}

export async function sendRecordVoiceAction(chatId: string | number) {
  await call("sendChatAction", { chat_id: chatId, action: "record_voice" })
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

export async function deleteTelegramWebhook() {
  return call<boolean>("deleteWebhook", { drop_pending_updates: false })
}

export async function getTelegramUpdates(offset?: number, timeout = 30) {
  return call<Array<Record<string, unknown>>>("getUpdates", {
    offset,
    timeout,
    allowed_updates: ["message", "callback_query"],
  })
}

export async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  const result = await call<{ file_path: string }>("getFile", { file_id: fileId })
  if (!result?.file_path) return null
  return `${API_BASE}/file/bot${token()}/${result.file_path}`
}

export async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; mimeType?: string } | null> {
  const fileUrl = await getTelegramFileUrl(fileId)
  if (!fileUrl) return null

  try {
    const response = await fetch(fileUrl)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const mimeType = response.headers.get("content-type") || undefined
    return { buffer: Buffer.from(arrayBuffer), mimeType }
  } catch (error) {
    console.error("Failed to download Telegram file:", error)
    return null
  }
}

export interface TelegramMe {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
  can_join_groups?: boolean
  can_read_all_group_messages?: boolean
  supports_inline_queries?: boolean
}

export async function getTelegramMe(): Promise<TelegramMe | null> {
  return call<TelegramMe>("getMe", {})
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
  try {
    await db.communicationLog.create({
      data: {
        customerId: input.customerId || null,
        method: "telegram",
        direction: input.direction,
        recipient: input.recipient,
        message: input.message ? input.message.slice(0, 4000) : "",
        status: input.direction === "inbound" ? "received" : "sent",
        externalId: input.externalId || null,
      },
    })
  } catch (err) {
    console.warn("Notice: logTelegramMessage skipped:", err)
  }
}
