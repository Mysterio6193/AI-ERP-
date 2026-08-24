import { db } from "@/lib/db"

/**
 * Noticing when a tool stops working.
 *
 * Nothing recorded whether a tool succeeded, so a tool broken by a renamed
 * column or a changed API looked exactly like a tool nobody had used. Several
 * were found by hand in this codebase: a web search that returned "no results"
 * for every query because its parser stopped matching, spreadsheet exports
 * querying fields that do not exist, a notification tool reading a void return
 * as a boolean. Each looked fine from the outside.
 *
 * This is deliberately observation only. It records what happened and surfaces
 * it to a person; it does not attempt to repair anything on its own, because a
 * system that rewrites itself in response to an error it does not understand
 * turns a broken tool into a broken business.
 */

/** Consecutive failures before a tool is called broken rather than unlucky. */
export const BROKEN_THRESHOLD = 3

export interface ToolOutcome {
  toolName: string
  ok: boolean
  error?: string
}

/**
 * Record one tool call.
 *
 * Never throws and never blocks the tool it is watching: telemetry that can
 * break the thing it measures is worse than no telemetry.
 */
export async function recordToolOutcome(outcome: ToolOutcome): Promise<void> {
  try {
    const now = new Date()

    if (outcome.ok) {
      await db.toolHealth.upsert({
        where: { toolName: outcome.toolName },
        create: { toolName: outcome.toolName, successCount: 1, lastSucceededAt: now },
        update: {
          successCount: { increment: 1 },
          // A single success clears the streak: that is what separates a tool
          // that is broken from one that had a bad minute.
          consecutiveFailures: 0,
          lastSucceededAt: now,
          acknowledgedAt: null,
        },
      })
      return
    }

    const message = (outcome.error || "Unknown error").slice(0, 500)

    await db.toolHealth.upsert({
      where: { toolName: outcome.toolName },
      create: {
        toolName: outcome.toolName,
        failureCount: 1,
        consecutiveFailures: 1,
        lastError: message,
        lastFailedAt: now,
      },
      update: {
        failureCount: { increment: 1 },
        consecutiveFailures: { increment: 1 },
        lastError: message,
        lastFailedAt: now,
      },
    })
  } catch (error) {
    console.error(`Could not record tool health for ${outcome.toolName}:`, error)
  }
}

export interface BrokenTool {
  toolName: string
  consecutiveFailures: number
  failureCount: number
  successCount: number
  lastError: string | null
  lastFailedAt: Date | null
  /** True when it has never once worked, which usually means it never could. */
  neverWorked: boolean
}

/**
 * Tools that look broken rather than merely unlucky.
 *
 * A tool that has never succeeded is reported however few times it has been
 * tried: one failure out of one attempt is not noise when the count is zero
 * the other way.
 */
export async function brokenTools(threshold = BROKEN_THRESHOLD): Promise<BrokenTool[]> {
  const rows = await db.toolHealth.findMany({
    where: {
      acknowledgedAt: null,
      OR: [
        { consecutiveFailures: { gte: threshold } },
        { AND: [{ successCount: 0 }, { failureCount: { gte: 1 } }] },
      ],
    },
    orderBy: [{ consecutiveFailures: "desc" }, { failureCount: "desc" }],
  })

  return rows.map((row) => ({
    toolName: row.toolName,
    consecutiveFailures: row.consecutiveFailures,
    failureCount: row.failureCount,
    successCount: row.successCount,
    lastError: row.lastError,
    lastFailedAt: row.lastFailedAt,
    neverWorked: row.successCount === 0,
  }))
}

/** Stop reporting a fault someone already knows about. */
export async function acknowledgeTool(toolName: string) {
  await db.toolHealth.updateMany({
    where: { toolName },
    data: { acknowledgedAt: new Date() },
  })
}

export interface HealthSummary {
  tracked: number
  broken: number
  neverWorked: number
  totalCalls: number
  failureRate: number
}

export async function healthSummary(): Promise<HealthSummary> {
  const rows = await db.toolHealth.findMany({
    select: { successCount: true, failureCount: true, consecutiveFailures: true },
  })

  const totalCalls = rows.reduce((n, r) => n + r.successCount + r.failureCount, 0)
  const failures = rows.reduce((n, r) => n + r.failureCount, 0)

  return {
    tracked: rows.length,
    broken: rows.filter((r) => r.consecutiveFailures >= BROKEN_THRESHOLD).length,
    neverWorked: rows.filter((r) => r.successCount === 0 && r.failureCount > 0).length,
    totalCalls,
    failureRate: totalCalls === 0 ? 0 : Number(((failures / totalCalls) * 100).toFixed(1)),
  }
}

/**
 * What a person should be told, in words.
 *
 * A tool that has never worked is a different message from one that used to:
 * the first was probably never wired up correctly, the second broke, and those
 * lead somewhere different.
 */
export function describeBroken(tools: BrokenTool[]): string {
  if (tools.length === 0) return "Every tool that has been used is working."

  const lines = tools.map((tool) => {
    const history = tool.neverWorked
      ? `has never succeeded in ${tool.failureCount} attempt${tool.failureCount === 1 ? "" : "s"} — it may never have worked`
      : `failed the last ${tool.consecutiveFailures} times after ${tool.successCount} successful call${tool.successCount === 1 ? "" : "s"}`

    return `• ${tool.toolName} ${history}. Last error: ${tool.lastError ?? "unknown"}`
  })

  return `${tools.length} tool${tools.length === 1 ? " looks" : "s look"} broken:\n${lines.join("\n")}`
}
