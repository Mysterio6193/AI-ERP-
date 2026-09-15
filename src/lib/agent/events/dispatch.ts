import { db } from "@/lib/db"
import { deliverAgentOutput } from "@/lib/agent/delivery"
import { runAgentTurn } from "@/lib/agent/runtime"
import { resolveRunAs } from "@/lib/agent/scheduler"
import { currentAgentCause, withAgentCause } from "@/lib/agent/events/cause"
import {
  cooldownKeyFor,
  matchEvent,
  type DomainEvent,
  type EventFilter,
  type EventSubscription,
  type RecentRun,
} from "@/lib/agent/events/match"

/**
 * Waking agents when something happens in the business.
 *
 * Emitting is deliberately cheap and deliberately safe to call from anywhere:
 * an order is not going to fail to save because an agent could not be woken.
 * Everything here swallows its own failures and says so in the log.
 */

/** Recent history to consider for deduplication, rate limits and cooldowns. */
const HISTORY_WINDOW_MS = 3_600_000

/**
 * Event types the system knows how to raise.
 *
 * A list rather than free strings so the UI can offer them and a typo does
 * not silently create a subscription that can never fire. Adding one means
 * emitting it somewhere, which is the point.
 */
export const KNOWN_EVENT_TYPES = [
  "order.created",
  "order.dispatched",
  "order.cancelled",
  "stock.low",
  "lot.quarantined",
  "lot.expiring",
  "production.completed",
  "purchase.received",
  "invoice.overdue",
  "payment.received",
  "bin.overfilled",
  "rate.stale",
] as const

export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number]

function parseFilters(json: string | null): EventFilter[] {
  if (!json) return []

  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (row): row is EventFilter =>
        !!row && typeof row === "object" && typeof row.path === "string" && typeof row.operator === "string"
    )
  } catch {
    // A subscription with unreadable filters matches nothing rather than
    // everything. Matching everything on a corrupt rule is how an agent starts
    // running on every order in the business.
    return []
  }
}

async function loadSubscriptions(eventType: string): Promise<EventSubscription[]> {
  const rows = await db.agentEventSubscription.findMany({
    where: { eventType, enabled: true, agent: { enabled: true } },
    select: {
      id: true,
      agentId: true,
      enabled: true,
      filtersJson: true,
      companyId: true,
      maxPerHour: true,
      cooldownSeconds: true,
      cooldownKeyPath: true,
      eventType: true,
      agent: { select: { name: true, slug: true } },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    agentId: row.agentId,
    agentName: row.agent.name || row.agent.slug,
    eventType: row.eventType,
    enabled: row.enabled,
    filters: parseFilters(row.filtersJson),
    companyId: row.companyId,
    maxPerHour: row.maxPerHour,
    cooldownSeconds: row.cooldownSeconds,
    cooldownKeyPath: row.cooldownKeyPath,
  }))
}

async function loadRecent(subscriptionIds: string[], now: Date): Promise<RecentRun[]> {
  if (!subscriptionIds.length) return []

  const rows = await db.agentEventLog.findMany({
    where: {
      subscriptionId: { in: subscriptionIds },
      startedAt: { gt: new Date(now.getTime() - HISTORY_WINDOW_MS) },
    },
    select: { subscriptionId: true, eventId: true, cooldownKey: true, startedAt: true, ran: true },
    orderBy: { startedAt: "desc" },
    take: 2_000,
  })

  return (
    rows
      // Only runs count towards a rate limit or a cooldown. A refusal is
      // history, not activity — counting refusals would let one storm of
      // filtered-out events lock a subscription out for an hour.
      .filter((row) => row.ran)
      .map((row) => ({
        subscriptionId: row.subscriptionId,
        eventId: row.eventId,
        cooldownKey: row.cooldownKey,
        startedAt: row.startedAt,
      }))
  )
}

export interface DispatchOutcome {
  eventId: string
  eventType: string
  woke: Array<{ subscriptionId: string; agent: string; ok: boolean; error?: string }>
  skipped: Array<{ subscriptionId: string; agent: string; reason: string }>
}

/**
 * Raises an event and wakes whatever is waiting on it.
 *
 * Never throws. The caller is a business operation that has already happened —
 * an order that saved, stock that moved — and an agent that could not be woken
 * must not undo it.
 */
export async function emitDomainEvent(
  event: DomainEvent,
  options: { now?: Date } = {}
): Promise<DispatchOutcome> {
  const now = options.now ?? new Date()
  const outcome: DispatchOutcome = { eventId: event.id, eventType: event.type, woke: [], skipped: [] }

  // Attribution is taken from the ambient run rather than asked of the caller.
  // The call sites that raise events are ordinary business code several layers
  // down; making each one thread an agent id through is how the loop defence
  // ends up correct in one place and forgotten in six others.
  const cause = currentAgentCause()
  const attributed: DomainEvent = cause
    ? {
        ...event,
        causedByAgentId: event.causedByAgentId ?? cause.agentId,
        causedByDepth: event.causedByDepth ?? cause.depth + 1,
      }
    : event

  try {
    const subscriptions = await loadSubscriptions(attributed.type)
    if (!subscriptions.length) return outcome

    const recent = await loadRecent(
      subscriptions.map((subscription) => subscription.id),
      now
    )
    const decisions = matchEvent(attributed, subscriptions, recent, now)

    for (const decision of decisions) {
      const { subscription } = decision
      const cooldownKey = cooldownKeyFor(attributed, subscription)

      if (!decision.run) {
        outcome.skipped.push({
          subscriptionId: subscription.id,
          agent: subscription.agentName,
          reason: decision.reason,
        })

        // Refusals are recorded too: "why did my agent not run" is otherwise
        // unanswerable, and an event system nobody can debug gets turned off.
        await recordLog(subscription.id, attributed, cooldownKey, false, decision.reason, null)
        continue
      }

      // Claim before running. Two ticks racing on the same event both match;
      // the unique index on (subscription, event) means only one write wins,
      // and the loser stops here rather than starting a second run that books
      // stock or emails a customer again.
      const claimed = await recordLog(subscription.id, attributed, cooldownKey, true, null, null)

      if (!claimed) {
        outcome.skipped.push({
          subscriptionId: subscription.id,
          agent: subscription.agentName,
          reason: "Claimed by another dispatch",
        })
        continue
      }

      const result = await runForSubscription(subscription, attributed, claimed)

      outcome.woke.push({
        subscriptionId: subscription.id,
        agent: subscription.agentName,
        ok: result.ok,
        error: result.ok ? undefined : result.error,
      })
    }
  } catch (error) {
    // Logged, not thrown: see the note on the function.
    console.error(`Event dispatch failed for ${event.type}:`, error)
  }

  return outcome
}

/** Writes the log row, returning its id, or null if this event was already claimed. */
async function recordLog(
  subscriptionId: string,
  event: DomainEvent,
  cooldownKey: string | null,
  ran: boolean,
  reason: string | null,
  runId: string | null
): Promise<string | null> {
  try {
    const row = await db.agentEventLog.create({
      data: {
        subscriptionId,
        eventId: event.id,
        eventType: event.type,
        cooldownKey,
        ran,
        reason,
        runId,
      },
      select: { id: true },
    })

    return row.id
  } catch {
    // Unique violation on (subscriptionId, eventId): someone got here first.
    return null
  }
}

/** What the agent is told about the event. */
function describeEvent(event: DomainEvent, prompt: string | null) {
  const body = JSON.stringify(event.payload, null, 2)

  return [
    prompt?.trim() || `A ${event.type} event happened. Decide what to do about it.`,
    "",
    `Event: ${event.type}`,
    `When: ${event.occurredAt.toISOString()}`,
    "Details:",
    body.length > 4_000 ? `${body.slice(0, 4_000)}\n… (truncated)` : body,
  ].join("\n")
}

async function runForSubscription(
  subscription: EventSubscription,
  event: DomainEvent,
  logId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const definition = await db.agentDefinition.findUnique({
    where: { id: subscription.agentId },
    select: {
      id: true,
      slug: true,
      name: true,
      runAsUserId: true,
      createdById: true,
      deliverToGroupId: true,
      runPrompt: true,
      eventSubscriptions: { where: { id: subscription.id }, select: { prompt: true } },
    },
  })

  if (!definition) {
    await db.agentEventLog.update({
      where: { id: logId },
      data: { ran: false, reason: "Agent no longer exists" },
    })
    return { ok: false, error: "Agent no longer exists" }
  }

  const principal = await resolveRunAs(definition)

  if (!principal) {
    const reason = "No staff user available to run as"
    await db.agentEventLog.update({ where: { id: logId }, data: { ran: false, reason } })
    return { ok: false, error: reason }
  }

  const prompt = definition.eventSubscriptions[0]?.prompt ?? definition.runPrompt ?? null

  try {
    const turn = await withAgentCause(
      { agentId: definition.id, depth: event.causedByDepth ?? 0 },
      () =>
        runAgentTurn({
      principal,
      channel: "event",
      // One thread per subscription, so an agent woken by the same rule keeps
      // its history instead of starting cold every time.
      threadKey: `event:${subscription.id}`,
      userMessage: describeEvent(event, prompt),
      trigger: "event",
      agentSlug: definition.slug,
        })
    )

    await deliverAgentOutput({
      userId: definition.runAsUserId,
      groupId: definition.deliverToGroupId,
      text: turn.text,
      approvals: turn.pendingApprovals.map((approval) => ({
        proposalId: approval.proposalId,
        summary: approval.summary,
        reason: approval.reason,
      })),
      subject: `${definition.name || definition.slug}: ${event.type}`,
    }).catch((error) => {
      console.error("Event delivery failed:", error)
      return { delivered: false, channel: null, reason: "Delivery threw" }
    })

    await db.agentEventLog.update({
      where: { id: logId },
      data: { runId: turn.runId ?? null, reason: null },
    })

    await db.agentDefinition.update({
      where: { id: definition.id },
      data: { lastRunAt: new Date(), lastRunStatus: "succeeded", lastRunError: null, runCount: { increment: 1 } },
    })

    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run failed"

    await db.agentEventLog.update({ where: { id: logId }, data: { ran: false, reason: message } })
    await db.agentDefinition.update({
      where: { id: definition.id },
      data: { lastRunStatus: "failed", lastRunError: message },
    })

    return { ok: false, error: message }
  }
}

/** Builds an event id that is stable for one real occurrence. */
export function eventId(type: string, subjectId: string, discriminator?: string | number) {
  return [type, subjectId, discriminator].filter((part) => part !== undefined).join(":")
}
