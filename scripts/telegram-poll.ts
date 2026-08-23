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

async function main() {
  if (!isTelegramConfigured()) {
    console.error("❌ TELEGRAM_BOT_TOKEN is not configured in .env")
    console.error("Add TELEGRAM_BOT_TOKEN=your_token_from_botfather to .env and run this script again.")
    process.exit(1)
  }

  const me = await getTelegramMe()
  if (!me) {
    console.error("❌ Failed to connect to Telegram. Check TELEGRAM_BOT_TOKEN.")
    process.exit(1)
  }

  console.log(`🤖 Connected as @${me.username || me.first_name} (ID: ${me.id})`)
  console.log("Clearing any registered webhook to enable long-polling mode...")
  await deleteTelegramWebhook()

  console.log("🟢 Listening for Telegram messages via long-polling (Press Ctrl+C to stop)...")

  let offset = 0
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
          }

          console.log(`[Telegram Update #${updateId}] Received! Processing immediately...`)
          // Process in background so subsequent updates are not blocked
          processTelegramUpdate(update as any).then(() => {
            console.log(`[Telegram Update #${updateId}] Completed successfully.`)
          }).catch((err) => {
            console.error(`Error processing Telegram update #${updateId}:`, err)
          })
        }
      }
    } catch (error) {
      console.error("Error during Telegram polling tick:", error)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

main().catch(console.error)
