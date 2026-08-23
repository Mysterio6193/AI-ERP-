import { db } from "../src/lib/db"

const INITIAL_SKILLS = [
  {
    slug: "onboard-new-customer",
    name: "Onboard New Customer Profile",
    description: "Use when a user provides business details to register and configure a new customer trade account.",
    category: "process",
    tools: ["createCustomer", "createTask", "logCustomerNote"],
    body: `1. Call createCustomer with name, contact person, email, phone, and delivery address.
2. If payment terms were specified (e.g. 14, 30 days) or credit limit requested, include them in the call.
3. Automatically log a welcome task using createTask to assign onboarding follow-up to sales.
4. Reply with customer confirmation, Account ID, and summary of terms.`,
  },
  {
    slug: "quote-and-place-order",
    name: "Quote & Confirm Sales Order",
    description: "Use when a customer or sales rep wants to price items, verify stock availability, and place a confirmed sales order.",
    category: "process",
    tools: ["searchProducts", "getStock", "quoteBasket", "createSalesOrder", "sendDocument"],
    body: `1. Match requested items against inventory using searchProducts.
2. Check available stock with getStock for any potential stockouts.
3. Calculate subtotal, GST (10%), and grand total using quoteBasket.
4. Confirm quantities, line items, and grand total with the user.
5. Create the order with createSalesOrder.
6. If requested, generate and send the PDF confirmation using sendDocument.`,
  },
  {
    slug: "reorder-low-stock-items",
    name: "Automated Low Stock Replenishment",
    description: "Use when checking depleted inventory and raising supplier purchase orders.",
    category: "analysis",
    tools: ["reorderSuggestions", "listSuppliers", "createPurchaseOrder"],
    body: `1. Query reorderSuggestions to identify all products at or below their reorder threshold.
2. Group depleted products by their preferred supplier.
3. Verify supplier lead times and minimum order quantities.
4. Draft purchase orders using createPurchaseOrder with accurate expected delivery dates.
5. Provide a summary of purchase orders raised and expected arrivals.`,
  },
  {
    slug: "reconcile-aged-receivables",
    name: "Aged Receivables Audit & Statement Dispatch",
    description: "Use for collections, auditing overdue invoices, and sending customer statements.",
    category: "analysis",
    tools: ["agedReceivables", "listInvoices", "sendDocument", "createTask"],
    body: `1. Run agedReceivables to inspect 30+, 60+, and 90+ day aging buckets.
2. Inspect individual unpaid invoices with listInvoices.
3. For accounts with overdue balances, generate and dispatch their account statement with sendDocument.
4. Create follow-up tasks with createTask for the accounts team.`,
  },
  {
    slug: "generate-send-document-pdf",
    name: "Instant Document & PDF Dispatch",
    description: "Use whenever a user asks for an invoice, sales order, or statement PDF.",
    category: "process",
    tools: ["sendDocument", "generateDocumentPdf"],
    body: `1. Identify the requested document type ('invoice', 'order', or 'statement') and reference number.
2. Call sendDocument with the reference.
3. The system will compile the PDF server-side and dispatch it directly to the chat/Telegram channel.
4. Confirm document dispatch with file name and size in your text response.`,
  },
  {
    slug: "calculate-custom-margin",
    name: "Evaluate Complex Margin & Pricing Matrix",
    description: "Use to evaluate custom freight, tiered volume discounts, or compound margins.",
    category: "analysis",
    tools: ["executeCalculation", "searchProducts"],
    body: `1. Retrieve unit cost and wholesale price using searchProducts.
2. Use executeCalculation to compute gross margin percentage: ((wholesale - cost) / wholesale) * 100.
3. Compute volume break tiers or pallet shipping markups using math expressions.
4. Return a clear breakdown of margins, markup percentages, and recommended selling price.`,
  },
  {
    slug: "forecast-business-cashflow",
    name: "30/60/90-Day Cashflow & Liquidity Forecast",
    description: "Use to project financial health, incoming receivables, and outgoing supplier payables.",
    category: "analysis",
    tools: ["cashflowForecast", "profitAndLossStatement", "taxSummaryGst"],
    body: `1. Call cashflowForecast with 30, 60, or 90 day horizon.
2. Cross-reference open sales invoice due dates with pending purchase orders.
3. Compute projected net cash buffer or deficit risk.
4. Report actionable steps to accelerate collections or delay supplier terms if cashflow is tight.`,
  },
  {
    slug: "export-erp-dataset-spreadsheet",
    name: "Export Live ERP Data to Spreadsheet",
    description: "Use when a user asks for CSV, Excel, or tabular exports of orders, stock, invoices, or customers.",
    category: "process",
    tools: ["exportReportToCsv", "generateSpreadsheet"],
    body: `1. Identify the target dataset ('sales_orders', 'invoices', 'inventory', 'customers', 'suppliers', 'leads', 'batches').
2. Call exportReportToCsv to extract formatted rows.
3. If custom rows or computed stats are requested, use generateSpreadsheet.
4. Present the preview table and provide the downloadable CSV format.`,
  },
  {
    slug: "dispatch-bulk-customer-email",
    name: "Draft & Dispatch Customer Communications",
    description: "Use to compose, draft, and dispatch professional emails to customers or suppliers.",
    category: "process",
    tools: ["draftEmail", "sendEmail", "listCommunicationHistory"],
    body: `1. Choose the appropriate scenario in draftEmail (order_confirmation, overdue_invoice_reminder, quote_followup, etc.).
2. Tailor tone and custom reference details (order numbers, totals).
3. Review draft copy with user or execute sendEmail directly.
4. Verify communication logging on the customer/supplier CRM timeline.`,
  },
  {
    slug: "run-haccp-recall-simulation",
    name: "HACCP Food Safety Mock Recall Drill",
    description: "Use for food safety mock recalls or actual batch containment investigations.",
    category: "compliance",
    tools: ["mockRecallSimulation", "quarantineStock", "sendStaffAlert"],
    body: `1. Call mockRecallSimulation with target batch number or SKU.
2. Trace backward to supplier receipt and forward to all dispatched customer orders.
3. Isolate remaining warehouse stock immediately using quarantineStock.
4. Generate containment checklist and send emergency staff alert via sendStaffAlert.`,
  },
  {
    slug: "optimize-warehouse-pallet-slotting",
    name: "Warehouse Pallet & Bin Slotting Optimization",
    description: "Use to calculate pallet capacity (Ti x Hi) and optimize warehouse picking zones (ABC analysis).",
    category: "logistics",
    tools: ["palletOptimization", "warehouseSlottingAdvisor"],
    body: `1. For carton shipping, run palletOptimization with dimensions and weight to find maximum Ti/Hi capacity.
2. For warehouse layout, run warehouseSlottingAdvisor to classify items into Class A (high velocity), B, or C.
3. Recommend bin relocations to minimize travel time on the warehouse floor.`,
  },
  {
    slug: "assess-customer-credit-risk",
    name: "Customer Credit Risk & Payment Terms Audit",
    description: "Use when setting credit limits, reviewing delinquent accounts, or onboarding trade credit applicants.",
    category: "finance",
    tools: ["creditRiskAssessment", "setCreditStatus", "logCustomerNote"],
    body: `1. Call creditRiskAssessment with customer ID or business name.
2. Audit credit utilization percentage, overdue invoice count, and days beyond terms.
3. Review credit rating score (0-100) and recommendation tier.
4. Adjust credit limit / status or place on pre-payment holds if required.`,
  },
  {
    slug: "multi-agent-strategic-review",
    name: "360° Multi-Agent Swarm Strategic Review",
    description: "Use for executive decisions, quarterly reviews, or complex business problems requiring multiple perspectives.",
    category: "strategy",
    tools: ["agentSwarm", "broadcastToAgents", "businessSnapshot"],
    body: `1. Formulate the core strategic objective or challenge.
2. Call agentSwarm involving Sales, Warehouse, Accounts, Purchasing, and Compliance agents.
3. Synthesize individual domain analyses into a unified executive action plan.
4. Highlight trade-offs, financial impacts, and risk mitigations.`,
  },
]

async function seedSkills() {
  console.log("Seeding Hermes-grade autonomous business skills...")
  for (const skill of INITIAL_SKILLS) {
    await db.agentSkill.upsert({
      where: { slug: skill.slug },
      create: {
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        content: skill.body,
        category: skill.category,
        toolsJson: JSON.stringify(skill.tools),
        status: "active",
        version: 1,
        useCount: 5,
        successCount: 5,
        failureCount: 0,
      },
      update: {
        name: skill.name,
        description: skill.description,
        content: skill.body,
        category: skill.category,
        toolsJson: JSON.stringify(skill.tools),
        status: "active",
      },
    })
    console.log(`✓ Seeded skill: ${skill.slug} (${skill.name})`)
  }
  console.log("Skills successfully synced!")
}

seedSkills()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
