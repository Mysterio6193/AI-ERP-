import type { Prisma, PrismaClient } from "@prisma/client"

import { computeDueDate } from "@/lib/invoicing"
import { ACCOUNTS, postJournal } from "@/lib/ledger"
import { getSettings } from "@/lib/settings/service"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * What the business owes its suppliers.
 *
 * `Supplier` had no invoice and no payment relation at all. Receiving goods
 * created an asset with nothing on the other side, so the books could not
 * balance and no screen could answer "what do we owe, to whom, by when".
 *
 * The three-way match, which is why GRNI exists:
 *
 *   receive goods    DR Inventory   CR Goods Received Not Invoiced
 *   supplier bills   DR GRNI        CR Accounts Payable      (+ GST)
 *   pay the bill     DR Accounts Payable   CR Bank
 *
 * GRNI is the balance of stock that has arrived and not been charged for. It
 * should trend to zero; a persistent balance means bills are missing, which is
 * exactly the thing nobody notices until a supplier chases.
 *
 * Both operations are idempotent through the ledger's own key, so a retried
 * import cannot pay a supplier twice.
 */

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export interface RecordSupplierInvoiceInput {
  supplierId: string
  invoiceNumber: string
  subtotal: number
  taxAmount?: number
  purchaseOrderId?: string | null
  invoiceDate?: Date
  dueDate?: Date
  companyId?: string | null
  notes?: string | null
  postedBy?: string | null
}

export type SupplierInvoiceResult =
  | { ok: false; error: string }
  | { ok: true; duplicate: true; invoiceId: string }
  | { ok: true; duplicate: false; invoiceId: string; totalAmount: number }

/**
 * Record a bill.
 *
 * Duplicate invoice numbers from one supplier are the classic double-payment
 * route, so they are rejected on the unique key rather than merged.
 */
export async function recordSupplierInvoice(
  db: DbClient,
  input: RecordSupplierInvoiceInput
): Promise<SupplierInvoiceResult> {
  const subtotal = round(input.subtotal)
  const taxAmount = round(input.taxAmount || 0)
  const totalAmount = round(subtotal + taxAmount)

  if (totalAmount <= 0) {
    return { ok: false, error: "A supplier invoice must be for a positive amount" }
  }

  const supplier = await db.supplier.findUnique({
    where: { id: input.supplierId },
    select: { id: true, name: true, companyId: true, paymentTerms: true },
  })

  if (!supplier) {
    return { ok: false, error: "Supplier not found" }
  }

  const existing = await db.supplierInvoice.findUnique({
    where: {
      supplierId_invoiceNumber: {
        supplierId: input.supplierId,
        invoiceNumber: input.invoiceNumber,
      },
    },
    select: { id: true },
  })

  if (existing) {
    return { ok: true, duplicate: true, invoiceId: existing.id }
  }

  const companyId = input.companyId ?? supplier.companyId ?? null
  const invoiceDate = input.invoiceDate ?? new Date()

  // Suppliers have terms too. Reusing the sales-side calculation means one
  // definition of "Net 30" across the business rather than two that drift.
  const dueDate =
    input.dueDate ??
    computeDueDate({
      issuedAt: invoiceDate,
      paymentTerms: supplier.paymentTerms,
      settings: await getSettings("invoicing", { companyId }),
    })

  const invoice = await db.supplierInvoice.create({
    data: {
      invoiceNumber: input.invoiceNumber,
      supplierId: supplier.id,
      purchaseOrderId: input.purchaseOrderId || null,
      invoiceDate,
      dueDate,
      subtotal,
      taxAmount,
      totalAmount,
      paidAmount: 0,
      outstandingAmt: totalAmount,
      status: "unpaid",
      notes: input.notes || null,
      companyId,
    },
    select: { id: true },
  })

  // Clears GRNI into a real payable. GST on a purchase is an input credit, so
  // it debits the same control account sales credit — the net of the two is
  // what is actually remitted.
  await postJournal(db, {
    companyId,
    date: invoiceDate,
    description: `Supplier invoice ${input.invoiceNumber} — ${supplier.name}`,
    referenceType: "supplier_invoice",
    referenceId: invoice.id,
    postedBy: input.postedBy,
    lines: [
      { accountCode: ACCOUNTS.goodsReceivedNotInvoiced, debit: subtotal },
      { accountCode: ACCOUNTS.taxPayable, debit: taxAmount },
      { accountCode: ACCOUNTS.accountsPayable, credit: totalAmount },
    ],
  })

  return { ok: true, duplicate: false, invoiceId: invoice.id, totalAmount }
}

export interface RecordSupplierPaymentInput {
  supplierInvoiceId: string
  amount: number
  method?: string
  reference?: string | null
  paidAt?: Date
  notes?: string | null
  postedBy?: string | null
}

export type SupplierPaymentResult =
  | { ok: false; error: string }
  | { ok: true; duplicate: true; paymentId: string }
  | { ok: true; duplicate: false; paymentId: string; applied: number; outstanding: number; status: string }

/**
 * Pay a bill, in whole or in part.
 *
 * `reference` is the idempotency key when supplied — a bank export replayed
 * twice must not pay the same invoice twice, which is the failure that costs
 * real money.
 */
export async function recordSupplierPayment(
  db: DbClient,
  input: RecordSupplierPaymentInput
): Promise<SupplierPaymentResult> {
  const amount = round(input.amount)

  if (amount <= 0) {
    return { ok: false, error: "A payment must be for a positive amount" }
  }

  const invoice = await db.supplierInvoice.findUnique({
    where: { id: input.supplierInvoiceId },
    select: {
      id: true, invoiceNumber: true, companyId: true,
      totalAmount: true, paidAmount: true, outstandingAmt: true,
      supplier: { select: { name: true } },
    },
  })

  if (!invoice) {
    return { ok: false, error: "Supplier invoice not found" }
  }

  if (input.reference) {
    const seen = await db.supplierPayment.findFirst({
      where: { supplierInvoiceId: invoice.id, reference: input.reference },
      select: { id: true },
    })

    if (seen) {
      return { ok: true, duplicate: true, paymentId: seen.id }
    }
  }

  // Never over-apply. Paying more than is owed is a data-entry error, and
  // silently creating a negative balance hides it.
  const applied = Math.min(amount, round(invoice.outstandingAmt))

  if (applied <= 0) {
    return { ok: false, error: "This invoice is already fully paid" }
  }

  const paidAt = input.paidAt ?? new Date()

  const payment = await db.supplierPayment.create({
    data: {
      supplierInvoiceId: invoice.id,
      amount: applied,
      method: input.method || "bank_transfer",
      reference: input.reference || null,
      paidAt,
      notes: input.notes || null,
    },
    select: { id: true },
  })

  const newPaid = round(invoice.paidAmount + applied)
  const newOutstanding = round(invoice.totalAmount - newPaid)

  await db.supplierInvoice.update({
    where: { id: invoice.id },
    data: {
      paidAmount: newPaid,
      outstandingAmt: newOutstanding,
      status: newOutstanding <= 0 ? "paid" : "partial",
    },
  })

  await postJournal(db, {
    companyId: invoice.companyId,
    date: paidAt,
    description: `Payment to ${invoice.supplier?.name ?? "supplier"} for ${invoice.invoiceNumber}`,
    referenceType: "supplier_payment",
    referenceId: payment.id,
    postedBy: input.postedBy,
    lines: [
      { accountCode: ACCOUNTS.accountsPayable, debit: applied },
      { accountCode: ACCOUNTS.bank, credit: applied },
    ],
  })

  return {
    ok: true,
    duplicate: false,
    paymentId: payment.id,
    applied,
    outstanding: newOutstanding,
    status: newOutstanding <= 0 ? "paid" : "partial",
  }
}

/** What is owed, oldest first — the list someone actually works from. */
export async function outstandingPayables(db: DbClient, companyId?: string | null) {
  const invoices = await db.supplierInvoice.findMany({
    where: {
      status: { in: ["unpaid", "partial"] },
      ...(companyId ? { companyId } : {}),
    },
    orderBy: { dueDate: "asc" },
    select: {
      id: true, invoiceNumber: true, dueDate: true, totalAmount: true,
      outstandingAmt: true, status: true,
      supplier: { select: { name: true } },
    },
  })

  const total = round(invoices.reduce((sum, invoice) => sum + invoice.outstandingAmt, 0))

  return { invoices, total, count: invoices.length }
}
