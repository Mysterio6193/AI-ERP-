import type { ToolSet } from "ai"

import type { AgentPrincipal } from "../context"
import type { ToolPolicyMeta } from "../policy"
import { buildCatalogTools } from "./catalog"
import { buildChannelTools } from "./channels"
import { buildContactTools } from "./contacts"
import { buildCrmTools } from "./crm"
import { buildDelegationTools } from "./delegation"
import { buildDocumentTools } from "./documents"
import { buildFinanceTools } from "./finance"
import { buildFoodSafetyTools } from "./foodsafety"
import { buildFreightTools } from "./freight"
import { buildFulfilmentTools } from "./fulfilment"
import { buildGeneralTools } from "./general"
import { buildHistoryTools } from "./history"
import { buildInterpreterTools } from "./interpreter"
import { buildManufacturingTools } from "./manufacturing"
import { buildMarketingTools } from "./marketing"
import { buildMcpTools } from "./mcp"
import { buildMemoryTools } from "./memory"
import { buildNotificationTools } from "./notifications"
import { buildOcrTools } from "./ocr"
import { buildPriceListTools } from "./pricing-tiers"
import { buildReturnTools } from "./returns"
import { buildRouteTools } from "./routes"
import { buildAutomationTools } from "./automation"
import { buildCalendarTools } from "./calendar"
import { buildEmailTools } from "./email"
import { buildMultiAgentTools } from "./multi-agent"
import { buildSpreadsheetTools } from "./spreadsheets"
import { buildSettingsTools } from "./settings"
import { buildPipelineTools } from "./pipeline"
import { buildPurchasingTools } from "./purchasing"
import { buildReportingTools } from "./reporting"
import { buildSalesTools } from "./sales"
import { buildSkillTools } from "./skills"
import { buildUnitTools } from "./units"
import { buildAnalyticsTools } from "./analytics"
import { buildDeepOperationsTools } from "./operations-deep"
import { buildUniversalTools } from "./universal"
import { buildWebSearchTools } from "./websearch"
import { buildXeroTools } from "./xero-tools"
import { buildSalesforceTools } from "./salesforce-tools"
import { buildEcommerceTools } from "./ecommerce-tools"
import { buildAdvancedInventoryTools } from "./inventory-advanced"
import { buildWebhookTools } from "./webhooks-tools"
import { TOOL_NAMES } from "./define"

/**
 * The tool registry.
 *
 * Tools live in one module per business domain and are built per-principal, so
 * customer isolation is structural rather than prompted: a customer's tools
 * close over their own customerId and physically cannot query another account,
 * and staff-only domains return nothing at all for them.
 *
 * TOOL_POLICY carries the risk metadata the policy engine reads before any
 * write is dispatched. A tool missing from this table is denied by default -
 * adding a tool without classifying it fails closed, not open.
 */

export const TOOL_POLICY: Record<string, ToolPolicyMeta> = {
  // Automation and multi-agent. These were defined, listed in agent
  // allowlists, and never spread into buildTools or registered here — so the
  // ops prompt told the agent to "use spawnAgentTask" for a tool that did not
  // reach it, and `decide()` would have denied it even if it had.
  //
  // Risk is set conservatively: setting another agent running is a write.
  //
  // Automation: reads are open, anything that schedules future work or writes
  // a standing rule stops for a person, because it keeps producing work after
  // the turn ends.
  translateText: { risk: "read" },
  summarizeThread: { risk: "read" },
  generateQrCode: { risk: "read" },
  setReminder: { risk: "low" },
  createChecklist: { risk: "low" },
  createRecurringReport: { risk: "high", roles: ["admin"], alwaysApprove: true },
  createWorkflow: { risk: "high", roles: ["admin"], alwaysApprove: true },
  listAvailableAgents: { risk: "read" },
  // Standing configuration: these keep producing work after the turn ends, so
  // a person sees them before they start.
  // One agent starting others is the one that can run away on its own.
  spawnAgentTask: { risk: "high", roles: ["admin"], alwaysApprove: true },
  agentSwarm: { risk: "high", roles: ["admin"], alwaysApprove: true },
  agentHandoff: { risk: "medium", roles: ["admin"] },
  broadcastToAgents: { risk: "high", roles: ["admin"], alwaysApprove: true },

  // Settings. Reads are open to admins; writes reshape every figure the
  // platform produces, so they always stop for a person regardless of value.
  listSettings: { risk: "read", roles: ["admin"] },
  getSetting: { risk: "read", roles: ["admin"] },
  proposeSettingChange: { risk: "high", roles: ["admin"], alwaysApprove: true },
  resetSetting: { risk: "high", roles: ["admin"], alwaysApprove: true },

  // Catalog
  searchProducts: { risk: "read" },
  createProduct: { risk: "low", roles: ["admin", "sales", "warehouse"] },
  updateProduct: { risk: "low", roles: ["admin", "sales", "warehouse"] },
  // Packing levels. Read-only: how a thing is sold, not what is in stock.
  getProductUnits: { risk: "read" },
  convertQuantity: { risk: "read" },
  getStock: { risk: "read" },
  stockOutlook: { risk: "read" },
  adjustInventory: {
    risk: "medium",
    roles: ["admin", "warehouse"],
    valueField: "quantityDelta",
  },

  // Sales
  listOrders: { risk: "read" },
  getOrder: { risk: "read" },
  quoteBasket: { risk: "read" },
  listQuotes: { risk: "read" },
  createSalesOrder: {
    risk: "medium",
    roles: ["admin", "sales"],
    valueField: "estimatedTotal",
  },
  updateOrderStatus: { risk: "medium", roles: ["admin", "sales", "warehouse"] },

  // CRM
  findCustomers: { risk: "read" },
  getCustomer: { risk: "read" },
  createCustomer: { risk: "low", roles: ["admin", "sales", "accounts"] },
  updateCustomer: { risk: "low", roles: ["admin", "sales", "accounts"] },
  lapsedAccounts: { risk: "read" },
  accountTimeline: { risk: "read" },
  listTasks: { risk: "read" },
  createTask: { risk: "low", roles: ["admin", "sales", "accounts", "warehouse"] },
  completeTask: { risk: "low", roles: ["admin", "sales", "accounts", "warehouse"] },
  logCustomerNote: { risk: "low" },

  // Finance
  listInvoices: { risk: "read" },
  getInvoice: { risk: "read" },
  agedReceivables: { risk: "read" },
  recordPayment: { risk: "high", roles: ["admin", "accounts"], valueField: "amount" },
  setCreditStatus: { risk: "high", roles: ["admin", "accounts"], alwaysApprove: true },

  // Purchasing
  listSuppliers: { risk: "read" },
  createSupplier: { risk: "low", roles: ["admin", "warehouse", "accounts"] },
  updateSupplier: { risk: "low", roles: ["admin", "warehouse", "accounts"] },
  reorderSuggestions: { risk: "read" },
  replenishmentPlan: { risk: "read" },
  linkSuppliersFromHistory: { risk: "medium", roles: ["admin", "warehouse", "accounts"] },
  listPurchaseOrders: { risk: "read" },
  getPurchaseOrder: { risk: "read" },
  createPurchaseOrder: {
    risk: "medium",
    roles: ["admin", "warehouse"],
    valueField: "estimatedTotal",
  },
  receivePurchaseOrder: { risk: "medium", roles: ["admin", "warehouse"] },

  // Contacts, activities and cases
  listContacts: { risk: "read" },
  listActivities: { risk: "read" },
  listCases: { risk: "read" },
  upsertContact: { risk: "low" },
  logActivity: { risk: "low" },
  createCase: { risk: "low" },
  resolveCase: { risk: "low", roles: ["admin", "sales", "accounts", "warehouse"] },

  // Pipeline
  listLeads: { risk: "read" },
  pipelineSummary: { risk: "read" },
  createLead: { risk: "low", roles: ["admin", "sales"] },
  updateLead: { risk: "low", roles: ["admin", "sales"] },
  createOpportunity: { risk: "low", roles: ["admin", "sales"] },
  updateOpportunity: { risk: "low", roles: ["admin", "sales"] },
  convertLead: { risk: "medium", roles: ["admin", "sales"] },
  assignSalesRep: { risk: "low", roles: ["admin", "sales"] },

  // Fulfilment
  trackDelivery: { risk: "read" },
  listPickLists: { risk: "read" },
  listDeliveries: { risk: "read" },
  listRoutes: { risk: "read" },
  createPickList: { risk: "low", roles: ["admin", "warehouse", "sales"] },

  // Marketing. Sending contacts real customers, so it always needs a human.
  previewAudience: { risk: "read" },
  reviewCampaign: { risk: "read" },
  getCampaignRecipients: { risk: "read" },
  previewCampaignSend: { risk: "read" },
  campaignPerformance: { risk: "read" },
  saveSegment: { risk: "low", roles: ["admin", "sales"] },
  writeCampaignMessage: { risk: "low", roles: ["admin", "sales"] },
  recordConsent: { risk: "low" },
  attributeCampaign: { risk: "low", roles: ["admin", "sales"] },
  // Creates draft rows only and contacts nobody; sendCampaign is the gate.
  buildCampaign: { risk: "low", roles: ["admin", "sales"] },
  sendCampaign: { risk: "high", roles: ["admin", "sales"], alwaysApprove: true },

  // Reporting & Enterprise Intelligence
  businessSnapshot: { risk: "read" },
  salesReport: { risk: "read" },
  customerHealthAudit: { risk: "read" },
  priceMarginOptimizer: { risk: "read" },
  draftCommunication: { risk: "read" },

  // Memory. Writes are low risk - they change what the agent knows, never the
  // business - but they are writes, so they are logged like any other.
  recallMemories: { risk: "read" },
  listWhatIKnow: { risk: "read" },
  remember: { risk: "low" },
  forgetMemory: { risk: "low" },

  // Food safety. Reads are free; quarantining stops stock shipping, and
  // releasing it lets suspect stock back out, so both need a human.
  getBatches: { risk: "read" },
  expiringStock: { risk: "read" },
  checkStockAvailability: { risk: "read" },
  checkAllergens: { risk: "read" },
  auditAllergenDeclarations: { risk: "read" },
  quarantineStock: { risk: "high", roles: ["admin", "warehouse"], alwaysApprove: true },
  releaseStock: { risk: "high", roles: ["admin", "warehouse"], alwaysApprove: true },
  traceBatch: { risk: "read" },

  // History. Read-only over conversations the principal may already see.
  searchHistory: { risk: "read" },
  readConversation: { risk: "read" },

  // Skills. Procedural memory: writes change what the agent knows how to do,
  // never the business itself.
  listSkills: { risk: "read" },
  readSkill: { risk: "read" },
  createSkill: { risk: "low" },
  improveSkill: { risk: "low" },
  recordSkillOutcome: { risk: "low" },

  // General Digital Problem Solving & Hermes Intelligence
  planTask: { risk: "read" },
  scratchpadNote: { risk: "read" },
  executeCalculation: { risk: "read" },
  runDataAnalysis: { risk: "read" },
  fetchWebPage: { risk: "read" },
  searchWeb: { risk: "read" },

  // The agent's view of its own tools. Reads only.
  checkToolHealth: { risk: "read" },
  acknowledgeToolFault: { risk: "low", roles: ["admin"] },
  searchKnowledge: { risk: "read" },
  generateDiagram: { risk: "read" },
  delegateToAgent: { risk: "read", roles: ["admin", "sales", "warehouse", "accounts"] },
  sendStaffAlert: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },
  sendDirectStaffMessage: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },

  // Model Context Protocol (MCP) & REST API Gateway
  listMcpServers: { risk: "read" },
  callMcpTool: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },
  callGenericApi: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },

  // Document Intelligence & PDF
  scanDocument: { risk: "read" },
  sendDocument: { risk: "low" },
  generateDocumentPdf: { risk: "read" },
  generateReportPdf: { risk: "low" },

  // Communication Channels & Morning Briefings
  listAgentChannels: { risk: "read" },
  generateMorningBriefing: { risk: "read" },
  sendMorningGreeting: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },

  // Group Channels (Telegram Groups)
  listGroupChannels: { risk: "read" },
  updateGroupChannel: { risk: "low", roles: ["admin"] },
  postToGroupChannel: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },

  // Message templates. Both are reads: drafting fills a template in and hands
  // the text back, it does not send anything.
  listMessageTemplates: { risk: "read" },
  draftFromTemplate: { risk: "read" },

  // Manufacturing & BOM Recipes
  listBoms: { risk: "read" },
  mfgMultiLevelBomExplosion: { risk: "read" },
  mfgCapacityAndShiftScheduler: { risk: "read" },
  mfgBatchYieldAndWastage: { risk: "read" },
  mfgHaccpQualityGate: { risk: "low", roles: ["admin", "warehouse"] },
  mfgOeeAndMachinePerformance: { risk: "read" },
  createProductionOrder: { risk: "medium", roles: ["admin", "warehouse"] },
  listProductionOrders: { risk: "read" },

  // Fleet Delivery Routes
  listDeliveryRoutes: { risk: "read" },
  createDeliveryRoute: { risk: "low", roles: ["admin", "warehouse", "sales"] },

  // Returns, RMAs & Credit Notes
  listReturns: { risk: "read" },
  createCustomerReturn: { risk: "low" },

  // Contract Pricing & Tiers
  listPriceLists: { risk: "read" },
  assignCustomerPriceList: { risk: "low", roles: ["admin", "sales"] },

  // Spreadsheets & Data Exports
  generateSpreadsheet: { risk: "read" },
  exportReportToCsv: { risk: "read" },
  parseSpreadsheet: { risk: "read" },

  // Email System & CRM Communication
  sendEmail: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },
  draftEmail: { risk: "read" },
  listCommunicationHistory: { risk: "read" },

  // Calendar & Scheduling
  scheduleMeeting: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },
  listUpcomingEvents: { risk: "read" },

  // Enterprise Analytics & Cashflow
  cashflowForecast: { risk: "read" },
  profitAndLossStatement: { risk: "read" },
  customerRfmSegmentation: { risk: "read" },
  supplierPerformanceScorecard: { risk: "read" },
  taxSummaryGst: { risk: "read" },

  // Deep Operations, Traceability & Supply Chain
  compareSupplierQuotes: { risk: "read" },
  recipeCostingAnalysis: { risk: "read" },
  palletOptimization: { risk: "read" },
  warehouseSlottingAdvisor: { risk: "read" },
  mockRecallSimulation: { risk: "read" },
  creditRiskAssessment: { risk: "read" },

  // Xero & Accounting Integrations
  xeroSyncInvoice: { risk: "low", roles: ["admin", "accounts"] },
  xeroReconcileBankFeed: { risk: "read" },
  xeroChartOfAccounts: { risk: "read" },

  // Salesforce & CRM Suite
  salesforceCustomer360: { risk: "read" },
  salesforceOpportunityPipeline: { risk: "low", roles: ["admin", "sales"] },
  salesforceLeadScoring: { risk: "read" },

  // E-Commerce & Shopify
  ecommerceSyncInventory: { risk: "low", roles: ["admin", "warehouse", "sales"] },
  ecommerceIngestOrder: { risk: "medium", roles: ["admin", "sales"] },
  ecommerceChannelPerformance: { risk: "read" },

  // Advanced Inventory & Landed Cost
  calculateLandedCost: { risk: "read" },
  automatedReplenishmentPlanner: { risk: "read" },

  // Universal Webhooks & Connectors
  triggerWebhook: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },
  listIntegrationConnectors: { risk: "read" },

  // Freight. Drafting writes a row and contacts nobody; sending commits the
  // business to a third party who acts on it immediately, so it is the gate.
  listCarriers: { risk: "read" },
  resolveCarrier: { risk: "read" },
  reviewFreightBooking: { risk: "read" },
  listFreightBookings: { risk: "read" },
  draftFreightBooking: { risk: "low", roles: ["admin", "sales", "warehouse"] },
  sendFreightBooking: {
    risk: "high",
    roles: ["admin", "sales", "warehouse"],
    alwaysApprove: true,
  },
}

export function buildTools(principal: AgentPrincipal, channel?: string): ToolSet {
  // Assembled with Object.assign rather than one big object literal.
  //
  // Spreading ~30 builders into a single literal makes TypeScript compute the
  // union of every possible shape, and staff-only domains collapsing to {} for
  // customers multiplies it further. At 29 builders that exceeded the compiler's
  // limit outright — "union type that is too complex to represent" — which made
  // adding a tool a type-system problem rather than a product decision.
  //
  // Each builder still closes over the principal, so customer isolation is
  // unchanged; only the way the results are merged differs.
  // Typed as plain records: a staff-only builder returns `{}` for a customer,
  // and `ToolSet[]` would reject that union rather than widen it.
  const builders: Array<Record<string, unknown>> = [
    buildGeneralTools(principal),
    buildUniversalTools(principal),
    buildMcpTools(principal),
    buildInterpreterTools(principal),
    buildWebSearchTools(principal),
    buildDelegationTools(principal),
    buildNotificationTools(principal),
    buildChannelTools(principal),
    buildCatalogTools(principal),
    buildUnitTools(principal),
    buildSalesTools(principal, channel),
    buildCrmTools(principal),
    buildContactTools(principal),
    buildPipelineTools(principal),
    buildFinanceTools(principal),
    buildFulfilmentTools(principal),
    buildFreightTools(principal),
    buildHistoryTools(principal),
    buildFoodSafetyTools(principal),
    buildMarketingTools(principal),
    buildMemoryTools(principal),
    buildOcrTools(principal),
    buildDocumentTools(principal, channel),
    buildSettingsTools(principal),
    buildAutomationTools(principal),
    buildCalendarTools(principal),
    buildEmailTools(principal),
    buildMultiAgentTools(principal),
    buildSpreadsheetTools(principal, channel),
    buildAnalyticsTools(principal),
    buildDeepOperationsTools(principal),
    buildSkillTools(principal),
    buildPurchasingTools(principal),
    buildReportingTools(principal),
    buildManufacturingTools(principal),
    buildRouteTools(principal),
    buildReturnTools(principal),
    buildPriceListTools(principal),
    buildXeroTools(principal),
    buildSalesforceTools(principal),
    buildEcommerceTools(principal),
    buildAdvancedInventoryTools(principal),
    buildWebhookTools(principal),
  ]

  const assembled = Object.assign({}, ...builders) as ToolSet

  // defineTool never sees the key a tool is registered under, so the mapping
  // from description to name is filled in here. Without it a health record
  // reads as a hash and nobody can tell which tool is broken.
  for (const [name, definition] of Object.entries(assembled)) {
    const description = (definition as { description?: string })?.description
    if (description) TOOL_NAMES.set(description, name)
  }

  return assembled
}

/** Every tool the registry can produce, for settings screens and docs. */
export function listToolNames() {
  return Object.keys(TOOL_POLICY).sort()
}
