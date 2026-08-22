import { db } from "@/lib/db"

import { notifyStaff, resolveAlertRecipients, wasRecentlySent } from "./notify"
import { collectSignals, DEFAULT_THRESHOLDS, type Signal, type SignalThresholds } from "./signals"

/**
 * The always-on loop.
 *
 * Runs on the scheduler tick, looks at the business, and reaches out only when
 * something crosses a line. On an ordinary day it sends nothing and that is the
 * success case - the value of an agent that watches continuously is entirely
 * destroyed by one that also talks continuously.
 *
 * A pending approval is pushed with its Approve / Reject buttons attached, so
 * the whole loop - notice, decide, act - happens without opening the app.
 */

const SETTING_KEY = "agent.heartbeat"

export interface HeartbeatConfig extends SignalThresholds {
  enabled: boolean
  /** Most alerts to send in one tick, so a backlog cannot become a flood. */
  maxPerTick: number
  /** Roles that receive operational alerts. */
  roles: string[]
}

export const DEFAULT_CONFIG: HeartbeatConfig = {
  ...DEFAULT_THRESHOLDS,
  enabled: true,
  maxPerTick: 3,
  roles: ["admin"],
}

export async function getHeartbeatConfig(): Promise<HeartbeatConfig> {
  try {
    const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } })
    if (!setting) {
      return DEFAULT_CONFIG
    }

    return { ...DEFAULT_CONFIG, ...(JSON.parse(setting.value) as Partial<HeartbeatConfig>) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveHeartbeatConfig(patch: Partial<HeartbeatConfig>) {
  const next = { ...(await getHeartbeatConfig()), ...patch }

  await db.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(next), category: "agent" },
    update: { value: JSON.stringify(next) },
  })

  return next
}

/** Pending approvals travel with their decision buttons. */
function buttonsFor(signal: Signal) {
  if (signal.kind !== "pending_approval" || !signal.entityId) {
    return undefined
  }

  return [
    [
      { text: "✅ Approve", callbackData: `approve:${signal.entityId}` },
      { text: "❌ Reject", callbackData: `reject:${signal.entityId}` },
    ],
  ]
}

export interface HeartbeatResult {
  enabled: boolean
  signalsFound: number
  sent: Array<{ kind: string; title: string; to: string }>
  suppressed: Array<{ kind: string; reason: string }>
  recipients: number
}

export async function heartbeat(options?: { dryRun?: boolean }): Promise<HeartbeatResult> {
  const config = await getHeartbeatConfig()

  const result: HeartbeatResult = {
    enabled: config.enabled,
    signalsFound: 0,
    sent: [],
    suppressed: [],
    recipients: 0,
  }

  if (!config.enabled) {
    return result
  }

  const signals = await collectSignals(config)
  result.signalsFound = signals.length

  if (!signals.length) {
    return result
  }

  const recipients = await resolveAlertRecipients(config.roles)
  result.recipients = recipients.length

  if (!recipients.length) {
    result.suppressed.push({
      kind: "all",
      reason: "Nobody has linked a messaging account, so there is nowhere to send",
    })
    return result
  }

  let sentThisTick = 0

  for (const signal of signals) {
    if (sentThisTick >= config.maxPerTick) {
      result.suppressed.push({ kind: signal.kind, reason: "Over per-tick limit" })
      continue
    }

    // Checked once here rather than per recipient, so a signal is not partially
    // delivered and then considered "sent".
    if (await wasRecentlySent(signal.dedupeKey, signal.cooldownHours ?? 24)) {
      result.suppressed.push({ kind: signal.kind, reason: "Within cooldown" })
      continue
    }

    if (options?.dryRun) {
      result.sent.push({ kind: signal.kind, title: signal.title, to: "(dry run)" })
      sentThisTick += 1
      continue
    }

    let deliveredToAnyone = false

    for (const recipient of recipients) {
      const outcome = await notifyStaff({
        userId: recipient.id,
        // Per-recipient key, so two admins each get it once.
        dedupeKey: `${signal.dedupeKey}:${recipient.id}`,
        kind: signal.kind,
        severity: signal.severity,
        title: signal.title,
        body: signal.body,
        entityType: signal.entityType,
        entityId: signal.entityId,
        buttons: buttonsFor(signal),
        cooldownHours: signal.cooldownHours,
      })

      if (outcome.ok) {
        deliveredToAnyone = true
        result.sent.push({ kind: signal.kind, title: signal.title, to: recipient.name })
      } else {
        // Skips are reported too. "0 sent, no reason given" is indistinguishable
        // from a broken deployment, and the usual cause - no bot token, nobody
        // linked - is invisible unless it is said out loud.
        result.suppressed.push({
          kind: signal.kind,
          reason: `${recipient.name}: ${outcome.reason}`,
        })
      }
    }

    if (deliveredToAnyone) {
      sentThisTick += 1
    }
  }

  return result
}
