import { nextRun, validateCron } from "@/lib/cron"
import { db } from "@/lib/db"

import { resolveStaffPrincipal } from "./context"
import { heartbeat, type HeartbeatResult } from "./heartbeat"
import { runAgentTurn } from "./runtime"
import { summariseBacklog } from "./summarise"
import { deliverAgentOutput } from "@/lib/agent/delivery"

/**
 * Scheduled agent runs.
 *
 * A tick asks "what is due", claims each one, and runs it. Claiming means
 * writing `nextRunAt` forward *before* the agent starts, guarded by the value
 * we read - so if two ticks overlap (a slow run, a retried cron delivery) only
 * one of them wins the row and the agent does not execute twice.
 *
 * A scheduled run is an ordinary turn. It acts as a real staff user, so role
 * limits and approval thresholds apply exactly as they would in chat: anything
 * over the line becomes an AgentProposal for a human rather than happening
 * unattended.
 */

/**
 * Provider SDKs colour their error messages, and those escape codes render as
 * literal garbage once the text reaches a browser.
 */
function plainText(message: string) {
  return message.replace(/ \[[0-9;]*m/g, "").trim()
}

export interface TickResult {
  checked: number
  ran: Array<{ slug: string; ok: boolean; text?: string; error?: string; pending: number }>
  skipped: Array<{ slug: string; reason: string }>
  /** Proactive alerts raised on this tick, if the heartbeat is enabled. */
  heartbeat?: HeartbeatResult
  /** Conversations summarised on this tick, keeping the archive searchable. */
  summarised?: {
    summarised: string[]
    failed: Array<{ threadId: string; error: string }>
    pending: number
  }
}

/** Recomputes when a definition should next fire. */
export async function recomputeNextRun(definitionId: string, from: Date = new Date()) {
  const definition = await db.agentDefinition.findUnique({
    where: { id: definitionId },
    select: { schedule: true, trigger: true, enabled: true },
  })

  if (!definition?.schedule || definition.trigger !== "schedule" || !definition.enabled) {
    await db.agentDefinition.update({
      where: { id: definitionId },
      data: { nextRunAt: null },
    })
    return null
  }

  const next = nextRun(definition.schedule, from)

  await db.agentDefinition.update({
    where: { id: definitionId },
    data: { nextRunAt: next },
  })

  return next
}

/** The staff identity an unattended run acts as. */
async function resolveRunAs(definition: { runAsUserId: string | null; createdById: string | null }) {
  const candidates = [definition.runAsUserId, definition.createdById].filter(Boolean) as string[]

  for (const userId of candidates) {
    const principal = await resolveStaffPrincipal(userId)
    if (principal) {
      return principal
    }
  }

  // Fall back to an admin so a schedule created before the field existed still
  // runs, rather than failing silently forever.
  const admin = await db.user.findFirst({
    where: { role: "admin", status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })

  return admin ? resolveStaffPrincipal(admin.id) : null
}

export async function runScheduledAgent(definitionId: string) {
  const definition = await db.agentDefinition.findUnique({ where: { id: definitionId } })

  if (!definition) {
    return { ok: false as const, error: "Agent not found" }
  }

  const prompt = (definition.runPrompt || "").trim()
  if (!prompt) {
    return { ok: false as const, error: "No run prompt set - a scheduled agent needs something to do" }
  }

  const principal = await resolveRunAs(definition)
  if (!principal) {
    return { ok: false as const, error: "No staff user available to run as" }
  }

  try {
    const turn = await runAgentTurn({
      principal,
      channel: "schedule",
      // A stable thread key per agent, so a daily agent keeps its own history
      // instead of starting cold every morning.
      threadKey: `schedule:${definition.slug}`,
      userMessage: prompt,
      trigger: "cron",
      agentSlug: definition.slug,
    })

    // The run produced text and delivered it nowhere: the reply went into the
    // cron endpoint's JSON response, which nothing reads. A briefing that runs
    // every morning and reaches no one may as well not run.
    const delivery = await deliverAgentOutput({
      userId: definition.runAsUserId,
      groupId: definition.deliverToGroupId,
      text: turn.text,
      // The run counted these and delivered none of them, so a proposal sat in
      // the table with nothing pointing at it.
      approvals: turn.pendingApprovals.map((a) => ({
        proposalId: a.proposalId,
        summary: a.summary,
        reason: a.reason,
      })),
      subject: `${definition.name || definition.slug} report`,
    }).catch((error) => {
      console.error("Scheduled delivery failed:", error)
      return { delivered: false, channel: null, reason: "Delivery threw" }
    })

    await db.agentDefinition.update({
      where: { id: definition.id },
      data: { lastRunStatus: "succeeded", lastRunError: null },
    })

    return {
      ok: true as const,
      text: turn.text,
      delivery,
      pending: turn.pendingApprovals.length,
      threadId: turn.threadId,
    }
  } catch (error) {
    const message = plainText(error instanceof Error ? error.message : "Run failed")

    await db.agentDefinition.update({
      where: { id: definition.id },
      data: { lastRunStatus: "failed", lastRunError: message },
    })

    return { ok: false as const, error: message }
  }
}

/**
 * Runs everything currently due.
 *
 * Safe to call more often than the finest schedule - due-ness is decided by
 * `nextRunAt`, not by when the tick happened to arrive.
 */
export async function tick(now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = { checked: 0, ran: [], skipped: [] }

  const candidates = await db.agentDefinition.findMany({
    where: {
      enabled: true,
      trigger: "schedule",
      schedule: { not: null },
    },
  })

  result.checked = candidates.length

  for (const definition of candidates) {
    const check = validateCron(definition.schedule as string)

    if (!check.ok) {
      result.skipped.push({ slug: definition.slug, reason: check.error || "Invalid schedule" })

      await db.agentDefinition.update({
        where: { id: definition.id },
        data: { lastRunStatus: "failed", lastRunError: check.error, nextRunAt: null },
      })

      continue
    }

    // First sighting: set the next fire time and wait for it rather than
    // running immediately, so adding a schedule never causes a surprise run.
    if (!definition.nextRunAt) {
      await db.agentDefinition.update({
        where: { id: definition.id },
        data: { nextRunAt: nextRun(definition.schedule as string, now) },
      })

      result.skipped.push({ slug: definition.slug, reason: "Scheduled - first run pending" })
      continue
    }

    if (definition.nextRunAt > now) {
      continue
    }

    // Claim it. The `nextRunAt` guard means a concurrent tick that read the
    // same row updates zero rows and moves on.
    const claim = await db.agentDefinition.updateMany({
      where: { id: definition.id, nextRunAt: definition.nextRunAt },
      data: {
        nextRunAt: nextRun(definition.schedule as string, now),
        lastRunAt: now,
        runCount: { increment: 1 },
      },
    })

    if (claim.count === 0) {
      result.skipped.push({ slug: definition.slug, reason: "Claimed by another tick" })
      continue
    }

    const run = await runScheduledAgent(definition.id)

    result.ran.push({
      slug: definition.slug,
      ok: run.ok,
      text: run.ok ? run.text : undefined,
      error: run.ok ? undefined : run.error,
      pending: run.ok ? run.pending : 0,
    })
  }

  // The watch loop shares the tick. It is isolated because a failure to look at
  // the business should never stop scheduled agents from running.
  try {
    result.heartbeat = await heartbeat()
  } catch (error) {
    console.error("Heartbeat failed:", error)
  }

  // Keep the archive searchable without anyone remembering to do it. A small
  // batch per tick, and isolated for the same reason as the heartbeat.
  try {
    result.summarised = await summariseBacklog(3)
  } catch (error) {
    console.error("Summarising failed:", error)
  }

  return result
}
