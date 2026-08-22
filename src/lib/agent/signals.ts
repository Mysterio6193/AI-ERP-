import { expiringBatches } from "@/lib/batches"
import { findLapsedAccounts } from "@/lib/crm"
import { db } from "@/lib/db"

/**
 * What is worth interrupting a person about.
 *
 * The hard part of an always-on agent is not noticing things - it is noticing
 * few enough things. Every signal here has a threshold, and the thresholds are
 * set so a quiet day produces nothing at all. If this ever fires on a normal
 * Tuesday, the threshold is wrong, not the person ignoring it.
 *
 * Signals are facts, not messages: severity and a stable dedupe key, with the
 * wording left to the caller.
 */

export interface Signal {
  kind: string
  severity: "info" | "warn" | "urgent"
  /** Identifies the underlying fact, so it is not re-raised each tick. */
  dedupeKey: string
  title: string
  body: string
  entityType?: string
  entityId?: string
  /** Sorted descending; higher interrupts sooner. */
  weight: number
  cooldownHours?: number
}

export interface SignalThresholds {
  /** Invoice must be at least this overdue AND this large. */
  overdueDays: number
  overdueAmount: number
  /** A pending approval older than this is chased. */
  approvalStaleHours: number
  /** Only alert on lapsed accounts worth at least this per month. */
  lapsedMonthlyValue: number
  /** Stock at or below reorder level on an item sold this often recently. */
  stockOutMinOrders: number
  /** Freight booking still unsent this many hours before the carrier cutoff. */
  freightCutoffWarningHours: number
  /** Warn this many days before stock expires. */
  expiryWarningDays: number
  /** Only worth mentioning above this value of stock at risk. */
  expiryMinValue: number
}

/** Stock nearing its date, while there is still time to move it. */
async function expiringStock(thresholds: SignalThresholds): Promise<Signal[]> {
  const batches = await expiringBatches(thresholds.expiryWarningDays)

  return batches
    .filter((batch) => batch.valueAtRisk >= thresholds.expiryMinValue)
    .slice(0, 5)
    .map((batch) => ({
      kind: "stock_expiring",
      // Already past date is a write-off, not a warning.
      severity: batch.expired ? "urgent" : ("warn" as const),
      dedupeKey: `expiring:${batch.id}`,
      title: batch.expired
        ? `Expired: ${batch.product}`
        : `${batch.product} expires in ${batch.daysRemaining} days`,
      body: `Batch ${batch.batchCode} at ${batch.warehouse} — ${batch.quantity} units, about ${money(batch.valueAtRisk)}.${
        batch.expired ? " Already past date and blocked from picking." : " Sell or discount it now."
      }`,
      entityType: "inventory_batch",
      entityId: batch.id,
      weight: batch.expired ? 88 : 75,
      cooldownHours: 24 * 3,
    }))
}

export const DEFAULT_THRESHOLDS: SignalThresholds = {
  overdueDays: 14,
  overdueAmount: 500,
  approvalStaleHours: 4,
  lapsedMonthlyValue: 500,
  stockOutMinOrders: 2,
  freightCutoffWarningHours: 3,
  expiryWarningDays: 21,
  expiryMinValue: 250,
}

function money(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function hoursSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 3600_000)
}

function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 86400_000)
}

/** Money owed, old enough and large enough to chase. */
async function overdueInvoices(thresholds: SignalThresholds): Promise<Signal[]> {
  const cutoff = new Date(Date.now() - thresholds.overdueDays * 86400_000)

  const invoices = await db.invoice.findMany({
    where: {
      status: { in: ["unpaid", "partial", "overdue"] },
      dueDate: { lt: cutoff },
      outstandingAmt: { gte: thresholds.overdueAmount },
    },
    orderBy: { outstandingAmt: "desc" },
    take: 5,
    select: {
      id: true,
      invoiceNumber: true,
      outstandingAmt: true,
      dueDate: true,
      customer: { select: { name: true } },
    },
  })

  return invoices.map((invoice) => ({
    kind: "overdue_invoice",
    severity: invoice.outstandingAmt >= thresholds.overdueAmount * 4 ? "urgent" : "warn",
    dedupeKey: `overdue-invoice:${invoice.id}`,
    title: `${invoice.customer.name} owes ${money(invoice.outstandingAmt)}`,
    body: `${invoice.invoiceNumber} is ${daysSince(invoice.dueDate)} days past due.`,
    entityType: "invoice",
    entityId: invoice.id,
    weight: 80 + Math.min(invoice.outstandingAmt / 1000, 15),
    // Chasing the same debt daily is nagging; weekly is a reminder.
    cooldownHours: 24 * 7,
  }))
}

/** Approvals the agent is blocked on. */
async function staleApprovals(thresholds: SignalThresholds): Promise<Signal[]> {
  const cutoff = new Date(Date.now() - thresholds.approvalStaleHours * 3600_000)

  const proposals = await db.agentProposal.findMany({
    where: { status: "pending", createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, summary: true, createdAt: true, valueAmount: true, risk: true },
  })

  return proposals.map((proposal) => ({
    kind: "pending_approval",
    severity: proposal.risk === "high" ? "warn" : "info",
    dedupeKey: `pending-approval:${proposal.id}`,
    title: "Waiting on your decision",
    body: `${proposal.summary}${
      proposal.valueAmount ? ` (${money(proposal.valueAmount)})` : ""
    } — pending ${hoursSince(proposal.createdAt)}h.`,
    entityType: "proposal",
    entityId: proposal.id,
    weight: 90,
    cooldownHours: 12,
  }))
}

/** Regular buyers who have gone quiet, worth enough to be worth a call. */
async function lapsedAccounts(thresholds: SignalThresholds): Promise<Signal[]> {
  const lapsed = await findLapsedAccounts({ limit: 5 })

  return lapsed
    .filter((account) => account.monthlyValueAtRisk >= thresholds.lapsedMonthlyValue)
    .map((account) => ({
      kind: "lapsed_account",
      severity: "warn" as const,
      dedupeKey: `lapsed:${account.customerId}`,
      title: `${account.customer} has gone quiet`,
      body: `Usually orders every ${account.usualGapDays} days, silent ${account.daysSinceLastOrder}. About ${money(account.monthlyValueAtRisk)}/month at risk.`,
      entityType: "customer",
      entityId: account.customerId,
      weight: 70,
      cooldownHours: 24 * 5,
    }))
}

/** Stock that has run out on something actually selling. */
async function stockOuts(thresholds: SignalThresholds): Promise<Signal[]> {
  const since = new Date(Date.now() - 30 * 86400_000)

  const rows = await db.inventory.findMany({
    where: { quantity: { lte: 0 } },
    take: 20,
    select: {
      id: true,
      quantity: true,
      product: { select: { id: true, name: true, sku: true } },
      warehouse: { select: { name: true } },
    },
  })

  if (!rows.length) {
    return []
  }

  // Only worth an interruption if it is a line people are actually ordering.
  const recentSales = await db.salesOrderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: rows.map((row) => row.product.id) },
      order: { orderDate: { gte: since }, status: { notIn: ["draft", "cancelled"] } },
    },
    _count: { productId: true },
  })

  const salesByProduct = new Map(recentSales.map((row) => [row.productId, row._count.productId]))

  return rows
    .filter((row) => (salesByProduct.get(row.product.id) || 0) >= thresholds.stockOutMinOrders)
    .slice(0, 5)
    .map((row) => ({
      kind: "stock_out",
      severity: "urgent" as const,
      dedupeKey: `stock-out:${row.id}`,
      title: `Out of stock: ${row.product.name}`,
      body: `${row.product.sku} at ${row.warehouse.name} is at ${row.quantity}, with ${salesByProduct.get(row.product.id)} orders in the last 30 days.`,
      entityType: "inventory",
      entityId: row.id,
      weight: 85,
      cooldownHours: 24 * 2,
    }))
}

/**
 * Freight drafted but never sent.
 *
 * Specific to this business: delivery is subcontracted and carriers have daily
 * cutoffs, so a booking sitting in draft past the cutoff silently becomes a
 * missed delivery day.
 */
async function unsentFreight(thresholds: SignalThresholds): Promise<Signal[]> {
  const bookings = await db.freightBooking.findMany({
    where: { status: "draft" },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: {
      id: true,
      bookingNumber: true,
      createdAt: true,
      carrier: { select: { name: true, cutoffTime: true } },
    },
  })

  const now = new Date()

  return bookings
    .filter((booking) => {
      const cutoff = booking.carrier.cutoffTime
      if (!cutoff) {
        // No cutoff configured: chase anything left overnight.
        return hoursSince(booking.createdAt) >= 12
      }

      const [hour, minute] = cutoff.split(":").map(Number)
      if (!Number.isFinite(hour)) {
        return false
      }

      const cutoffToday = new Date(now)
      cutoffToday.setHours(hour, minute || 0, 0, 0)

      const hoursLeft = (cutoffToday.getTime() - now.getTime()) / 3600_000
      return hoursLeft > 0 && hoursLeft <= thresholds.freightCutoffWarningHours
    })
    .slice(0, 5)
    .map((booking) => ({
      kind: "freight_cutoff",
      severity: "urgent" as const,
      dedupeKey: `freight-cutoff:${booking.id}:${now.toISOString().slice(0, 10)}`,
      title: `Booking not sent: ${booking.carrier.name}`,
      body: `${booking.bookingNumber} is still a draft and ${booking.carrier.name} cuts off at ${booking.carrier.cutoffTime}.`,
      entityType: "freight_booking",
      entityId: booking.id,
      weight: 95,
      cooldownHours: 6,
    }))
}

/**
 * Everything currently worth saying, most important first.
 *
 * Returns an empty array on a normal day, which is the intended outcome.
 */
export async function collectSignals(
  thresholds: SignalThresholds = DEFAULT_THRESHOLDS
): Promise<Signal[]> {
  const groups = await Promise.all([
    staleApprovals(thresholds),
    unsentFreight(thresholds),
    stockOuts(thresholds),
    expiringStock(thresholds),
    overdueInvoices(thresholds),
    lapsedAccounts(thresholds),
  ])

  return groups.flat().sort((a, b) => b.weight - a.weight)
}
