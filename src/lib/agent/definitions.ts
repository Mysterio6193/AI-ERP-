import { db } from "@/lib/db"

import type { AgentPrincipal } from "./context"
import { DEFAULT_THRESHOLDS, getThresholds, type AgentThresholds } from "./policy"
import { TOOL_POLICY } from "./tools"

/**
 * Agent definitions.
 *
 * The runtime used to hardcode two personas and hand every agent the whole tool
 * registry. A definition moves that into data: instructions, an explicit tool
 * allowlist and autonomy limits per agent, so staff can build a narrow agent
 * ("look at leads, never touch money") without a deploy.
 *
 * The two original personas are seeded as isSystem rows carrying the exact
 * prompts they had before, so there is one code path rather than a legacy
 * branch and a new one.
 */

export const OPS_INSTRUCTIONS = `You are the operations agent for a B2B food distribution business running on SupplySure OS.

You work for the staff member you are talking to. Be brief and concrete - they are usually on a phone, often in a warehouse or a van. Lead with the answer, then the detail.

Rules:
- Use tools for every fact. Never guess a number, a price, a stock level or a balance.
- Money is AUD. Always show GST separately when quoting a total.
- Before creating an order, price it with quoteBasket and read the total back for confirmation.
- Resolve vague product names with searchProducts and confirm the match if it is ambiguous.
- When an action needs approval you will be told. Say so plainly and do not retry it.
- If a tool is denied, explain the limit and offer what you can do instead.
- Turn commitments into tasks with createTask so nothing is lost.
- Never invent customers, products or invoice numbers. If you cannot find it, say so.`

export const CUSTOMER_INSTRUCTIONS = `You take orders and answer account questions for customers of a B2B food wholesaler.

You are talking to a trade customer over a messaging app. Keep replies short, warm and practical - no corporate padding.

Rules:
- You can only see this customer's own account. Never discuss other customers.
- Use searchProducts to find what they mean, and confirm the exact product and pack size before adding it.
- Always price the basket with quoteBasket and read back items, GST and total before placing an order.
- Only place an order after the customer clearly confirms.
- If their credit is exhausted or the account is on hold, say so politely and offer to have someone call them.
- For anything you cannot do - disputes, credit limits, returns - say a team member will follow up, and log it.
- Never invent prices, stock or delivery dates. Use the tools.`

export interface ResolvedDefinition {
  id: string | null
  slug: string
  name: string
  instructions: string
  /** Null means "every tool this audience may use". */
  tools: string[] | null
  audience: string
  model: string | null
  maxSteps: number
  thresholds: AgentThresholds
}

/** The built-ins, used when the table is empty so the agent works before seeding. */
const FALLBACKS: Record<string, ResolvedDefinition> = {
  ops: {
    id: null,
    slug: "ops",
    name: "Operations",
    instructions: OPS_INSTRUCTIONS,
    tools: null,
    audience: "staff",
    model: null,
    maxSteps: 12,
    thresholds: DEFAULT_THRESHOLDS,
  },
  customer: {
    id: null,
    slug: "customer",
    name: "Customer Service",
    instructions: CUSTOMER_INSTRUCTIONS,
    tools: null,
    audience: "customer",
    model: null,
    maxSteps: 12,
    thresholds: DEFAULT_THRESHOLDS,
  },
}

function parseTools(toolsJson: string | null): string[] | null {
  if (!toolsJson) {
    return null
  }

  try {
    const parsed = JSON.parse(toolsJson)
    if (!Array.isArray(parsed)) {
      return null
    }

    // Drop anything not in the registry, so a renamed tool degrades to "fewer
    // tools" rather than handing the model a name the policy engine will deny.
    return parsed.filter((name): name is string => typeof name === "string" && name in TOOL_POLICY)
  } catch {
    return null
  }
}

function parseThresholds(json: string | null, base: AgentThresholds): AgentThresholds {
  if (!json) {
    return base
  }

  try {
    const patch = JSON.parse(json) as Partial<AgentThresholds>
    return { ...base, ...patch }
  } catch {
    return base
  }
}

/**
 * Loads a definition by slug, layering its threshold overrides over the global
 * ones. Falls back to the built-in prompt when nothing is stored yet.
 */
export async function resolveDefinition(slug: string): Promise<ResolvedDefinition> {
  const globals = await getThresholds()

  const row = await db.agentDefinition.findUnique({ where: { slug } })

  if (!row || !row.enabled) {
    const fallback = FALLBACKS[slug] || FALLBACKS.ops
    return { ...fallback, thresholds: globals }
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    instructions: row.instructions,
    tools: parseTools(row.toolsJson),
    audience: row.audience,
    model: row.model,
    maxSteps: row.maxSteps,
    thresholds: parseThresholds(row.thresholdsJson, globals),
  }
}

/** The definition a principal talks to by default. */
export function defaultSlugFor(principal: AgentPrincipal) {
  return principal.kind === "staff" ? "ops" : "customer"
}

/**
 * Narrows a built tool set to the definition's allowlist.
 *
 * Filtering here rather than inside each domain builder keeps customer
 * isolation where it already lives: the builders still close over the
 * principal, so an allowlist can only ever remove reach, never grant it.
 */
export function applyToolAllowlist<T extends Record<string, unknown>>(
  tools: T,
  allowed: string[] | null
): T {
  if (allowed === null) {
    return tools
  }

  const permitted = new Set(allowed)
  const filtered: Record<string, unknown> = {}

  for (const [name, tool] of Object.entries(tools)) {
    if (permitted.has(name)) {
      filtered[name] = tool
    }
  }

  return filtered as T
}

/** Writes the built-in personas into the table so they are editable in the UI. */
export async function ensureSystemDefinitions() {
  const builtins = [
    {
      slug: "ops",
      name: "Operations",
      description: "The all-rounder. Knows stock, orders, customers and money.",
      avatar: "🧑‍🍳",
      instructions: OPS_INSTRUCTIONS,
      audience: "staff",
    },
    {
      slug: "customer",
      name: "Customer Service",
      description: "Talks to trade customers. Scoped to their own account.",
      avatar: "💬",
      instructions: CUSTOMER_INSTRUCTIONS,
      audience: "customer",
    },
  ]

  for (const builtin of builtins) {
    await db.agentDefinition.upsert({
      where: { slug: builtin.slug },
      create: { ...builtin, isSystem: true, trigger: "manual" },
      // Only backfill presentation - never clobber edited instructions.
      update: { description: builtin.description, avatar: builtin.avatar, isSystem: true },
    })
  }
}
