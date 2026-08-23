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
