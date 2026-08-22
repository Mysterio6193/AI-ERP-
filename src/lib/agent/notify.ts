import { db } from "@/lib/db"

import {
  isTelegramConfigured,
  sendTelegramMessage,
  type TelegramButton,
} from "./channels/telegram"

/**
 * Outbound: the agent reaching a person who did not ask.
 *
 * Every existing path is request-response - a human speaks first. This is the
 * other direction, and it is what separates an assistant you have to remember
 * to consult from one that runs alongside the business.
 *
 * Two rules make it tolerable rather than annoying:
 *
 *   1. Silence is the default. Nothing is sent unless a signal crosses a
 *      threshold somebody set.
 *   2. The same thing is never said twice inside its cooldown. A stable
 *      `dedupeKey` per underlying fact, not per occurrence, is what makes that
 *      work across ticks.
 */

export interface NotifyInput {
  userId: string
  dedupeKey: string
  kind: string
  severity?: "info" | "warn" | "urgent"
  title: string
  body: string
  entityType?: string
  entityId?: string
  buttons?: TelegramButton[][]
  /** Hours before this dedupeKey may fire again. Default 24. */
  cooldownHours?: number
}

const SEVERITY_PREFIX: Record<string, string> = {
  info: "",
  warn: "⚠️ ",
  urgent: "🚨 ",
}

/** Has this exact thing already been raised recently? */
export async function wasRecentlySent(dedupeKey: string, cooldownHours = 24) {
  const since = new Date(Date.now() - cooldownHours * 3600_000)

  const existing = await db.agentNotification.findFirst({
    where: { dedupeKey, sentAt: { gte: since }, status: "sent" },
    select: { id: true },
  })

  return Boolean(existing)
}

/** The staff member's linked messaging identity, if they have verified one. */
async function resolveChannel(userId: string) {
  return db.channelIdentity.findFirst({
    where: { userId, status: "active", verifiedAt: { not: null } },
    orderBy: { verifiedAt: "desc" },
    select: { channel: true, externalId: true },
  })
}

export type NotifyResult =
  | { ok: true; skipped?: false; notificationId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string }

export async function notifyStaff(input: NotifyInput): Promise<NotifyResult> {
  const cooldown = input.cooldownHours ?? 24

  if (await wasRecentlySent(input.dedupeKey, cooldown)) {
    return { ok: false, skipped: true, reason: "Already raised within cooldown" }
  }

  const identity = await resolveChannel(input.userId)

  if (!identity) {
    return { ok: false, skipped: true, reason: "No linked messaging account" }
  }

  if (identity.channel !== "telegram" || !isTelegramConfigured()) {
    return { ok: false, skipped: true, reason: `Channel ${identity.channel} not available` }
  }

  const prefix = SEVERITY_PREFIX[input.severity || "info"] || ""
  const text = `${prefix}${input.title}\n\n${input.body}`

  // Record before sending. A duplicate is a far smaller problem than a silent
  // failure, and writing first means a crash mid-send cannot cause a repeat
  // storm on the next tick.
  const notification = await db.agentNotification.create({
    data: {
      dedupeKey: input.dedupeKey,
      userId: input.userId,
      channel: identity.channel,
      kind: input.kind,
      severity: input.severity || "info",
      title: input.title,
      body: input.body,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      status: "sent",
    },
    select: { id: true },
  })

  try {
    await sendTelegramMessage(identity.externalId, text, input.buttons)
    return { ok: true, notificationId: notification.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed"

    await db.agentNotification.update({
      where: { id: notification.id },
      data: { status: "failed", error: message },
    })

    return { ok: false, reason: message }
  }
}

/**
 * Who receives operational alerts.
 *
 * Falls back to admins when nobody has been designated, so alerts land
 * somewhere rather than nowhere.
 */
export async function resolveAlertRecipients(roles: string[] = ["admin"]) {
  const identities = await db.channelIdentity.findMany({
    where: { status: "active", verifiedAt: { not: null }, userId: { not: null } },
    select: { userId: true },
  })

  const linkedIds = [...new Set(identities.map((row) => row.userId as string))]

  if (!linkedIds.length) {
    return []
  }

  const users = await db.user.findMany({
    where: { id: { in: linkedIds }, status: "active", role: { in: roles } },
    select: { id: true, name: true, role: true },
  })

  return users
}
