/**
 * Saying what a proposed action would actually do.
 *
 * Seven tools had a written summary and everything else fell through to
 * `Run ${toolName}`. With well over a hundred tools that means most proposals
 * arrive as "Run agentHandoff" — a request to approve something the reader
 * cannot see. Approving blind is worse than not approving at all, and one such
 * proposal sat pending here for twenty-three hours.
 *
 * The fallback below renders the arguments, because the arguments are the
 * decision: "Hand off to sales" is a different request from "Hand off to
 * accounts", and the tool name alone cannot tell them apart.
 */

/** camelCase and snake_case to something a person reads. */
export function humaniseToolName(toolName: string): string {
  const spaced = toolName
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()

  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

/** Arguments that describe plumbing rather than intent. */
const NOISE = new Set(["id", "companyId", "userId", "threadId", "runId", "idempotencyKey", "dryRun"])

/** Long free text is context for the agent, not a label for a person. */
const MAX_VALUE = 60

function renderValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null

  if (typeof value === "boolean") return value ? "yes" : "no"

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.length > MAX_VALUE ? `${trimmed.slice(0, MAX_VALUE - 1)}…` : trimmed
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? null : `${value.length} item${value.length === 1 ? "" : "s"}`
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as object)
    return keys.length === 0 ? null : `${keys.length} field${keys.length === 1 ? "" : "s"}`
  }

  return null
}

/**
 * A readable line for any tool, built from its arguments.
 *
 * Ordered as given rather than alphabetically: a tool's first argument is
 * usually its subject, and reordering buries it.
 */
export function describeGenericProposal(
  toolName: string,
  args: Record<string, unknown>,
  maxArgs = 3
): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(args)) {
    if (NOISE.has(key)) continue

    const rendered = renderValue(value)
    if (rendered === null) continue

    parts.push(`${humaniseToolName(key).toLowerCase()}: ${rendered}`)
    if (parts.length >= maxArgs) break
  }

  const action = humaniseToolName(toolName)

  return parts.length === 0 ? action : `${action} — ${parts.join(", ")}`
}

/** How long a decision can sit before it has effectively been forgotten. */
export const STALE_AFTER_HOURS = 12

export interface StaleProposal {
  id: string
  toolName: string
  summary: string
  hoursWaiting: number
  requestedBy: string | null
}

/**
 * A proposal nobody answered is not a decision, it is a stall.
 *
 * The agent stopped and asked, and if nothing tells anyone, the work simply
 * never happens — which looks from the outside like the agent ignoring the
 * request it was given.
 */
export function describeStale(proposals: StaleProposal[]): string {
  if (proposals.length === 0) return "Nothing is waiting for a decision."

  const lines = proposals.map(
    (p) => `• ${p.summary} — waiting ${p.hoursWaiting}h${p.requestedBy ? ` (asked by ${p.requestedBy})` : ""}`
  )

  return `${proposals.length} action${proposals.length === 1 ? " has" : "s have"} been waiting for approval:\n${lines.join("\n")}`
}
