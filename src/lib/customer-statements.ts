type StatementCustomer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  creditLimit: number
  creditBalance: number
  creditStatus: string
  paymentTerms: number
  invoices: Array<{
    id: string
    invoiceNumber: string
    invoiceDate: Date
    dueDate: Date
    totalAmount: number
    outstandingAmt: number
    status: string
  }>
  // Prisma now returns Decimal for ledger fields (Postgres); coerce with Number() inside.
  creditTransactions: Array<{
    id: string
    type: string
    amount: number | { toString(): string }
    balanceAfter: number | { toString(): string }
    description: string
    notes: string | null
    referenceType: string | null
    referenceId: string | null
    createdAt: Date
  }>
}

export function getStatementWindow(referenceDate = new Date()) {
  const end = new Date(referenceDate)
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1)
  return { start, end }
}

export function formatStatementNumber(customerName: string, referenceDate = new Date()) {
  const period = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`
  const slug = customerName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18) || "CUSTOMER"
  return `STATEMENT-${slug}-${period}`
}

function getTransactionLabel(transaction: StatementCustomer["creditTransactions"][number]) {
  if (transaction.type === "invoice_charge") return "Invoice posted"
  if (transaction.type === "payment_received") return "Payment received"
  if (transaction.type === "credit_grant") return "Credit limit adjusted"
  if (transaction.type === "refund") return "Refund processed"
  return "Adjustment"
}

function getTransactionStatus(transaction: StatementCustomer["creditTransactions"][number]) {
  if (transaction.type === "invoice_charge") return "Outstanding"
  if (transaction.type === "payment_received") return "Settled"
  if (transaction.type === "refund") return "Settled"
  return "Adjusted"
}

export function buildCustomerStatement(customer: StatementCustomer, referenceDate = new Date()) {
  const { start, end } = getStatementWindow(referenceDate)
  const openInvoices = customer.invoices.filter((invoice) =>
    ["unpaid", "partial", "overdue", "sent"].includes(invoice.status)
  )
  const overdueInvoices = openInvoices.filter((invoice) => invoice.dueDate < end)
  const nextDueDate = openInvoices
    .map((invoice) => invoice.dueDate)
    .sort((a, b) => a.getTime() - b.getTime())[0] || null

  const statementTransactions = customer.creditTransactions
    .filter((transaction) => transaction.createdAt >= start && transaction.createdAt <= end)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const totalCharges = statementTransactions
    .filter((transaction) => transaction.type === "invoice_charge")
    .reduce((sum, transaction) => sum + Math.max(Number(transaction.amount), 0), 0)

  const totalPayments = statementTransactions
    .filter((transaction) => ["payment_received", "refund"].includes(transaction.type))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0)

  const outstandingBalance = openInvoices.reduce((sum, invoice) => sum + invoice.outstandingAmt, 0)
  const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + invoice.outstandingAmt, 0)
  const minimumPaymentDue =
    outstandingBalance <= 0 ? 0 : Math.min(outstandingBalance, overdueAmount > 0 ? overdueAmount : outstandingBalance * 0.2)
  const availableCredit =
    customer.creditLimit > 0 ? Math.max(customer.creditLimit - customer.creditBalance, 0) : null

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      creditLimit: customer.creditLimit,
      creditBalance: customer.creditBalance,
      creditStatus: customer.creditStatus,
      paymentTerms: customer.paymentTerms,
    },
    summary: {
      statementNumber: formatStatementNumber(customer.name, end),
      statementStart: start,
      statementEnd: end,
      creditLimit: customer.creditLimit,
      availableCredit,
      outstandingBalance,
      overdueAmount,
      totalCharges,
      totalPayments,
      minimumPaymentDue,
      nextDueDate,
      creditStatus: customer.creditStatus,
      paymentTerms: customer.paymentTerms,
    },
    invoices: customer.invoices
      .sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime())
      .map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: invoice.totalAmount,
        outstandingAmount: invoice.outstandingAmt,
        status: invoice.status,
      })),
    transactions: statementTransactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.createdAt,
      reference: transaction.referenceId || transaction.id,
      description: transaction.description || getTransactionLabel(transaction),
      type: transaction.type,
      amount: Number(transaction.amount),
      balanceAfter: Number(transaction.balanceAfter),
      status: getTransactionStatus(transaction),
      notes: transaction.notes,
      referenceType: transaction.referenceType,
    })),
  }
}
