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
import { buildSettingsTools } from "./settings"
import { buildPipelineTools } from "./pipeline"
import { buildPurchasingTools } from "./purchasing"
import { buildReportingTools } from "./reporting"
import { buildSalesTools } from "./sales"
import { buildSkillTools } from "./skills"
import { buildUnitTools } from "./units"
import { buildUniversalTools } from "./universal"
import { buildWebSearchTools } from "./websearch"

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
  listPurchaseOrders: { risk: "read" },
  getPurchaseOrder: { risk: "read" },
  createPurchaseOrder: {
    risk: "medium",
    roles: ["admin", "warehouse"],
    valueField: "estimatedTotal",
  },
  receivePurchaseOrder: { risk: "medium", roles: ["admin", "warehouse"] },
  closePurchaseOrder: { risk: "medium", roles: ["admin", "warehouse", "accounts"] },

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
  searchKnowledge: { risk: "read" },
  generateDiagram: { risk: "read" },
  delegateToAgent: { risk: "read", roles: ["admin", "sales", "warehouse", "accounts"] },
  sendStaffAlert: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },

  // Model Context Protocol (MCP) & REST API Gateway
  listMcpServers: { risk: "read" },
  callMcpTool: { risk: "high", roles: ["admin", "sales", "warehouse", "accounts"], alwaysApprove: true },
  callGenericApi: { risk: "high", roles: ["admin", "sales", "warehouse", "accounts"], alwaysApprove: true },

  // Document Intelligence & PDF
  scanDocument: { risk: "read" },
  sendDocument: { risk: "low" },
  generateDocumentPdf: { risk: "read" },

  // Communication Channels & Morning Briefings
  listAgentChannels: { risk: "read" },
  generateMorningBriefing: { risk: "read" },
  sendMorningGreeting: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },

  // Group Channels (Telegram Groups)
  listGroupChannels: { risk: "read" },
  updateGroupChannel: { risk: "low", roles: ["admin"] },
  postToGroupChannel: { risk: "low", roles: ["admin", "sales", "warehouse", "accounts"] },

  // Manufacturing & BOM Recipes
  listBoms: { risk: "read" },
  createProductionOrder: { risk: "medium", roles: ["admin", "warehouse"] },
  listProductionOrders: { risk: "read" },
  updateProductionOrder: { risk: "medium", roles: ["admin", "warehouse", "sales"] },
  completeProductionOrder: { risk: "high", roles: ["admin", "warehouse"] },
  cancelProductionOrder: { risk: "medium", roles: ["admin", "warehouse"] },

  // Fleet Delivery Routes
  listDeliveryRoutes: { risk: "read" },
  createDeliveryRoute: { risk: "low", roles: ["admin", "warehouse", "sales"] },

  // Returns, RMAs & Credit Notes
  listReturns: { risk: "read" },
  createCustomerReturn: { risk: "low" },
  approveReturn: { risk: "medium", roles: ["admin", "sales", "warehouse"] },
  rejectReturn: { risk: "medium", roles: ["admin", "sales"] },
  completeReturn: { risk: "high", roles: ["admin", "warehouse", "accounts"] },

  // Contract Pricing & Tiers
  listPriceLists: { risk: "read" },
  assignCustomerPriceList: { risk: "low", roles: ["admin", "sales"] },

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
  // Staff-only domains collapse to {} for customers, so the union needs
  // widening to ToolSet before the runtime can hand it to the model.
  const tools: ToolSet = {}
  Object.assign(
    tools,
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
    buildSkillTools(principal),
    buildPurchasingTools(principal),
    buildReportingTools(principal),
    buildManufacturingTools(principal),
    buildRouteTools(principal),
    buildReturnTools(principal),
    buildPriceListTools(principal),
  )
  return tools
}

/** Every tool the registry can produce, for settings screens and docs. */
export function listToolNames() {
  return Object.keys(TOOL_POLICY).sort()
}
