import { z } from "zod"

/**
 * Configurable business behaviour.
 *
 * The system was full of decisions baked into code: GST hardcoded at 10 in
 * eight places while `Company.gstRate` sat editable and unread, invoice due
 * dates always +30 days regardless of the customer's terms, three different
 * aging-bucket definitions that disagreed with the PDF customers receive.
 *
 * Every namespace here follows one rule: **its defaults reproduce today's
 * behaviour exactly**. Turning the settings layer on changes nothing until
 * somebody deliberately changes a value. That is what makes it safe to land
 * ahead of the code that reads it.
 */

/** Payment-term sentinels already used by `types.ts`: 0 = COD, -1 = end of month. */
export const taxSchema = z.object({
  /** null inherits Company.country. */
  country: z.enum(["AU", "IN"]).nullable().default(null),
  /** null inherits Company.gstRate. */
  defaultRate: z.number().min(0).max(100).nullable().default(null),
  /** Where a line's rate comes from, first match wins. */
  resolutionOrder: z
    .array(z.enum(["line", "product", "customer", "company"]))
    .default(["line", "product", "customer", "company"]),
  roundingMode: z.enum(["line", "document"]).default("line"),
  roundingDp: z.number().int().min(0).max(4).default(2),
  exemptCustomerTypes: z.array(z.string()).default([]),
  /**
   * Declared but NOT implemented in the first pass. It changes every total in
   * the system, so shipping it alongside the tax rewire would make regressions
   * indistinguishable from configuration.
   */
  pricesIncludeTax: z.boolean().default(false),
})

export const invoicingSchema = z.object({
  dueDateSource: z.enum(["customerTerms", "fixedDays"]).default("customerTerms"),
  fixedDays: z.number().int().min(0).max(365).default(30),
  /** Used when the customer has no terms set. Matches today's hardcoded +30. */
  fallbackDays: z.number().int().min(0).max(365).default(30),
  eomHandling: z.enum(["endOfMonth", "endOfNextMonth"]).default("endOfMonth"),
  codDueSameDay: z.boolean().default(true),
  autoInvoiceOnStatuses: z.array(z.string()).default(["invoiced", "delivered"]),
  overdueGraceDays: z.number().int().min(0).max(90).default(0),
})

export const agingSchema = z.object({
  basis: z.enum(["dueDate", "invoiceDate"]).default("dueDate"),
  buckets: z
    .array(
      z.object({
        label: z.string(),
        minDays: z.number().int(),
        /** null means open-ended. */
        maxDays: z.number().int().nullable(),
      })
    )
    .default([
      { label: "Current", minDays: -99999, maxDays: 0 },
      { label: "1-30 days", minDays: 1, maxDays: 30 },
      { label: "31-60 days", minDays: 31, maxDays: 60 },
      { label: "61-90 days", minDays: 61, maxDays: 90 },
      { label: "90+ days", minDays: 91, maxDays: null },
    ]),
})

const docNumberFormat = z.object({
  prefix: z.string().min(1).max(8),
  dateToken: z.enum(["none", "YY", "YYYY", "YYYYMM", "YYYYMMDD"]),
  separator: z.string().max(2).default("-"),
  pad: z.number().int().min(1).max(10),
  start: z.number().int().min(0),
  reset: z.enum(["never", "yearly", "monthly", "daily"]),
  suffix: z.string().max(8).default(""),
  /**
   * False keeps the legacy generator, byte for byte. Flipped per document kind
   * once its counter has been seeded, because the legacy path continues a
   * sequence by parsing the previous number - so changing the format before
   * the counter is live breaks continuation.
   */
  useCounter: z.boolean().default(false),
})

/** Defaults reproduce each existing generator exactly, including pad width. */
export const numberingSchema = z.object({
  salesOrder: docNumberFormat.default({ prefix: "SO", dateToken: "YYYY", separator: "-", pad: 5, start: 1001, reset: "yearly", suffix: "", useCounter: false }),
  quote: docNumberFormat.default({ prefix: "QT", dateToken: "YYYY", separator: "-", pad: 5, start: 1001, reset: "yearly", suffix: "", useCounter: false }),
  invoice: docNumberFormat.default({ prefix: "INV", dateToken: "YYYY", separator: "-", pad: 5, start: 1001, reset: "yearly", suffix: "", useCounter: false }),
  purchaseOrder: docNumberFormat.default({ prefix: "PO", dateToken: "YYYY", separator: "-", pad: 5, start: 1001, reset: "yearly", suffix: "", useCounter: false }),
  pickList: docNumberFormat.default({ prefix: "PK", dateToken: "YYYY", separator: "-", pad: 5, start: 1, reset: "yearly", suffix: "", useCounter: false }),
  delivery: docNumberFormat.default({ prefix: "DL", dateToken: "YYYYMMDD", separator: "-", pad: 5, start: 1, reset: "daily", suffix: "", useCounter: false }),
  route: docNumberFormat.default({ prefix: "RT", dateToken: "YYYYMMDD", separator: "-", pad: 3, start: 1, reset: "daily", suffix: "", useCounter: false }),
  productionOrder: docNumberFormat.default({ prefix: "PRD", dateToken: "YYYY", separator: "-", pad: 4, start: 1, reset: "yearly", suffix: "", useCounter: false }),
  freightBooking: docNumberFormat.default({ prefix: "FB", dateToken: "YYYY", separator: "-", pad: 4, start: 1, reset: "never", suffix: "", useCounter: false }),
  creditNote: docNumberFormat.default({ prefix: "CN", dateToken: "YYYY", separator: "-", pad: 4, start: 1, reset: "yearly", suffix: "", useCounter: false }),
  return: docNumberFormat.default({ prefix: "RET", dateToken: "none", separator: "-", pad: 4, start: 1001, reset: "never", suffix: "", useCounter: false }),
  case: docNumberFormat.default({ prefix: "CS", dateToken: "YYYY", separator: "-", pad: 5, start: 1, reset: "yearly", suffix: "", useCounter: false }),
  expense: docNumberFormat.default({ prefix: "EXP", dateToken: "YYYY", separator: "-", pad: 5, start: 1, reset: "yearly", suffix: "", useCounter: true }),
})

export const pricingSchema = z.object({
  /** Off by default. Turning it on changes what customers are charged. */
  enablePriceLists: z.boolean().default(false),
  enableDiscountRules: z.boolean().default(false),
  fallback: z.enum(["wholesalePrice", "retailPrice"]).default("wholesalePrice"),
  useDefaultPriceListWhenCustomerHasNone: z.boolean().default(false),
  volumeBreaks: z.boolean().default(true),
  allowManualPriceOverride: z.boolean().default(true),
  maxLineDiscountPercent: z.number().min(0).max(100).default(100),
  discountStacking: z.enum(["best", "sum", "first"]).default("best"),
  roundPricesTo: z.number().int().min(0).max(4).default(2),
})

export const opsSchema = z.object({
  defaultWarehouseId: z.string().nullable().default(null),
  defaultPaymentTerms: z.number().int().min(-1).max(365).default(30),
  /** null inherits Company.fiscalYearStart. */
  fiscalYearStartMonth: z.number().int().min(1).max(12).nullable().default(null),
  currencyDisplay: z.enum(["symbol", "code"]).default("symbol"),
  lowStockReorderLevel: z.number().int().min(0).default(10),

  /**
   * Refuse an order status change that does not make physical sense, rather
   * than recording it and allowing it.
   *
   * Off by default, and deliberately so. The transition map was derived from
   * reading what the side effects assume, and a map derived that way will be
   * wrong somewhere — turning it into hard refusals before anyone has seen
   * what it rejects would break real flows. While this is off, an illegal move
   * is written to the audit trail as `sales_order_transition`, so the moves a
   * business actually makes become visible first.
   */
  enforceOrderTransitions: z.boolean().default(false),
  lowStockReorderQty: z.number().int().min(0).default(50),

  /**
   * The agent's browser, and where it may go.
   *
   * Off by default, and the site list empty by default, because an empty list
   * means closed rather than open. Turning this on gives the agent a browser
   * carrying whatever sessions a person has signed into on this machine, which
   * is a different order of trust from every other tool it has — so it is two
   * deliberate acts to enable, not one.
   */
  enableAgentBrowser: z.boolean().default(false),
  agentBrowserSites: z
    .string()
    .default("")
    .describe("Hosts the agent's browser may visit, one per line. A host also covers its subdomains."),
})

export const brandingSchema = z.object({
  primaryColor: z.enum(["slate", "sky", "emerald", "indigo", "violet", "rose", "amber"]).default("sky"),
  invoiceTheme: z.enum(["modern", "classic", "compact", "minimalist"]).default("modern"),
  showLogoOnDocuments: z.boolean().default(true),
  showPaymentQrOnInvoice: z.boolean().default(true),
  showBankDetailsOnInvoice: z.boolean().default(true),
  documentFooter: z.string().default("Thank you for your business. Please quote invoice number on remittance."),
  defaultTermsAndConditions: z.string().default("Goods remain the property of the seller until paid in full. Claims must be made within 7 days of delivery."),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]).default("DD/MM/YYYY"),
})

export const dashboardSchema = z.object({
  kpiCardsVisible: z.array(z.string()).default(["revenue", "orders", "receivables", "low_stock", "routes", "picks"]),
  showSalesTrend: z.boolean().default(true),
  showChannelBreakdown: z.boolean().default(true),
  showLowStockAlerts: z.boolean().default(true),
  showRecentOrders: z.boolean().default(true),
  defaultTimeframe: z.enum(["today", "week", "month", "year"]).default("month"),
  compactMode: z.boolean().default(false),
})

export const automationSchema = z.object({
  autoApproveOrdersUnder: z.number().min(0).default(0),
  blockOrdersOnCreditHold: z.boolean().default(true),
  autoGeneratePickList: z.boolean().default(true),
  autoSendInvoiceOnDispatch: z.boolean().default(false),
  lowStockThresholdMode: z.enum(["product", "category", "global"]).default("global"),
  notifyOverdueInvoices: z.boolean().default(true),
  telegramAlertsEnabled: z.boolean().default(true),
})

export const agentPersonaSchema = z.object({
  personaName: z.string().default("SupplySure Autonomous Assistant"),
  tone: z.enum(["professional", "concise", "friendly", "technical"]).default("professional"),
  autoConfirmLowRiskActions: z.boolean().default(false),
  customSystemInstructions: z.string().default("Prioritize customer satisfaction and verify stock levels before confirming delivery commitments."),
})

export const aiModelsSchema = z.object({
  provider: z.enum(["openrouter", "gateway", "local"]).default("openrouter"),
  chatModel: z.string().default("deepseek/deepseek-chat"),
  telegramModel: z.string().default("deepseek/deepseek-chat"),
  ocrModel: z.string().default("google/gemini-2.5-flash"),
  voiceModel: z.string().default("openai/whisper-large-v3"),
  replenishmentModel: z.string().default("deepseek/deepseek-chat"),
  emailModel: z.string().default("meta-llama/llama-3.3-70b-instruct"),
  financeModel: z.string().default("deepseek/deepseek-chat"),
  fastModel: z.string().default("meta-llama/llama-3.3-70b-instruct"),
})

export interface NamespaceDefinition {
  schema: z.ZodTypeAny
  label: string
  description: string
  /** Roles permitted to write. Reads are open to any staff member. */
  writeRoles: string[]
}

export const REGISTRY = {
  aiModels: {
    schema: aiModelsSchema,
    label: "AI Models & Multi-Modal Routing",
    description: "Assigned neural models for chat, Telegram, OCR vision, voice transcribing, and purchasing.",
    writeRoles: ["admin"],
  },
  branding: {
    schema: brandingSchema,
    label: "Brand & Document Style",
    description: "Themes, document templates, invoice notes, and color palettes.",
    writeRoles: ["admin"],
  },
  dashboard: {
    schema: dashboardSchema,
    label: "Dashboard & Views",
    description: "Visible metric cards, chart modules, and default time horizons.",
    writeRoles: ["admin", "sales", "accounts", "warehouse"],
  },
  automation: {
    schema: automationSchema,
    label: "Workflow & Approvals",
    description: "Automatic order approvals, credit hold blocks, and alert triggers.",
    writeRoles: ["admin", "accounts"],
  },
  agentPersona: {
    schema: agentPersonaSchema,
    label: "Agent Persona & Directives",
    description: "AI assistant tone, custom guidelines, and autonomous execution rules.",
    writeRoles: ["admin"],
  },
  tax: {
    schema: taxSchema,
    label: "Tax",
    description: "How GST is resolved and rounded on every line.",
    writeRoles: ["admin", "accounts"],
  },
  invoicing: {
    schema: invoicingSchema,
    label: "Invoicing",
    description: "When invoices fall due, and what triggers one.",
    writeRoles: ["admin", "accounts"],
  },
  aging: {
    schema: agingSchema,
    label: "Receivables aging",
    description: "The buckets used on screen, in reports and on customer statements.",
    writeRoles: ["admin", "accounts"],
  },
  numbering: {
    schema: numberingSchema,
    label: "Document numbering",
    description: "Prefixes, sequences and reset behaviour for every document type.",
    writeRoles: ["admin"],
  },
  pricing: {
    schema: pricingSchema,
    label: "Pricing",
    description: "Whether price lists and discount rules apply to an order line.",
    writeRoles: ["admin"],
  },
  ops: {
    schema: opsSchema,
    label: "Operations",
    description: "Defaults for warehouses, payment terms and stock levels.",
    writeRoles: ["admin", "warehouse"],
  },
} satisfies Record<string, NamespaceDefinition>

export type Namespace = keyof typeof REGISTRY

export type SettingsOf<K extends Namespace> = z.infer<(typeof REGISTRY)[K]["schema"]>

export function isNamespace(value: string): value is Namespace {
  // hasOwnProperty, not `in`. `"__proto__" in REGISTRY` is true for any object,
  // so `in` would let inherited keys through the API route's guard and then
  // hand `REGISTRY["__proto__"].writeRoles` — undefined — to the role check.
  return Object.prototype.hasOwnProperty.call(REGISTRY, value)
}

/** The compiled-in defaults for a namespace, from the schema itself. */
export function defaultsFor<K extends Namespace>(namespace: K): SettingsOf<K> {
  return REGISTRY[namespace].schema.parse({}) as SettingsOf<K>
}

export function listNamespaces() {
  return (Object.keys(REGISTRY) as Namespace[]).map((namespace) => ({
    namespace,
    label: REGISTRY[namespace].label,
    description: REGISTRY[namespace].description,
    writeRoles: REGISTRY[namespace].writeRoles,
  }))
}
