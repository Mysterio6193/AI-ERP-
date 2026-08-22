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
- You are fully voice-enabled and multimodal: you can process voice notes, scanned documents, and reply with voice. Never claim you cannot process or send voice notes.
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
- You are fully voice-enabled and multimodal: you can receive voice messages, process photos, and reply in voice.
- Never invent prices, stock or delivery dates. Use the tools.`


/**
 * Role agents.
 *
 * Every staff member used to talk to `ops`, which carries the whole registry.
 * The Phase 0 probe measured what that costs: **63,050 prompt tokens per turn
 * with 94 tools against 12,766 with six**. Roughly five times, on every single
 * message. A narrow agent is not a nicety, it is the difference between an
 * assistant that is affordable to run and one that is not.
 *
 * It also reads better. A picker asking "what do I pull next" should not be
 * talking to something that can raise credit limits, and a rep should not have
 * to steer past sixty irrelevant tools to quote a pallet of bases.
 *
 * The allowlist can only ever remove reach — `applyToolAllowlist` filters tools
 * the builders already scoped to the principal, so this is a narrowing, never a
 * grant.
 */

export const SALES_INSTRUCTIONS = `You are the sales agent for a B2B food distribution business running on SupplySure OS.

You work for the rep you are talking to, usually on a phone between calls or in a van. Lead with the answer. Assume they mean their own accounts unless they say otherwise.

Rules:
- Use tools for every fact. Never guess a price, a stock level or when someone last ordered.
- Money is AUD. Always show GST separately when quoting a total.
- Price every basket with quoteBasket and read the total back before creating an order.
- Resolve vague product names with searchProducts and confirm an ambiguous match.
- When a rep tells you what happened on a visit, capture it: log the note, raise a task for anything promised, and open a case if they are unhappy. Reps do not fill in forms; that is why CRM data rots.
- Ask for a loss reason when an opportunity closes. It is the only competitive intel the business gets.
- Never invent a customer, a product or a price. If you cannot find it, say so.`

export const WAREHOUSE_INSTRUCTIONS = `You are the warehouse agent for a B2B food distribution business running on SupplySure OS.

You are talking to someone on the floor, usually one-handed on a phone. Be short. Lead with the number or the location.

Rules:
- Use tools for every fact. Never guess a quantity, a batch or an expiry.
- Quantities are in base units unless someone says pallets or boxes; use convertQuantity rather than doing the arithmetic yourself.
- For anything perishable, work first-expired-first-out and say which batch you mean.
- Flag allergen conflicts before anything else. That is a safety matter, not a preference.
- Stock corrections above the limit need approval. Say so plainly and do not retry.
- You cannot see prices, invoices or customer balances. If asked, say that is the accounts team.`

export const ACCOUNTS_INSTRUCTIONS = `You are the accounts agent for a B2B food distribution business running on SupplySure OS.

You are talking to someone in finance. Be precise and lead with the figure.

Rules:
- Use tools for every fact. Never estimate a balance, an age or what is owed.
- Money is AUD. Show GST separately.
- Quote aged receivables from agedReceivables, never from memory or arithmetic.
- Recording a payment and changing a credit status both need approval. Say so plainly and do not retry.
- If an invoice looks wrong, say what looks wrong rather than adjusting it.
- You cannot adjust stock or create orders. If asked, say which team can.`

/** Tools a sales rep actually reaches for. */
const SALES_TOOLS = [
  "searchProducts", "getProductUnits", "convertQuantity", "getStock",
  "quoteBasket", "listQuotes", "createSalesOrder", "listOrders", "getOrder",
  "findCustomers", "getCustomer", "lapsedAccounts", "accountTimeline",
  "listTasks", "createTask", "completeTask", "logCustomerNote",
  "listContacts", "logActivity", "createCase",
  "listLeads", "pipelineSummary", "createLead", "updateLead",
  "createOpportunity", "updateOpportunity", "convertLead",
  "recallMemories", "remember",
]

/** No prices, no invoices, no customer balances. */
const WAREHOUSE_TOOLS = [
  "searchProducts", "getProductUnits", "convertQuantity",
  "getStock", "stockOutlook", "adjustInventory", "checkStockAvailability",
  "listPickLists", "createPickList", "listDeliveries", "listRoutes", "trackDelivery",
  "getBatches", "expiringStock", "traceBatch", "quarantineStock", "releaseStock",
  "checkAllergens",
  "recallMemories", "remember",
]

/** No stock writes, no order creation. */
const ACCOUNTS_TOOLS = [
  "listInvoices", "getInvoice", "agedReceivables", "recordPayment", "setCreditStatus",
  "findCustomers", "getCustomer", "accountTimeline",
  "listOrders", "getOrder",
  "listSuppliers", "listPurchaseOrders", "getPurchaseOrder",
  "businessSnapshot", "salesReport",
  "listTasks", "createTask",
  "recallMemories", "remember",
]

/** Comprehensive yet token-efficient operations tools set. */
export const OPS_TOOLS = [
  "searchProducts", "getProductUnits", "convertQuantity", "getStock", "stockOutlook", "checkStockAvailability",
  "quoteBasket", "listQuotes", "createSalesOrder", "listOrders", "getOrder", "updateOrderStatus",
  "findCustomers", "getCustomer", "lapsedAccounts", "accountTimeline",
  "listTasks", "createTask", "completeTask", "logCustomerNote",
  "listSuppliers", "listPurchaseOrders", "getPurchaseOrder", "createPurchaseOrder", "receivePurchaseOrder",
  "listInvoices", "getInvoice", "agedReceivables", "businessSnapshot", "salesReport",
  "getBatches", "expiringStock", "checkAllergens",
  "scanDocument", "listSkills", "readSkill", "recallMemories", "remember",
]

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
    tools: OPS_TOOLS,
    audience: "staff",
    model: null,
    maxSteps: 12,
    thresholds: DEFAULT_THRESHOLDS,
  },
  sales: {
    id: null,
    slug: "sales",
    name: "Sales",
    instructions: SALES_INSTRUCTIONS,
    tools: SALES_TOOLS,
    audience: "staff",
    model: null,
    maxSteps: 12,
    thresholds: DEFAULT_THRESHOLDS,
  },
  warehouse: {
    id: null,
    slug: "warehouse",
    name: "Warehouse",
    instructions: WAREHOUSE_INSTRUCTIONS,
    tools: WAREHOUSE_TOOLS,
    audience: "staff",
    model: null,
    maxSteps: 12,
    thresholds: DEFAULT_THRESHOLDS,
  },
  accounts: {
    id: null,
    slug: "accounts",
    name: "Accounts",
    instructions: ACCOUNTS_INSTRUCTIONS,
    tools: ACCOUNTS_TOOLS,
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

/**
 * The definition a principal talks to by default.
 *
 * Routed by role rather than sending every staff member to `ops`. Admins keep
 * the full registry because they genuinely reach across the whole business;
 * everyone else gets the agent for their job, which is both cheaper and more
 * use to them. An unrecognised role falls back to `ops` rather than to nothing.
 */
export function defaultSlugFor(principal: AgentPrincipal) {
  if (principal.kind !== "staff") {
    return "customer"
  }

  switch (principal.role) {
    case "sales":
      return "sales"
    case "warehouse":
      return "warehouse"
    case "accounts":
      return "accounts"
    default:
      return "ops"
  }
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
      toolsJson: JSON.stringify(OPS_TOOLS),
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
      update: { description: builtin.description, avatar: builtin.avatar, toolsJson: builtin.toolsJson, isSystem: true },
    })
  }
}


/** Slugs that work with no database rows at all. */
export const FALLBACK_SLUGS = Object.keys(FALLBACKS)

/** The compiled-in definition for a slug, before any database override. */
export function getFallback(slug: string): ResolvedDefinition {
  return FALLBACKS[slug] || FALLBACKS.ops
}
