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

/**
 * Upper bounds on what a human can grant.
 *
 * Not a security boundary against the agent — the agent cannot reach this
 * setting at all, and the tool that will eventually let it propose settings
 * changes hard-rejects the `agent.` namespace. These bounds exist so a
 * mistyped limit cannot quietly hand over unlimited autonomy: typing an extra
 * zero should not be the difference between a $50,000 ceiling and none.
 */
export const THRESHOLD_LIMITS = {
  maxOrderValue: 1_000_000,
  maxPurchaseOrderValue: 1_000_000,
  maxPaymentValue: 1_000_000,
  maxDiscountPercent: 100,
  maxInventoryAdjustment: 100_000,
} as const

function clampNumber(value: unknown, max: number, fallback: number) {
  const parsed = Number(value)

  // A non-numeric or negative input keeps the current value rather than
  // silently becoming 0, which would read as "never act alone" and look like
  // the agent had broken.
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return Math.min(parsed, max)
}

/** Validate and bound a patch against the current thresholds. Pure. */
export function clampThresholds(
  patch: Record<string, unknown>,
  current: AgentThresholds
): AgentThresholds {
  return {
    maxOrderValue:
      patch.maxOrderValue === undefined
        ? current.maxOrderValue
        : clampNumber(patch.maxOrderValue, THRESHOLD_LIMITS.maxOrderValue, current.maxOrderValue),
    maxPurchaseOrderValue:
      patch.maxPurchaseOrderValue === undefined
        ? current.maxPurchaseOrderValue
        : clampNumber(
            patch.maxPurchaseOrderValue,
            THRESHOLD_LIMITS.maxPurchaseOrderValue,
            current.maxPurchaseOrderValue
          ),
    maxPaymentValue:
      patch.maxPaymentValue === undefined
        ? current.maxPaymentValue
        : clampNumber(
            patch.maxPaymentValue,
            THRESHOLD_LIMITS.maxPaymentValue,
            current.maxPaymentValue
          ),
    maxDiscountPercent:
      patch.maxDiscountPercent === undefined
        ? current.maxDiscountPercent
        : clampNumber(
            patch.maxDiscountPercent,
            THRESHOLD_LIMITS.maxDiscountPercent,
            current.maxDiscountPercent
          ),
    maxInventoryAdjustment:
      patch.maxInventoryAdjustment === undefined
        ? current.maxInventoryAdjustment
        : clampNumber(
            patch.maxInventoryAdjustment,
            THRESHOLD_LIMITS.maxInventoryAdjustment,
            current.maxInventoryAdjustment
          ),
    allowOutboundMessages:
      patch.allowOutboundMessages === undefined
        ? current.allowOutboundMessages
        : Boolean(patch.allowOutboundMessages),
    readOnly: patch.readOnly === undefined ? current.readOnly : Boolean(patch.readOnly),
  }
}

function money(value: number) {
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/**
 * What these limits mean, in the words someone would use to explain them.
 *
 * A number in a box does not tell an owner what they have agreed to. "Orders
 * under $500 go through without asking; anything above waits for you" does.
 */
export function describeThresholds(thresholds: AgentThresholds): string[] {
  if (thresholds.readOnly) {
    return [
      "The agent can look at anything but change nothing.",
      "Every write is refused, whatever the value.",
    ]
  }

  const lines = [
    thresholds.maxOrderValue > 0
      ? `Sales orders under ${money(thresholds.maxOrderValue)} go through without asking. Anything above waits for you.`
      : "Every sales order waits for your approval.",
    thresholds.maxPurchaseOrderValue > 0
      ? `Purchase orders under ${money(thresholds.maxPurchaseOrderValue)} are placed on their own.`
      : "Every purchase order waits for your approval.",
    thresholds.maxPaymentValue > 0
      ? `Payments up to ${money(thresholds.maxPaymentValue)} are recorded without asking.`
      : "Every payment waits for your approval.",
    thresholds.maxDiscountPercent > 0
      ? `Discounts up to ${thresholds.maxDiscountPercent}% can be given without asking.`
      : "Any discount waits for your approval.",
    thresholds.maxInventoryAdjustment > 0
      ? `Stock corrections up to ${thresholds.maxInventoryAdjustment} units are made directly.`
      : "Every stock correction waits for your approval.",
    thresholds.allowOutboundMessages
      ? "The agent may message customers directly."
      : "The agent drafts customer messages but never sends them itself.",
  ]

  return lines
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

function omitUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}

export async function saveThresholds(patch: Partial<AgentThresholds>) {
  // See heartbeat.ts: an explicit `undefined` in the patch would overwrite a
  // saved value and then vanish through JSON.stringify, resetting it silently.
  const next = { ...(await getThresholds()), ...omitUndefined(patch) }

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
  trueValue?: number | undefined
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
  const actualValue = input.trueValue ?? value

  if (meta.valueField && typeof actualValue === "number") {
    if (actualValue > limit) {
      return {
        type: "approve",
        reason: `$${actualValue.toFixed(2)} is over the $${limit.toFixed(2)} auto-approval limit.`,
      }
    }

    return { type: "allow" }
  }

  // Writes with no monetary dimension: low risk runs, medium asks.
  return meta.risk === "low" ? { type: "allow" } : { type: "approve", reason: "Needs confirmation." }
}
