import { db } from "@/lib/db"
import type { UserRole } from "@/lib/types"

import type { AgentPrincipal } from "./context"

/**
 * Authorisation and auto-act thresholds.
 *
 * Two gates sit in front of every tool:
 *   1. Scope   - can this principal touch this tool at all (role, or customer isolation)
 *   2. Value   - is the money involved small enough for the agent to act alone
 *
 * Below threshold the agent executes and writes an audit record. Above it, the
 * SDK pauses the run with a tool-approval-request that a human answers - in the
 * app, or from the Approve/Reject buttons on a Telegram card.
 */

export type ToolRisk = "read" | "low" | "medium" | "high"

export interface ToolPolicyMeta {
  risk: ToolRisk
  /** Roles allowed to invoke it. Omitted means every staff role. */
  roles?: UserRole[]
  /** Field in the tool input carrying the monetary value to threshold against. */
  valueField?: string
  /** Never auto-act, regardless of value. */
  alwaysApprove?: boolean
}

export interface AgentThresholds {
  maxOrderValue: number
  maxPurchaseOrderValue: number
  maxPaymentValue: number
  maxDiscountPercent: number
  maxInventoryAdjustment: number
  allowOutboundMessages: boolean
  readOnly: boolean
}

export const DEFAULT_THRESHOLDS: AgentThresholds = {
  maxOrderValue: 500,
  maxPurchaseOrderValue: 1000,
  maxPaymentValue: 0,
  maxDiscountPercent: 5,
  maxInventoryAdjustment: 50,
  allowOutboundMessages: false,
  readOnly: false,
}

const SETTING_KEY = "agent.thresholds"

export async function getThresholds(): Promise<AgentThresholds> {
  try {
    const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } })
    if (!setting) {
      return DEFAULT_THRESHOLDS
    }

    return { ...DEFAULT_THRESHOLDS, ...(JSON.parse(setting.value) as Partial<AgentThresholds>) }
  } catch {
    return DEFAULT_THRESHOLDS
  }
}

export async function saveThresholds(patch: Partial<AgentThresholds>) {
  const next = { ...(await getThresholds()), ...patch }

  await db.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(next), category: "agent" },
    update: { value: JSON.stringify(next) },
  })

  return next
}

/** Thresholds a tool's value is compared against, by tool name. */
function thresholdFor(toolName: string, thresholds: AgentThresholds) {
  switch (toolName) {
    case "createSalesOrder":
      return thresholds.maxOrderValue
    case "createPurchaseOrder":
      return thresholds.maxPurchaseOrderValue
    case "recordPayment":
      return thresholds.maxPaymentValue
    case "adjustInventory":
      return thresholds.maxInventoryAdjustment
    default:
      return 0
  }
}

export type PolicyDecision =
  | { type: "allow" }
  | { type: "approve"; reason: string }
  | { type: "deny"; reason: string }

export function decide(input: {
  toolName: string
  meta: ToolPolicyMeta | undefined
  value: number | undefined
  principal: AgentPrincipal
  thresholds: AgentThresholds
}): PolicyDecision {
  const { toolName, meta, value, principal, thresholds } = input

  if (!meta) {
    return { type: "deny", reason: `Unknown tool ${toolName}` }
  }

  if (meta.risk === "read") {
    return { type: "allow" }
  }

  if (thresholds.readOnly) {
    return { type: "deny", reason: "The agent is in read-only mode. Ask a human to make this change." }
  }

  if (principal.kind === "staff" && meta.roles && !meta.roles.includes(principal.role)) {
    return {
      type: "deny",
      reason: `${principal.role} is not permitted to run ${toolName}.`,
    }
  }

  if (meta.alwaysApprove) {
    return { type: "approve", reason: "This action always needs a human decision." }
  }

  if (meta.risk === "high") {
    return { type: "approve", reason: "High-risk action." }
  }

  const limit = thresholdFor(toolName, thresholds)
  if (meta.valueField && typeof value === "number") {
    if (value > limit) {
      return {
        type: "approve",
        reason: `$${value.toFixed(2)} is over the $${limit.toFixed(2)} auto-approval limit.`,
      }
    }

    return { type: "allow" }
  }

  // Writes with no monetary dimension: low risk runs, medium asks.
  return meta.risk === "low" ? { type: "allow" } : { type: "approve", reason: "Needs confirmation." }
}
