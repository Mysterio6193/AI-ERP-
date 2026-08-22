import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import {
  getTelegramWebhookInfo,
  isTelegramConfigured,
  registerTelegramWebhook,
} from "@/lib/agent/channels/telegram"
import { db } from "@/lib/db"

/**
 * Telegram connection status and webhook registration.
 *
 * Telegram will only deliver updates to a public HTTPS URL, so this reports
 * plainly whether the bot is configured, whether a webhook is registered, and
 * what Telegram last reported about delivery - the three things that explain
 * every "why isn't the bot replying" question.
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if (auth.response) {
    return auth.response
  }

  const configured = isTelegramConfigured()
  const webhook = configured ? await getTelegramWebhookInfo() : null

  const identities = await db.channelIdentity.findMany({
    where: { channel: "telegram", status: "active" },
    orderBy: { verifiedAt: "desc" },
    select: {
      id: true,
      externalId: true,
      displayName: true,
      verifiedAt: true,
      userId: true,
      customerId: true,
    },
  })

  const userIds = identities.map((identity) => identity.userId).filter(Boolean) as string[]
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : []
  const userById = new Map(users.map((user) => [user.id, user]))

  const pending = await db.channelIdentity.count({
    where: { channel: "telegram", status: "pending" },
  })

  return NextResponse.json({
    success: true,
    data: {
      configured,
      hasWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      webhook: webhook
        ? {
            url: webhook.url || null,
            pendingUpdateCount: webhook.pending_update_count ?? 0,
            lastErrorMessage: webhook.last_error_message ?? null,
            lastErrorDate: webhook.last_error_date ?? null,
          }
        : null,
      pendingLinks: pending,
      connections: identities.map((identity) => ({
        id: identity.id,
        chatId: identity.externalId,
        displayName: identity.displayName,
        verifiedAt: identity.verifiedAt,
        user: identity.userId ? userById.get(identity.userId) ?? null : null,
        isCustomer: Boolean(identity.customerId),
      })),
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { success: false, error: "TELEGRAM_BOT_TOKEN is not set. Add it to .env and restart." },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const url = String(body.url || "").trim()

  if (!url.startsWith("https://")) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Telegram only delivers to a public HTTPS URL. Use your deployed domain, or an ngrok tunnel while developing.",
      },
      { status: 400 }
    )
  }

  const registered = await registerTelegramWebhook(`${url.replace(/\/$/, "")}/api/agent/telegram`)

  if (!registered) {
    return NextResponse.json(
      { success: false, error: "Telegram rejected the webhook. Check the URL is reachable over HTTPS." },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true, data: await getTelegramWebhookInfo() })
}
