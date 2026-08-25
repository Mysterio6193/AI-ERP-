/**
 * Pure algorithms for Financial Anomaly Detection.
 *
 * Evaluates invoices, payments, lines, and reconciliation records for statistical
 * outliers, duplicate charges, pricing drift against contracted lists, tax discrepancies,
 * and ledger reconciliation gaps.
 *
 * All functions are pure and testable in isolation.
 */

export interface RawInvoiceData {
  id: string
  invoiceNumber: string
  customerId: string
  customerName?: string
  invoiceDate: Date | string
  dueDate: Date | string
  subtotal: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  outstandingAmt: number
  status: string
}

export interface InvoiceAnomaly {
  invoiceId: string
  invoiceNumber: string
  customerId: string
  customerName?: string
  severity: "HIGH" | "MEDIUM" | "LOW"
  type:
    | "DUPLICATE_SUSPECT"
    | "STATISTICAL_OUTLIER"
    | "ROUND_NUMBER_OUTLIER"
    | "TAX_MISMATCH"
    | "INVALID_DATES"
    | "OVERPAID"
  reason: string
  amount: number
  suggestedAction: string
}

export interface RawPaymentData {
  id: string
  invoiceId: string
  invoiceNumber?: string
  customerId: string
  customerName?: string
  amount: number
  method: string
  reference?: string | null
  paidAt: Date | string
}

export interface DuplicatePaymentAnomaly {
  severity: "HIGH" | "MEDIUM"
  type: "EXACT_DUPLICATE_PAYMENT" | "SAME_AMOUNT_SAME_DAY" | "OVERPAYMENT_ON_INVOICE"
  payments: RawPaymentData[]
  totalAmount: number
  reason: string
  suggestedAction: string
}

export interface RawLinePriceData {
  lineId: string
  orderId: string
  orderNumber: string
  customerId: string
  customerName?: string
  productId: string
  productName: string
  sku: string
  quantity: number
  invoicedUnitPrice: number
  expectedContractPrice: number
  priceSource: string
  orderDate: Date | string
}

export interface PricingDriftAnomaly {
  lineId: string
  orderNumber: string
  customerId: string
  customerName?: string
  productName: string
  sku: string
  quantity: number
  invoicedUnitPrice: number
  expectedContractPrice: number
  variancePerUnit: number
  varianceTotal: number
  variancePercent: number
  driftType: "UNDERCHARGED" | "OVERCHARGED"
  severity: "HIGH" | "MEDIUM" | "LOW"
}

export interface RawReconciliationItem {
  id: string
  type: "BANK_TX" | "JOURNAL_ENTRY" | "CREDIT_NOTE"
  reference?: string | null
  amount: number
  date: Date | string
  status: string
  matchedDocumentId?: string | null
  description: string
}

export interface ReconciliationAnomaly {
  itemId: string
  type: "UNMATCHED_AGED_TX" | "UNAPPLIED_CREDIT_NOTE" | "UNBALANCED_DRAFT_JOURNAL"
  severity: "HIGH" | "MEDIUM" | "LOW"
  amount: number
  date: string
  description: string
  reason: string
  suggestedAction: string
}

/**
 * Detects anomalies in a batch of invoices.
 */
export function detectInvoiceAnomalies(
  invoices: RawInvoiceData[],
  historicalCustomerAverages?: Map<string, { mean: number; stdDev: number }>
): InvoiceAnomaly[] {
  const anomalies: InvoiceAnomaly[] = []

  // 1. Check duplicate suspects (same customer, same total, within 72 hours)
  const sorted = [...invoices].sort((a, b) => {
    const da = new Date(a.invoiceDate).getTime()
    const db = new Date(b.invoiceDate).getTime()
    return da - db
  })

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]
    const curDate = new Date(current.invoiceDate).getTime()

    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j]
      const nextDate = new Date(next.invoiceDate).getTime()

      // If more than 72 hours (259,200,000 ms) apart, stop checking for this invoice
      if (nextDate - curDate > 259200000) break

      if (
        current.customerId === next.customerId &&
        Math.abs(current.totalAmount - next.totalAmount) < 0.01 &&
        current.id !== next.id
      ) {
        anomalies.push({
          invoiceId: next.id,
          invoiceNumber: next.invoiceNumber,
          customerId: next.customerId,
          customerName: next.customerName,
          severity: "HIGH",
          type: "DUPLICATE_SUSPECT",
          reason: `Potential duplicate of invoice ${current.invoiceNumber}: Identical amount ($${next.totalAmount.toFixed(2)}) issued within 72 hours.`,
          amount: next.totalAmount,
          suggestedAction: "Verify if two identical orders were placed or if this was generated twice.",
        })
      }
    }
  }

  // 2. Per-invoice invariant checks
  for (const inv of invoices) {
    const invDate = new Date(inv.invoiceDate)
    const dueDate = new Date(inv.dueDate)

    // Check invalid dates (due date before invoice date)
    if (!isNaN(invDate.getTime()) && !isNaN(dueDate.getTime()) && dueDate < invDate) {
      anomalies.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customerName,
        severity: "MEDIUM",
        type: "INVALID_DATES",
        reason: `Due date (${dueDate.toISOString().split("T")[0]}) is earlier than invoice date (${invDate.toISOString().split("T")[0]}).`,
        amount: inv.totalAmount,
        suggestedAction: "Correct the invoice payment terms and due date.",
      })
    }

    // Check GST tax calculation (standard Australian GST is 10% on taxable items)
    // If subtotal is positive and tax amount differs significantly from 10% or 0%
    if (inv.subtotal > 0 && inv.taxAmount > 0) {
      const expectedTax = inv.subtotal * 0.1
      const taxDiff = Math.abs(inv.taxAmount - expectedTax)
      if (taxDiff > 0.1 && Math.abs(inv.taxAmount) > 0.01) {
        const actualRate = (inv.taxAmount / inv.subtotal) * 100
        if (Math.abs(actualRate - 10) > 0.5) {
          anomalies.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            customerId: inv.customerId,
            customerName: inv.customerName,
            severity: "LOW",
            type: "TAX_MISMATCH",
            reason: `Tax amount ($${inv.taxAmount.toFixed(2)}) represents ${actualRate.toFixed(1)}% instead of expected 10.0% GST ($${expectedTax.toFixed(2)}).`,
            amount: inv.totalAmount,
            suggestedAction: "Check line-item tax rates or mixed taxable/exempt items.",
          })
        }
      }
    }

    // Check overpayment (paidAmount > totalAmount)
    if (inv.paidAmount > inv.totalAmount + 0.01) {
      anomalies.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customerName,
        severity: "HIGH",
        type: "OVERPAID",
        reason: `Paid amount ($${inv.paidAmount.toFixed(2)}) exceeds total invoice amount ($${inv.totalAmount.toFixed(2)}) by $${(inv.paidAmount - inv.totalAmount).toFixed(2)}.`,
        amount: inv.paidAmount,
        suggestedAction: "Issue a credit note or refund for the overpaid amount.",
      })
    }

    // Check statistical outlier if customer historical baseline exists
    if (historicalCustomerAverages?.has(inv.customerId)) {
      const { mean, stdDev } = historicalCustomerAverages.get(inv.customerId)!
      if (stdDev > 0 && inv.totalAmount > mean + 3.0 * stdDev) {
        const sigma = ((inv.totalAmount - mean) / stdDev).toFixed(1)
        anomalies.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerId: inv.customerId,
          customerName: inv.customerName,
          severity: "MEDIUM",
          type: "STATISTICAL_OUTLIER",
          reason: `Invoice amount ($${inv.totalAmount.toFixed(2)}) is ${sigma}σ above customer's average ($${mean.toFixed(2)}).`,
          amount: inv.totalAmount,
          suggestedAction: "Review line quantities with sales rep before dispatching invoice.",
        })
      }
    }
  }

  return anomalies
}

/**
 * Detects duplicate or suspicious payments.
 */
export function detectDuplicatePayments(payments: RawPaymentData[]): DuplicatePaymentAnomaly[] {
  const anomalies: DuplicatePaymentAnomaly[] = []
  const visited = new Set<string>()

  for (let i = 0; i < payments.length; i++) {
    const current = payments[i]
    if (visited.has(current.id)) continue

    const duplicates: RawPaymentData[] = [current]
    const curTime = new Date(current.paidAt).getTime()

    for (let j = i + 1; j < payments.length; j++) {
      const candidate = payments[j]
      if (visited.has(candidate.id)) continue

      const candidateTime = new Date(candidate.paidAt).getTime()
      const timeDiffHours = Math.abs(candidateTime - curTime) / 3600000

      // Match conditions: same customer & same amount
      if (
        current.customerId === candidate.customerId &&
        Math.abs(current.amount - candidate.amount) < 0.01
      ) {
        // Exact reference duplicate or within 24 hours
        const sameRef =
          current.reference &&
          candidate.reference &&
          current.reference.trim().toLowerCase() === candidate.reference.trim().toLowerCase()

        if (sameRef || timeDiffHours <= 24) {
          duplicates.push(candidate)
          visited.add(candidate.id)
        }
      }
    }

    if (duplicates.length > 1) {
      visited.add(current.id)
      const isExactRef = duplicates.some(
        (d, idx) => idx > 0 && d.reference && d.reference === current.reference
      )

      anomalies.push({
        severity: "HIGH",
        type: isExactRef ? "EXACT_DUPLICATE_PAYMENT" : "SAME_AMOUNT_SAME_DAY",
        payments: duplicates,
        totalAmount: duplicates.reduce((sum, p) => sum + p.amount, 0),
        reason: `${duplicates.length} identical payments of $${current.amount.toFixed(2)} recorded for ${current.customerName || "customer"} within 24h${isExactRef ? " with identical reference" : ""}.`,
        suggestedAction: "Check bank settlement records and void duplicate transaction if unconfirmed.",
      })
    }
  }

  return anomalies
}

/**
 * Compares invoiced line item prices with contracted prices to detect pricing drift.
 */
export function detectPricingDrift(
  lines: RawLinePriceData[],
  thresholdPercent = 5.0
): PricingDriftAnomaly[] {
  const anomalies: PricingDriftAnomaly[] = []

  for (const line of lines) {
    if (line.expectedContractPrice <= 0 || line.invoicedUnitPrice <= 0) continue

    const diff = line.invoicedUnitPrice - line.expectedContractPrice
    const variancePercent = Math.abs((diff / line.expectedContractPrice) * 100)

    if (variancePercent >= thresholdPercent && Math.abs(diff) >= 0.1) {
      const varianceTotal = Number((diff * line.quantity).toFixed(2))
      const driftType = diff < 0 ? "UNDERCHARGED" : "OVERCHARGED"
      const severity =
        Math.abs(varianceTotal) >= 200 || variancePercent >= 20
          ? "HIGH"
          : Math.abs(varianceTotal) >= 50 || variancePercent >= 10
          ? "MEDIUM"
          : "LOW"

      anomalies.push({
        lineId: line.lineId,
        orderNumber: line.orderNumber,
        customerId: line.customerId,
        customerName: line.customerName,
        productName: line.productName,
        sku: line.sku,
        quantity: line.quantity,
        invoicedUnitPrice: line.invoicedUnitPrice,
        expectedContractPrice: line.expectedContractPrice,
        variancePerUnit: Number(diff.toFixed(2)),
        varianceTotal,
        variancePercent: Number(variancePercent.toFixed(1)),
        driftType,
        severity,
      })
    }
  }

  return anomalies.sort((a, b) => Math.abs(b.varianceTotal) - Math.abs(a.varianceTotal))
}

/**
 * Detects reconciliation anomalies across bank transactions, unapplied credits, and journals.
 */
export function detectReconciliationAnomalies(
  items: RawReconciliationItem[],
  referenceDate = new Date()
): ReconciliationAnomaly[] {
  const anomalies: ReconciliationAnomaly[] = []
  const refTime = referenceDate.getTime()

  for (const item of items) {
    const itemTime = new Date(item.date).getTime()
    const ageDays = isNaN(itemTime) ? 0 : Math.floor((refTime - itemTime) / 86400000)

    if (item.type === "BANK_TX" && item.status === "unmatched" && ageDays >= 14) {
      anomalies.push({
        itemId: item.id,
        type: "UNMATCHED_AGED_TX",
        severity: ageDays >= 30 ? "HIGH" : "MEDIUM",
        amount: item.amount,
        date: new Date(item.date).toISOString().split("T")[0],
        description: item.description,
        reason: `Unmatched bank transaction of $${item.amount.toFixed(2)} has been open for ${ageDays} days.`,
        suggestedAction: "Match against an outstanding invoice or allocate to an expense account.",
      })
    }

    if (item.type === "CREDIT_NOTE" && item.status === "active" && ageDays >= 45) {
      anomalies.push({
        itemId: item.id,
        type: "UNAPPLIED_CREDIT_NOTE",
        severity: "LOW",
        amount: item.amount,
        date: new Date(item.date).toISOString().split("T")[0],
        description: item.description,
        reason: `Active credit note of $${item.amount.toFixed(2)} unapplied for ${ageDays} days.`,
        suggestedAction: "Apply credit note to customer's next invoice or process refund.",
      })
    }

    if (item.type === "JOURNAL_ENTRY" && item.status === "draft" && ageDays >= 7) {
      anomalies.push({
        itemId: item.id,
        type: "UNBALANCED_DRAFT_JOURNAL",
        severity: "MEDIUM",
        amount: item.amount,
        date: new Date(item.date).toISOString().split("T")[0],
        description: item.description,
        reason: `Draft journal entry has remained unposted for ${ageDays} days.`,
        suggestedAction: "Review debit/credit balance and post or void the draft entry.",
      })
    }
  }

  return anomalies
}
