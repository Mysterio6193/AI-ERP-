import type { Prisma, PrismaClient } from "@prisma/client"

import { db } from "@/lib/db"
import { postPaymentReceived } from "@/lib/ledger"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * The one place money coming in is recorded.
 *
 * There were three partial implementations: the manual route did it correctly,
 * the agent tool wrote no `CreditTransaction` and never released a credit hold
 * (so a customer stayed blocked after paying), and Stripe and COD did not
 * record payment at all. Any path that takes money now calls this.
 *
 * Four things must happen together or not at all: the `Payment` row, the
 * invoice balance, the customer's credit balance, and the ledger entry. They
 * are in one transaction for that reason.
 */

export interface RecordPaymentInput {
  invoiceId: string
  amount: number
  method?: string
  reference?: string | null
  notes?: string | null
  /** Provider id (Stripe session/intent) for idempotency and reconciliation. */
  externalId?: string | null
  /** Overpayment is refused by default; set true for deliberate credit. */
  allowOverpayment?: boolean
}

export type RecordPaymentResult =
  | { ok: true; paymentId: string; invoiceStatus: string; outstanding: number; creditReleased: boolean }
  | { ok: true; duplicate: true; paymentId: string }
  | { ok: false; error: string }

function round(value: number) {
  return Number(value.toFixed(2))
}

export async function recordPayment(
  input: RecordPaymentInput,
  client: DbClient = db
): Promise<RecordPaymentResult> {
  const amount = round(Number(input.amount))

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Payment amount must be greater than zero" }
  }

  // Providers retry webhooks; the same charge must not be recorded twice.
  if (input.externalId) {
    const existing = await client.payment.findFirst({
      where: { reference: input.externalId },
      select: { id: true },
    })

    if (existing) {
      return { ok: true, duplicate: true, paymentId: existing.id }
    }
  }

  const invoice = await client.invoice.findUnique({
    where: { id: input.invoiceId },
    include: { customer: { select: { id: true, creditBalance: true, creditLimit: true, creditStatus: true } } },
  })

  if (!invoice) {
    return { ok: false, error: "Invoice not found" }
  }

  if (invoice.outstandingAmt <= 0) {
    return { ok: false, error: "Invoice is already fully paid" }
  }

  if (amount > invoice.outstandingAmt && !input.allowOverpayment) {
    return {
      ok: false,
      error: `Payment of ${amount} exceeds the ${invoice.outstandingAmt} outstanding`,
    }
  }

  const applied = Math.min(amount, invoice.outstandingAmt)
  const newPaid = round(invoice.paidAmount + applied)
  const newOutstanding = round(invoice.outstandingAmt - applied)
  const newStatus = newOutstanding <= 0 ? "paid" : "partial"

  // Clamped at zero because a credit balance below zero is meaningless here,
  // but the clamp hides pre-existing drift - worth surfacing if it ever fires.
  const projectedBalance = Math.max(0, round(invoice.customer.creditBalance - applied))
  const creditReleased =
    invoice.customer.creditStatus === "on_hold" &&
    (invoice.customer.creditLimit <= 0 || projectedBalance <= invoice.customer.creditLimit)

  const payment = await client.payment.create({
    data: {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amount: applied,
      method: input.method || "bank_transfer",
      // The provider id lives in `reference` so the duplicate check above can
      // find it; a human reference falls back to the same field.
      reference: input.externalId || input.reference || null,
      notes: input.notes || null,
    },
  })

  // Cash in, receivable down. Idempotent on the payment id, so the Stripe
  // webhook retrying cannot post the same money twice.
  await postPaymentReceived(client, payment.id)

  await client.invoice.update({
    where: { id: invoice.id },
    data: { paidAmount: newPaid, outstandingAmt: newOutstanding, status: newStatus },
  })

  await client.customer.update({
    where: { id: invoice.customerId },
    data: {
      // Atomic, so a concurrent invoice charge cannot be lost.
      creditBalance: { decrement: applied },
      ...(creditReleased ? { creditStatus: "active" } : {}),
    },
  })

  await client.creditTransaction.create({
    data: {
      customerId: invoice.customerId,
      type: "payment_received",
      amount: -applied,
      balanceAfter: projectedBalance,
      description: `Payment received for invoice ${invoice.invoiceNumber}`,
      notes: input.method ? `Paid via ${input.method}` : null,
      referenceType: "payment",
      referenceId: payment.id,
    },
  })

  return {
    ok: true,
    paymentId: payment.id,
    invoiceStatus: newStatus,
    outstanding: newOutstanding,
    creditReleased,
  }
}

/** Wraps `recordPayment` in its own transaction for callers not already in one. */
export async function recordPaymentAtomic(input: RecordPaymentInput) {
  return db.$transaction(async (tx) => recordPayment(input, tx))
}

/**
 * Finds the invoice a Stripe session or COD delivery relates to.
 *
 * Checkout carries our order id in metadata; deliveries carry `orderId`. Both
 * resolve to the invoice through the order.
 */
export async function invoiceForOrder(orderId: string, client: DbClient = db) {
  return client.invoice.findUnique({
    where: { orderId },
    select: { id: true, invoiceNumber: true, outstandingAmt: true },
  })
}
