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
})

export const manufacturingSchema = z.object({
  /**
   * Refuse to release a run whose recipe has no routing.
   *
   * Off by default: recipes that predate routings would all become
   * unreleasable overnight. Turn it on once the routings exist.
   */
  requireRoutingToRelease: z.boolean().default(false),

  /** Applied to a new work centre, and to any that leaves minutesPerDay null. */
  defaultMinutesPerDay: z.number().int().min(1).max(1440).default(480),
  /** Gap between generated operation sequence numbers, so steps can be inserted. */
  sequenceStep: z.number().int().min(1).max(100).default(10),

  /** Defaults a routing operation starts from when it states nothing itself. */
  defaultSetupMinutes: z.number().int().min(0).default(0),
  defaultQueueMinutes: z.number().int().min(0).default(0),
  defaultMoveMinutes: z.number().int().min(0).default(0),
  /** Sustained output vs standard time, for a work centre that sets none. */
  defaultEfficiencyPercent: z.number().min(1).max(200).default(100),

  /**
   * Cost the time a run spends at a work centre, at that centre's rate.
   *
   * Off keeps unit cost as materials only, which is what the system did before
   * routings existed — turning it on changes reported margins, so it is a
   * deliberate choice rather than a default.
   */
  includeLaborInUnitCost: z.boolean().default(false),

  /**
   * Scrap at a step means more must enter the step before it. Off treats the
   * order quantity as the input quantity at every step, which understates
   * materials for anything with real losses.
   */
  compoundScrapThroughRouting: z.boolean().default(true),

  /** Let a run be scheduled onto a work centre already at capacity. */
  allowOverload: z.boolean().default(true),
  /** Days ahead the capacity report looks. */
  capacityHorizonDays: z.number().int().min(1).max(365).default(14),
  /** Utilisation above this is reported as overloaded. */
  overloadThresholdPercent: z.number().min(50).max(200).default(100),

  /** Decimal places for computed minutes and costs. */
  roundMinutesTo: z.number().int().min(0).max(4).default(1),
})

export const subscriptionSchema = z.object({
  /**
   * Which world this install lives in.
   *
   * "cloud" reconciles against Stripe; "self_hosted" trusts a signed licence
   * and never calls out. The difference is not cosmetic — a self-hosted
   * install must keep working with no network, so nothing may block on a
   * billing round-trip.
   */
  deploymentMode: z.enum(["cloud", "self_hosted"]).default("cloud"),

  /**
   * Days a lapsed subscription keeps working.
   *
   * A card that fails on a Friday should not stop a warehouse dispatching on
   * Saturday. Collections is a different problem from access.
   */
  graceDays: z.number().int().min(0).max(90).default(14),

  /** Trial length for a new company when the plan itself sets none. */
  defaultTrialDays: z.number().int().min(0).max(365).default(14),

  /**
   * Whether hitting a plan limit actually refuses the action.
   *
   * Off by default. Turning enforcement on before anyone has seen what it
   * would block is how a billing feature takes out a customer's Monday; the
   * usage figures are visible either way, so run it in the open first.
   */
  enforceLimits: z.boolean().default(false),

  /**
   * Whether an entitlement key the plan has never heard of is refused.
   *
   * Off, because a plan sold last year cannot list a key that shipped this
   * morning, and denying on absence would break every existing customer the
   * moment a new entitlement is added.
   */
  denyUnknownEntitlements: z.boolean().default(false),

  /** Usage at or above this share of a limit is flagged in the UI. */
  warnAtPercent: z.number().min(1).max(100).default(80),

  /** Let the platform run with no subscription at all — dev and evaluation. */
  allowUnlicensedAccess: z.boolean().default(true),

  /** Seats counted from active staff logins, or set by hand. */
  seatCounting: z.enum(["active_users", "manual"]).default("active_users"),

  /** Currency plans are priced and displayed in. */
  billingCurrency: z.string().length(3).default("AUD"),

  /** Show the plan picker and upgrade prompts to non-admins. */
  showPlansToStaff: z.boolean().default(false),
})

export const currencySchema = z.object({
  // The base currency deliberately does not live here. `Company.baseCurrency`
  // already holds it, is what Settings edits and what the invoice and
  // statement PDFs print. A second copy would let the two disagree, and the
  // ledger would be kept in one while documents were printed in the other.

  /**
   * Let a customer be invoiced in a currency other than the base one.
   *
   * Off by default: a business that trades in one currency should not have a
   * currency picker on every order, and the field is a way to get it wrong.
   */
  allowForeignCurrencySales: z.boolean().default(false),

  /**
   * Derive a missing pair through the base currency rather than refusing.
   *
   * Convenient where the house currency is quoted against everything, and
   * worth being able to turn off: a triangulated rate carries both legs'
   * spreads, which is not what a treasury team wants on a contract.
   */
  allowTriangulation: z.boolean().default(true),

  /**
   * Refuse to price an order when the rate in force is older than this.
   *
   * Zero means never refuse. The point is that a stale rate is worse than no
   * rate: it looks authoritative.
   */
  maxRateAgeDays: z.number().int().min(0).max(365).default(7),

  /** Locale used to format money. Affects grouping and symbol placement. */
  displayLocale: z.string().min(2).max(12).default("en-AU"),
})

export const warehouseSchema = z.object({
  /**
   * Walk odd aisles in reverse, so a picker goes up one and back down the
   * next rather than returning to the start of every aisle.
   *
   * On by default because it is almost always shorter. Off suits a layout
   * with one-way aisles or a single entrance per aisle, where the reverse leg
   * is not walkable.
   */
  serpentinePicking: z.boolean().default(true),

  /**
   * Racks in the longest aisle. Only used to reverse the route on odd aisles;
   * too low a number would fold the far end of an aisle back on itself.
   */
  maxRacksPerAisle: z.number().int().min(1).max(999).default(50),

  /** fefo sends the earliest expiry first; route ignores dates and walks. */
  pickStrategy: z.enum(["fefo", "route"]).default("fefo"),

  /**
   * Let a bin exceed its stated capacity.
   *
   * On by default: a capacity is an estimate written once, and refusing a
   * putaway at 5pm because a shelf is nominally full leaves the stock on the
   * floor, which is worse than an over-full bin someone tidies later.
   */
  allowBinOverfill: z.boolean().default(true),

  /** Bin to suggest when nothing else fits — receiving, usually. */
  defaultReceivingZone: z.string().max(4).default("R"),

  /**
   * Refuse to pick from a bin that does not hold enough.
   *
   * Off by default, matching how the rest of the platform ships enforcement:
   * the shortfall is always reported, and whether it blocks is a choice.
   */
  enforceBinQuantities: z.boolean().default(false),
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
  currency: {
    schema: currencySchema,
    label: "Currency & Exchange Rates",
    description: "Base currency, foreign-currency selling, and how missing rates are handled.",
    writeRoles: ["admin", "accounts"],
  },
  warehouse: {
    schema: warehouseSchema,
    label: "Warehouse & Bins",
    description: "Bin layout, the order a picker walks them, putaway and pick strategy.",
    writeRoles: ["admin", "warehouse"],
  },
  subscription: {
    schema: subscriptionSchema,
    label: "Subscription & Licensing",
    description: "Deployment mode, grace period, trial length, plan limit enforcement, and seat counting.",
    writeRoles: ["admin"],
  },
  manufacturing: {
    schema: manufacturingSchema,
    label: "Manufacturing & Routings",
    description: "Work centre defaults, routing scrap and lead time, capacity limits, and whether labour is costed into a run.",
    writeRoles: ["admin", "warehouse"],
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
