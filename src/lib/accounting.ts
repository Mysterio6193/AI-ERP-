import { db } from "@/lib/db"

const prisma = db as any

type ChartSeed = {
  code: string
  name: string
  accountType: string
  subType?: string
  normalSide: "debit" | "credit"
  description?: string
  isSystem?: boolean
}

const DEFAULT_CHART: ChartSeed[] = [
  { code: "1000", name: "Operating Bank", accountType: "asset", subType: "bank", normalSide: "debit", isSystem: true },
  { code: "1100", name: "Accounts Receivable", accountType: "asset", subType: "current_asset", normalSide: "debit", isSystem: true },
  { code: "1200", name: "Inventory", accountType: "asset", subType: "current_asset", normalSide: "debit", isSystem: true },
  { code: "1300", name: "Prepaid Expenses", accountType: "asset", subType: "current_asset", normalSide: "debit" },
  { code: "2000", name: "Accounts Payable", accountType: "liability", subType: "current_liability", normalSide: "credit", isSystem: true },
  { code: "2050", name: "Goods Received Not Invoiced", accountType: "liability", subType: "current_liability", normalSide: "credit", isSystem: true, description: "Stock received that the supplier has not yet billed." },
  { code: "2100", name: "GST / Tax Payable", accountType: "liability", subType: "tax", normalSide: "credit", isSystem: true },
  { code: "3000", name: "Owner Equity", accountType: "equity", subType: "equity", normalSide: "credit", isSystem: true },
  { code: "4000", name: "Sales Revenue", accountType: "revenue", subType: "income", normalSide: "credit", isSystem: true },
  { code: "4100", name: "Delivery Revenue", accountType: "revenue", subType: "income", normalSide: "credit" },
  { code: "5000", name: "Cost of Goods Sold", accountType: "expense", subType: "cogs", normalSide: "debit", isSystem: true },
  { code: "6100", name: "Bank Fees", accountType: "expense", subType: "operating_expense", normalSide: "debit" },
  { code: "6200", name: "Rent & Occupancy", accountType: "expense", subType: "operating_expense", normalSide: "debit" },
  { code: "6300", name: "Utilities", accountType: "expense", subType: "operating_expense", normalSide: "debit" },
  { code: "6400", name: "Marketing", accountType: "expense", subType: "operating_expense", normalSide: "debit" },
  { code: "6500", name: "Salaries & Wages", accountType: "expense", subType: "operating_expense", normalSide: "debit" },
  { code: "6600", name: "Travel", accountType: "expense", subType: "operating_expense", normalSide: "debit" },
  { code: "6700", name: "Supplies", accountType: "expense", subType: "operating_expense", normalSide: "debit" },
  { code: "6900", name: "General Expenses", accountType: "expense", subType: "operating_expense", normalSide: "debit" },
]

export const ACCOUNTING_PROVIDERS = [
  { provider: "xero", category: "accounting", displayName: "Xero" },
  { provider: "quickbooks", category: "accounting", displayName: "QuickBooks" },
  { provider: "myob", category: "accounting", displayName: "MYOB" },
  { provider: "bank_feed", category: "banking", displayName: "Bank Feed" },
] as const

export async function getDefaultCompany() {
  return prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
  })
}

export async function getDefaultCompanyId() {
  const company = await getDefaultCompany()
  return company?.id || null
}

export async function ensureDefaultChartOfAccounts(companyId?: string | null) {
  if (!companyId) return []

  // Fill gaps rather than seed-once. This used to be "if the company has no
  // accounts at all, create them", which meant adding an account to
  // DEFAULT_CHART later silently did nothing for every existing company — the
  // new code simply never appeared, and the first posting that referenced it
  // failed.
  const existing = await prisma.chartOfAccount.findMany({
    where: { companyId },
    select: { code: true },
  })

  const present = new Set(existing.map((account: { code: string }) => account.code))
  const missing = DEFAULT_CHART.filter((account) => !present.has(account.code))

  if (missing.length > 0) {
    await prisma.chartOfAccount.createMany({
      data: missing.map((account) => ({
        ...account,
        companyId,
        status: "active",
      })),
      // Never overwrite an account someone has renamed or transacted against.
      skipDuplicates: true,
    })
  }

  return prisma.chartOfAccount.findMany({
    where: { companyId },
    orderBy: [{ code: "asc" }],
  })
}

export async function ensureDefaultBankAccount(companyId?: string | null) {
  if (!companyId) return null

  const existing = await prisma.bankAccount.findFirst({
    where: { companyId, isDefault: true },
  })

  if (existing) {
    return existing
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
  })

  return prisma.bankAccount.create({
    data: {
      name: "Operating Account",
      bankName: company?.bankName || "Primary Bank",
      accountNumber: company?.accountNumber || "Not set",
      bsb: company?.bsb || null,
      ifscCode: company?.ifscCode || null,
      upiId: company?.upiId || null,
      currency: company?.baseCurrency || "AUD",
      currentBalance: 0,
      isDefault: true,
      provider: "manual",
      connectionStatus: "manual",
      companyId,
    },
  })
}

export async function ensureAccountingIntegrations(companyId?: string | null) {
  if (!companyId) return []

  for (const integration of ACCOUNTING_PROVIDERS) {
    await prisma.accountingIntegration.upsert({
      where: {
        provider_companyId: {
          provider: integration.provider,
          companyId,
        },
      },
      update: {},
      create: {
        provider: integration.provider,
        category: integration.category,
        displayName: integration.displayName,
        companyId,
      },
    })
  }

  return prisma.accountingIntegration.findMany({
    where: { companyId },
    orderBy: [{ category: "asc" }, { provider: "asc" }],
  })
}

export async function recalculateBankAccountBalance(bankAccountId: string) {
  const account = await prisma.bankAccount.findUnique({
    where: { id: bankAccountId },
    include: {
      transactions: true,
    },
  })

  if (!account) return null

  const currentBalance = (account.transactions || []).reduce((sum: number, transaction: any) => {
    return sum + Number(transaction.amount || 0)
  }, 0)

  return prisma.bankAccount.update({
    where: { id: bankAccountId },
    data: { currentBalance },
  })
}

export async function refreshReconciliationSession(sessionId: string) {
  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
    include: {
      bankAccount: true,
      transactions: true,
    },
  })

  if (!session) return null

  const matchedCount = (session.transactions || []).filter((item: any) => item.status === "matched").length
  const unmatchedCount = (session.transactions || []).filter((item: any) => item.status !== "matched").length
  const systemBalance = (session.transactions || []).reduce((sum: number, transaction: any) => sum + Number(transaction.amount || 0), 0)
  const difference = Number((session.statementBalance - systemBalance).toFixed(2))
  const status = difference === 0 && unmatchedCount === 0 ? "balanced" : unmatchedCount > 0 ? "review_required" : "in_progress"

  return prisma.reconciliationSession.update({
    where: { id: sessionId },
    data: {
      matchedCount,
      unmatchedCount,
      systemBalance,
      difference,
      status,
    },
  })
}

export function safeJsonParse<T>(value?: string | null, fallback?: T): T | null {
  if (!value) {
    return fallback ?? null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback ?? null
  }
}

export function buildEntryNumber(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)
  return `${prefix}-${stamp}`
}
