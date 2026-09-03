import fs from "node:fs"
import path from "node:path"

import {
  deleteTelegramWebhook,
  getTelegramMe,
  getTelegramUpdates,
  isTelegramConfigured,
} from "../src/lib/agent/channels/telegram"
import { processTelegramUpdate } from "../src/app/api/agent/telegram/route"

/**
 * Long-polling runner for Telegram.
 *
 * Allows Telegram bot to be used in local development without setting up
 * an HTTPS reverse proxy (ngrok/Cloudflare tunnel).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/telegram-poll.ts
 */

/**
 * Where the last-seen update offset lives between runs.
 *
 * Nothing in this repo already tracks polling cursors in the database, and
 * this script only ever runs on one developer's machine at a time, so a
 * plain local file is enough - without it, every restart replays whatever
 * Telegram still has buffered and re-triggers the agent for updates already
 * handled.
 */
const OFFSET_FILE = path.join(__dirname, ".telegram-poll-offset")

function loadOffset(): number {
  try {
    const raw = fs.readFileSync(OFFSET_FILE, "utf8").trim()
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  } catch {
    return 0
  }
}

function saveOffset(offset: number) {
  try {
    fs.writeFileSync(OFFSET_FILE, String(offset), "utf8")
  } catch (error) {
    console.warn("Failed to persist Telegram poll offset:", error)
  }
}


/** What arrived, in one line, so an ignored message is visible as ignored. */
function describeUpdate(update: any): string {
  if (update.callback_query) return "callback_query (button press)"

  const message = update.message
  if (!message) return `no message on update (keys: ${Object.keys(update).join(", ")})`

  const chatType = message.chat?.type ?? "?"
  const from = message.from?.first_name || message.from?.username || "?"
  const text = (message.text || message.caption || "").trim()

  const kind = text
    ? `text ${JSON.stringify(text.slice(0, 60))}`
    : message.voice ? "voice note"
    : message.photo ? "photo"
    : message.sticker ? "sticker"
    : message.document ? "document"
    : `no text (keys: ${Object.keys(message).filter((k) => !["message_id", "from", "chat", "date"].includes(k)).join(", ") || "none"})`

  return `${chatType} from ${from} (chat ${message.chat?.id}) — ${kind}`
}

async function main() {
  if (!isTelegramConfigured()) {
    console.error("❌ TELEGRAM_BOT_TOKEN is not configured in .env")
    console.error("Add TELEGRAM_BOT_TOKEN=your_token_from_botfather to .env and run this script again.")
    process.exit(1)
  }

  // Annotated, because `let me = null` infers the type `null` and every
  // property read on it afterwards is an error.
  let me: Awaited<ReturnType<typeof getTelegramMe>> = null
  let attempts = 0
  while (!me && attempts < 10) {
    attempts++
    me = await getTelegramMe()
    if (!me) {
      console.log(`⏳ Connecting to Telegram (attempt ${attempts}/10)...`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  if (!me) {
    console.error("❌ Failed to connect to Telegram after multiple attempts. Check TELEGRAM_BOT_TOKEN and network.")
    process.exit(1)
  }

  console.log(`🤖 Connected as @${me.username || me.first_name} (ID: ${me.id})`)
  console.log("Clearing any registered webhook to enable long-polling mode...")
  try {
    await deleteTelegramWebhook()
  } catch (err) {
    console.warn("Notice: webhook clear skipped:", err)
  }

  console.log("🟢 Listening for Telegram messages via long-polling (Press Ctrl+C to stop)...")

  let offset = loadOffset()
  if (offset > 0) {
    console.log(`Resuming from persisted offset ${offset}`)
  }
  let running = true

  process.on("SIGINT", () => {
    console.log("\nStopping Telegram poller...")
    running = false
    process.exit(0)
  })

  while (running) {
    try {
      const updates = await getTelegramUpdates(offset, 1)
      if (Array.isArray(updates) && updates.length > 0) {
        for (const update of updates) {
          const updateId = Number(update.update_id)
          if (!isNaN(updateId)) {
            offset = Math.max(offset, updateId + 1)
            // Persisted as soon as an update is claimed, not only after it
            // finishes processing - Telegram already considers anything below
            // this offset delivered, so a crash mid-batch must not replay
            // updates this process has already taken off the queue.
            saveOffset(offset)
          }

          // A summary of what actually arrived. "Completed successfully" only
          // means the handler returned, and it returns early for a message with
          // no text, an unlinked chat, or a group it was not addressed in — so
          // without this line a silently-ignored message is indistinguishable
          // from an answered one.
          console.log(`[Telegram Update #${updateId}] ${describeUpdate(update)}`)
          // Awaited sequentially: dispatching without awaiting let a slow
          // update (a long agent turn, a slow TTS call) race with the next
          // poll's updates and process them concurrently and out of order.
          try {
            await processTelegramUpdate(update as any)
            console.log(`[Telegram Update #${updateId}] Completed successfully.`)
          } catch (err) {
            console.error(`Error processing Telegram update #${updateId}:`, err)
          }
        }
      }
    } catch (error) {
      console.error("Error during Telegram polling tick:", error)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

main().catch(console.error)
