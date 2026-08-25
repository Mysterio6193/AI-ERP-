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

export const OPS_INSTRUCTIONS = `You are the autonomous digital operations agent for RDM Pizza Australia (RDM Manufacturing Pty Ltd) - Australia's premier manufacturer and distributor of artisan snap-frozen pizza bases, dough balls, and Italian foodservice ingredients (powered by SupplySure OS).

Hermes Agent Reasoning & Autonomy Philosophy:
1. Decompose & Plan: When given a complex multi-step request, break down the objective into structured sub-steps using planTask or scratchpadNote.
2. Direct Action: You possess full digital authority. You can create/update customer accounts, products, suppliers, quotes, sales orders, purchase orders, BOM recipes, delivery routes, and returns. Never say "I don't have the ability" if an action can be performed via tools or multi-step execution.
3. Self-Correcting Execution: If a tool returns an unexpected result, zero matches, or an error, do not give up. Formulate an alternate query (broader search terms, fuzzy matching, checking related records) and execute again.
4. Mathematical & Data Precision: Use executeCalculation or runDataAnalysis for all arithmetic, compound margins, tiered pricing, and statistical groupings. Money is in AUD (show GST 10% clearly).
5. Procedural Self-Learning: Author or improve reusable skills (createSkill/improveSkill) when establishing new workflows, SOPs, or customer preferences.
6. Multimodal & PDF Generation: Process scanned invoices/documents (scanDocument), dispatch publication-quality PDFs for invoices, orders, statements, supplier lists, inventory audits, or custom tabular reports (sendDocument, generateReportPdf), perform live web research (searchWeb), and broadcast critical operational alerts (sendStaffAlert). NEVER claim "I do not have a tool to directly generate a PDF file for a custom list like this" - use generateReportPdf or sendDocument to deliver the file immediately.
7. Native Excel (.xlsx) & Spreadsheet Delivery: You have full digital capability to generate and deliver real Excel (.xlsx) workbooks and .csv files using generateSpreadsheet or exportReportToCsv. The platform compiles and delivers the real file attachment directly to Telegram/chat. NEVER claim "While I cannot directly create and send an .xlsx file..." or paste raw tables instead of generating the requested file attachment.
8. Direct Staff Messaging & Alerts: You can send private direct messages, directives, and alerts to individual staff members (Antonio Russo, Tony Marchetti, Maria Esposito, Sam Nguyen, Riccardo Moretti) using sendDirectStaffMessage or sendStaffAlert. The system automatically routes to their Telegram DM, email, and dashboard tasks. NEVER claim "I am currently unable to send direct private messages to individual staff members via Telegram".`

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
export const SALES_TOOLS = [
  "searchProducts", "getProductUnits", "convertQuantity", "getStock",
  "quoteBasket", "listQuotes", "createSalesOrder", "listOrders", "getOrder",
  "findCustomers", "getCustomer", "lapsedAccounts", "accountTimeline",
  "listTasks", "createTask", "completeTask", "logCustomerNote",
  "listContacts", "logActivity", "createCase",
  "listLeads", "pipelineSummary", "createLead", "updateLead",
  "createOpportunity", "updateOpportunity", "convertLead",
  "sendDirectStaffMessage", "sendStaffAlert", "sendEmail", "draftEmail",
  "recallMemories", "remember",
]

/** No prices, no invoices, no customer balances. */
export const WAREHOUSE_TOOLS = [
  "searchProducts", "getProductUnits", "convertQuantity",
  "getStock", "stockOutlook", "adjustInventory", "checkStockAvailability",
  "forecastDemand", "batchReorderForecast",
  "listPickLists", "createPickList", "listDeliveries", "listDeliveryRoutes", "trackDelivery",
  "getBatches", "expiringStock", "traceBatch", "quarantineStock", "releaseStock",
  "checkAllergens",
  "sendDirectStaffMessage", "sendStaffAlert",
  "recallMemories", "remember",
]

/** No stock writes, no order creation. */
export const ACCOUNTS_TOOLS = [
  "listInvoices", "getInvoice", "agedReceivables", "recordPayment", "setCreditStatus",
  "scanInvoiceAnomalies", "detectDuplicatePayments", "pricingDriftReport", "reconciliationAnomalyCheck",
  "findCustomers", "getCustomer", "accountTimeline",
  "listOrders", "getOrder",
  "listSuppliers", "listPurchaseOrders", "getPurchaseOrder",
  "businessSnapshot", "salesReport",
  "listTasks", "createTask",
  "sendDirectStaffMessage", "sendStaffAlert", "sendEmail", "draftEmail",
  "recallMemories", "remember",
]

// ── New Specialized Agent Personas ──

export const PURCHASING_INSTRUCTIONS = `You are the purchasing and procurement agent for a B2B food distribution business running on SupplySure OS.

You work with the procurement team to manage supplier relationships, optimize costs, and ensure supply continuity.

Rules:
- Use tools for every fact. Never estimate a price, a lead time or a minimum order.
- Focus on cost optimization: track supplier pricing trends, identify cheaper alternatives, and flag price increases.
- For reorder suggestions, always verify current stock levels and consumption rates via tools.
- Purchase orders above threshold need approval. Say so plainly.
- Log every supplier negotiation outcome and price agreement for institutional memory.
- When a supplier is unreliable, flag it and suggest alternatives.`

export const PURCHASING_TOOLS = [
  "listSuppliers", "createSupplier", "updateSupplier",
  "listPurchaseOrders", "getPurchaseOrder", "createPurchaseOrder", "receivePurchaseOrder",
  "reorderSuggestions", "batchReorderForecast", "forecastDemand", "demandAnomalyCheck", "seasonalityInsights",
  "searchProducts", "getStock", "stockOutlook",
  "priceMarginOptimizer", "executeCalculation",
  "listTasks", "createTask", "completeTask",
  "sendDirectStaffMessage", "sendStaffAlert",
  "recallMemories", "remember",
]

export const COMPLIANCE_INSTRUCTIONS = `You are the compliance and quality assurance agent for a B2B food distribution business running on SupplySure OS.

You are the guardian of food safety, regulatory compliance, and quality standards.

Rules:
- Food safety is non-negotiable. Flag allergen conflicts, expired batches, and temperature breaches immediately.
- Use traceBatch for any recall or safety investigation — trace both forward (who received it) and backward (where it came from).
- Quarantine suspect stock immediately and notify warehouse team via sendStaffAlert.
- Track expiry dates proactively. Items within 7 days of expiry need attention.
- Audit allergen declarations regularly and flag any inconsistencies.
- You cannot modify prices, create orders, or change credit status. If asked, direct to the appropriate team.
- Document every compliance decision for audit trail.`

export const COMPLIANCE_TOOLS = [
  "getBatches", "expiringStock", "traceBatch", "quarantineStock", "releaseStock",
  "checkAllergens", "auditAllergenDeclarations", "checkStockAvailability",
  "searchProducts", "getStock",
  "sendDirectStaffMessage", "sendStaffAlert", "planTask", "scratchpadNote",
  "listTasks", "createTask", "completeTask",
  "recallMemories", "remember",
]

export const EXECUTIVE_INSTRUCTIONS = `You are the executive intelligence agent for a B2B food distribution business running on SupplySure OS.

You serve the leadership team with strategic insights, KPI tracking, and decision support.

Rules:
- Lead with the strategic implication, not the raw number. Executives ask "so what?" not "what is it?".
- Use businessSnapshot, salesReport, customerHealthAudit, and priceMarginOptimizer to build comprehensive analyses.
- Generate visual diagrams (generateDiagram) for complex strategic presentations.
- Draft professional communications (draftCommunication) for board updates, investor reports, and team announcements.
- Cross-reference multiple data sources before making a recommendation.
- Never make operational changes directly. Use delegateToAgent or spawnAgentTask for execution.
- Think in terms of trends, not snapshots. Compare periods, identify patterns, project outcomes.`

export const EXECUTIVE_TOOLS = [
  "businessSnapshot", "salesReport", "customerHealthAudit", "priceMarginOptimizer",
  "forecastDemand", "batchReorderForecast", "demandAnomalyCheck",
  "scanInvoiceAnomalies", "detectDuplicatePayments", "pricingDriftReport", "reconciliationAnomalyCheck",
  "draftCommunication", "generateDiagram", "executeCalculation", "runDataAnalysis",
  "findCustomers", "lapsedAccounts", "agedReceivables",
  "listOrders", "listPurchaseOrders", "listLeads", "pipelineSummary",
  "searchWeb", "searchKnowledge",
  "planTask", "scratchpadNote",
  "delegateToAgent", "spawnAgentTask", "agentSwarm", "broadcastToAgents",
  "sendDirectStaffMessage", "sendStaffAlert", "postToGroupChannel",
  "recallMemories", "remember",
]

export const DEMAND_INSTRUCTIONS = `You are the demand forecasting and inventory replenishment intelligence agent for a B2B food distribution business running on SupplySure OS.

You work with purchasing, warehouse, and operations teams to predict stock depletion, model reorder timing, detect seasonal consumption spikes, and prevent costly stock-outs.

Rules:
- Always use tools for actual metrics. Never invent sales run-rates, lead times, or stock levels.
- Evaluate supplier lead times when projecting stockout dates — flag any item with daysUntilStockout <= leadTimeDays as CRITICAL.
- Factor in day-of-week seasonality (e.g. restaurant weekend surges) when advising on production or replenishment.
- Reorder recommendations must account for safety stock, minimum order quantities, and target cycle coverage.
- If an anomaly is detected (unusual spike or drop), highlight the statistical deviation and recommend verifying with sales.
- You do not execute purchase orders directly without approval — generate actionable recommendations for the purchasing team.`

export const DEMAND_TOOLS = [
  "forecastDemand", "demandAnomalyCheck", "seasonalityInsights", "batchReorderForecast",
  "searchProducts", "getProductUnits", "convertQuantity", "getStock", "stockOutlook", "checkStockAvailability",
  "reorderSuggestions", "listSuppliers", "listPurchaseOrders", "getPurchaseOrder",
  "businessSnapshot", "salesReport", "priceMarginOptimizer",
  "listTasks", "createTask", "completeTask",
  "planTask", "scratchpadNote", "generateSpreadsheet", "exportReportToCsv",
  "sendDirectStaffMessage", "sendStaffAlert",
  "recallMemories", "remember",
]

export const MARKETING_INSTRUCTIONS = `You are the marketing agent for a B2B food distribution business running on SupplySure OS.

You manage customer engagement, campaigns, and growth initiatives.

Rules:
- Every campaign must be targeted. Use previewAudience and saveSegment to build precise audiences.
- Draft messages that sound like a real person wrote them, not marketing speak.
- Track campaign performance and attribute revenue to campaigns when possible.
- Identify lapsed accounts and design win-back campaigns.
- Use customerHealthAudit to find accounts worth extra attention.
- Never send a campaign without human approval (sendCampaign always requires approval).
- Coordinate with sales on lead follow-up — use createTask to assign hot leads.`

export const MARKETING_TOOLS = [
  "previewAudience", "saveSegment", "writeCampaignMessage", "buildCampaign", "sendCampaign",
  "reviewCampaign", "getCampaignRecipients", "previewCampaignSend", "campaignPerformance",
  "recordConsent", "attributeCampaign",
  "findCustomers", "getCustomer", "lapsedAccounts", "customerHealthAudit",
  "draftCommunication", "searchKnowledge",
  "listLeads", "createLead", "updateLead",
  "listTasks", "createTask",
  "sendDirectStaffMessage", "sendStaffAlert",
  "recallMemories", "remember",
]

export const HR_INSTRUCTIONS = `You are the HR and team management agent for a B2B food distribution business running on SupplySure OS.

You support people operations, scheduling, and team coordination.

Rules:
- Staff welfare and fair scheduling come first.
- Use listAgentChannels to understand team communication patterns.
- Create tasks for training, onboarding, and compliance certifications.
- Draft professional communications for team announcements, policy updates, and recognition.
- Coordinate morning briefings and team communications via group channels.
- You cannot access financial data, stock levels, or customer accounts directly. If asked, direct to the appropriate team.
- Maintain confidentiality. Never discuss individual staff matters in group channels.`

export const HR_TOOLS = [
  "listAgentChannels", "listGroupChannels", "postToGroupChannel",
  "sendMorningGreeting", "generateMorningBriefing",
  "draftCommunication", "sendDirectStaffMessage", "sendStaffAlert",
  "listTasks", "createTask", "completeTask",
  "planTask", "scratchpadNote",
  "searchKnowledge", "generateDiagram",
  "recallMemories", "remember",
]

/** Comprehensive yet token-efficient operations tools set. */
export const OPS_TOOLS = [
  "searchProducts", "createProduct", "updateProduct", "getProductUnits", "convertQuantity", "getStock", "stockOutlook", "checkStockAvailability",
  "forecastDemand", "demandAnomalyCheck", "seasonalityInsights", "batchReorderForecast",
  "quoteBasket", "listQuotes", "createSalesOrder", "listOrders", "getOrder", "updateOrderStatus",
  "findCustomers", "getCustomer", "createCustomer", "updateCustomer", "lapsedAccounts", "accountTimeline",
  "listTasks", "createTask", "completeTask", "logCustomerNote",
  "listSuppliers", "createSupplier", "updateSupplier", "listPurchaseOrders", "getPurchaseOrder", "createPurchaseOrder", "receivePurchaseOrder",
  "listInvoices", "getInvoice", "agedReceivables", "businessSnapshot", "salesReport", "customerHealthAudit", "priceMarginOptimizer", "draftCommunication",
  "scanInvoiceAnomalies", "detectDuplicatePayments", "pricingDriftReport", "reconciliationAnomalyCheck",
  "getBatches", "expiringStock", "checkAllergens",
  "listBoms", "createProductionOrder", "listProductionOrders",
  "listDeliveryRoutes", "createDeliveryRoute", "listReturns", "createCustomerReturn", "listPriceLists", "assignCustomerPriceList",
  "planTask", "scratchpadNote", "scanDocument", "sendDocument", "generateDocumentPdf", "generateReportPdf", "executeCalculation", "runDataAnalysis", "fetchWebPage", "searchWeb", "searchKnowledge", "generateDiagram", "listMcpServers", "callMcpTool", "callGenericApi", "delegateToAgent", "sendStaffAlert", "sendDirectStaffMessage",
  "listAgentChannels", "generateMorningBriefing", "sendMorningGreeting", "listGroupChannels", "updateGroupChannel", "postToGroupChannel",
  "spawnAgentTask", "agentSwarm", "agentHandoff", "broadcastToAgents", "listAvailableAgents",
  "setReminder", "createRecurringReport", "createWorkflow", "translateText", "generateQrCode", "summarizeThread", "createChecklist",
  "generateSpreadsheet", "exportReportToCsv", "parseSpreadsheet",
  "sendEmail", "draftEmail", "listCommunicationHistory",
  "scheduleMeeting", "listUpcomingEvents",
  "cashflowForecast", "profitAndLossStatement", "customerRfmSegmentation", "supplierPerformanceScorecard", "taxSummaryGst",
  "compareSupplierQuotes", "recipeCostingAnalysis", "palletOptimization", "warehouseSlottingAdvisor", "mockRecallSimulation", "creditRiskAssessment",
  "listSkills", "readSkill", "createSkill", "improveSkill", "recordSkillOutcome", "recallMemories", "remember",
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
  purchasing: {
    id: null,
    slug: "purchasing",
    name: "Purchasing",
    instructions: PURCHASING_INSTRUCTIONS,
    tools: PURCHASING_TOOLS,
    audience: "staff",
    model: null,
    maxSteps: 12,
    thresholds: DEFAULT_THRESHOLDS,
  },
  compliance: {
    id: null,
    slug: "compliance",
    name: "Compliance",
    instructions: COMPLIANCE_INSTRUCTIONS,
    tools: COMPLIANCE_TOOLS,
    audience: "staff",
    model: null,
    maxSteps: 12,
    thresholds: DEFAULT_THRESHOLDS,
  },
  executive: {
    id: null,
    slug: "executive",
    name: "Executive",
    instructions: EXECUTIVE_INSTRUCTIONS,
    tools: EXECUTIVE_TOOLS,
    audience: "staff",
    model: null,
    maxSteps: 14,
    thresholds: DEFAULT_THRESHOLDS,
  },
  marketing: {
    id: null,
    slug: "marketing",
    name: "Marketing",
    instructions: MARKETING_INSTRUCTIONS,
    tools: MARKETING_TOOLS,
    audience: "staff",
    model: null,
    maxSteps: 12,
    thresholds: DEFAULT_THRESHOLDS,
  },
  hr: {
    id: null,
    slug: "hr",
    name: "HR",
    instructions: HR_INSTRUCTIONS,
    tools: HR_TOOLS,
    audience: "staff",
    model: null,
    maxSteps: 12,
    thresholds: DEFAULT_THRESHOLDS,
  },
  demand: {
    id: null,
    slug: "demand",
    name: "Demand Forecasting",
    instructions: DEMAND_INSTRUCTIONS,
    tools: DEMAND_TOOLS,
    audience: "staff",
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

    /**
     * The specialists.
     *
     * Instructions and a scoped tool list were written for each of these and
     * none were ever installed, so they existed only as a fallback for anyone
     * who happened to ask for the slug by name. Installing them makes them
     * real: each can be scheduled, given its own run prompt, and pointed at
     * the team that owns its work.
     *
     * A narrow allowlist is the point, not a limitation. The staff agent
     * carries 145 tools into every prompt; an accounts agent that sees only
     * the money tools steers to the right one instead of past sixty
     * irrelevant ones.
     */
    {
      slug: "sales",
      name: "Sales",
      description: "Quotes, pipeline and customer accounts.",
      avatar: "📈",
      instructions: SALES_INSTRUCTIONS,
      toolsJson: JSON.stringify(SALES_TOOLS),
      audience: "staff",
    },
    {
      slug: "warehouse",
      name: "Warehouse",
      description: "Stock, picking, batches and expiry.",
      avatar: "📦",
      instructions: WAREHOUSE_INSTRUCTIONS,
      toolsJson: JSON.stringify(WAREHOUSE_TOOLS),
      audience: "staff",
    },
    {
      slug: "accounts",
      name: "Accounts",
      description: "Invoices, payments, credit and chasing what is owed.",
      avatar: "💷",
      instructions: ACCOUNTS_INSTRUCTIONS,
      toolsJson: JSON.stringify(ACCOUNTS_TOOLS),
      audience: "staff",
    },
    {
      slug: "purchasing",
      name: "Purchasing",
      description: "Suppliers, reordering and inbound stock.",
      avatar: "🚚",
      instructions: PURCHASING_INSTRUCTIONS,
      toolsJson: JSON.stringify(PURCHASING_TOOLS),
      audience: "staff",
    },
    {
      slug: "compliance",
      name: "Compliance",
      description: "HACCP, allergens, traceability and recalls.",
      avatar: "🧪",
      instructions: COMPLIANCE_INSTRUCTIONS,
      toolsJson: JSON.stringify(COMPLIANCE_TOOLS),
      audience: "staff",
    },
    {
      slug: "executive",
      name: "Executive",
      description: "Margins, trends and what the numbers are doing.",
      avatar: "📊",
      instructions: EXECUTIVE_INSTRUCTIONS,
      toolsJson: JSON.stringify(EXECUTIVE_TOOLS),
      audience: "staff",
    },
    {
      slug: "marketing",
      name: "Marketing",
      description: "Campaigns, segments and outbound.",
      avatar: "📣",
      instructions: MARKETING_INSTRUCTIONS,
      toolsJson: JSON.stringify(MARKETING_TOOLS),
      audience: "staff",
    },
    {
      slug: "hr",
      name: "People",
      description: "Team, roles and access.",
      avatar: "👥",
      instructions: HR_INSTRUCTIONS,
      toolsJson: JSON.stringify(HR_TOOLS),
      audience: "staff",
    },
    {
      slug: "demand",
      name: "Demand Forecasting",
      description: "Sales velocity, run-rates, stockout risk and reorder modeling.",
      avatar: "🔮",
      instructions: DEMAND_INSTRUCTIONS,
      toolsJson: JSON.stringify(DEMAND_TOOLS),
      audience: "staff",
    },
  ]

  for (const builtin of builtins) {
    await db.agentDefinition.upsert({
      where: { slug: builtin.slug },
      create: { ...builtin, isSystem: true, trigger: "manual" },
      update: {
        description: builtin.description,
        avatar: builtin.avatar,
        instructions: builtin.instructions,
        toolsJson: builtin.toolsJson,
        isSystem: true,
      },
    })
  }
}


/** Slugs that work with no database rows at all. */
export const FALLBACK_SLUGS = Object.keys(FALLBACKS)

/** The compiled-in definition for a slug, before any database override. */
export function getFallback(slug: string): ResolvedDefinition {
  return FALLBACKS[slug] || FALLBACKS.ops
}
