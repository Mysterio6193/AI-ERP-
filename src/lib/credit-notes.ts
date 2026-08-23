import type { Prisma, PrismaClient } from "@prisma/client"

import { ACCOUNTS, postJournal } from "@/lib/ledger"
import { nextDocumentNumber } from "@/lib/numbering"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Reducing what a customer owes.
 *
 * `CreditNote` was written in exactly one place — completing a return — and
 * even there it only moved `Customer.creditBalance`. It never reduced the
 * invoice it credited and never reached the ledger, so an invoice could be
 * fully credited and still show as owing, and receivables in the books never
 * came down.
 *
 * There was also no way to raise one directly. A billing mistake, a goodwill
 * adjustment or a voided invoice all had to go through a fictional return.
 *
 * A credit note is the reverse of an invoice, so it posts as one:
 *
 *   DR Sales Revenue          net
 *   DR GST Payable            tax
 *   CR Accounts Receivable    gross
 */

/**
 * The generator this replaces, preserved byte for byte.
 *
 * `creditNote` numbering still runs on the legacy path (`useCounter: false`),
 * so both the returns flow and the API have to produce the same CN- sequence
 * or numbers would fork the moment a credit note was raised directly.
 */
async function legacyCreditNoteNumber(client: DbClient) {
  const year = new Date().getFullYear()
  const prefix = `CN-${year}-`

  const last = await client.creditNote.findFirst({
    where: { cnNumber: { startsWith: prefix } },
    orderBy: { cnNumber: "desc" },
    select: { cnNumber: true },
  })

  const sequence = last ? Number(last.cnNumber.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(sequence).padStart(4, "0")}`
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export interface IssueCreditNoteInput {
  customerId: string
  /** Net amount, before tax. */
  amount: number
  taxAmount?: number
  reason: string
  /** The invoice being credited. Omitted for a standalone account credit. */
  invoiceId?: string | null
  companyId?: string | null
  userId?: string | null
  /** Overrides the built-in legacy generator; the returns flow passes its transaction client. */
  legacyNumber?: () => Promise<string>
}

export type IssueCreditNoteResult =
  | { ok: false; error: string }
  | {
      ok: true
      creditNoteId: string
      cnNumber: string
      total: number
      /** What the invoice still owes after the credit, when one was linked. */
      invoiceOutstanding: number | null
    }

export async function issueCreditNote(
  db: DbClient,
  input: IssueCreditNoteInput
): Promise<IssueCreditNoteResult> {
  const amount = round(input.amount)
  const taxAmount = round(input.taxAmount || 0)
  const total = round(amount + taxAmount)

  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, error: "A credit note must be for a positive amount" }
  }

  if (!input.reason?.trim()) {
    // A credit with no stated reason is indistinguishable from a mistake when
    // someone reads it back six months later.
    return { ok: false, error: "A credit note needs a reason" }
  }

  const invoice = input.invoiceId
    ? await db.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true, invoiceNumber: true, companyId: true, customerId: true,
          totalAmount: true, paidAmount: true, outstandingAmt: true, status: true,
        },
      })
    : null

  if (input.invoiceId && !invoice) {
    return { ok: false, error: "Invoice not found" }
  }

  if (invoice && invoice.customerId !== input.customerId) {
    // Crediting one customer's invoice to another's account is always wrong.
    return { ok: false, error: "That invoice belongs to a different customer" }
  }

  if (invoice) {
    // Already-credited invoices are the usual double-credit route.
    const credited = await db.creditNote.aggregate({
      where: { invoiceId: invoice.id, status: { not: "cancelled" } },
      _sum: { amount: true, taxAmount: true },
    })

    const alreadyCredited = round(
      Number(credited._sum.amount || 0) + Number(credited._sum.taxAmount || 0)
    )

    if (round(alreadyCredited + total) > round(invoice.totalAmount)) {
      return {
        ok: false,
        error: `That would credit ${round(alreadyCredited + total)} against an invoice of ${round(invoice.totalAmount)}.`,
      }
    }
  }

  const companyId = input.companyId ?? invoice?.companyId ?? null

  const cnNumber = await nextDocumentNumber("creditNote", {
    db,
    companyId,
    legacy: input.legacyNumber ?? (() => legacyCreditNoteNumber(db)),
  })

  const creditNote = await db.creditNote.create({
    data: {
      cnNumber,
      invoiceId: invoice?.id || null,
      customerId: input.customerId,
      amount,
      taxAmount,
      reason: input.reason.trim(),
      status: "active",
      appliedToInvoice: invoice?.id || null,
      appliedAmount: invoice ? total : 0,
    },
    select: { id: true, cnNumber: true },
  })

  let invoiceOutstanding: number | null = null

  if (invoice) {
    // The gap that made a fully credited invoice still read as owing.
    const nextOutstanding = Math.max(round(invoice.outstandingAmt - total), 0)
    invoiceOutstanding = nextOutstanding

    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        outstandingAmt: nextOutstanding,
        status:
          nextOutstanding <= 0
            ? invoice.paidAmount > 0
              ? "paid"
              : "credited"
            : invoice.status === "paid"
              ? "partial"
              : invoice.status,
      },
    })
  }

  // Atomic, so a concurrent invoice charge cannot be lost.
  const customer = await db.customer.update({
    where: { id: input.customerId },
    data: { creditBalance: { decrement: total } },
    select: { creditBalance: true, creditLimit: true, creditStatus: true },
  })

  if (
    customer.creditStatus === "on_hold" &&
    (customer.creditLimit <= 0 || customer.creditBalance <= customer.creditLimit)
  ) {
    await db.customer.update({
      where: { id: input.customerId },
      data: { creditStatus: "active" },
    })
  }

  await db.creditTransaction.create({
    data: {
      customerId: input.customerId,
      type: "refund",
      amount: -total,
      balanceAfter: customer.creditBalance,
      description: `Credit note ${creditNote.cnNumber}: ${input.reason.trim()}`,
      referenceType: "credit_note",
      referenceId: creditNote.id,
    },
  })

  // The reverse of the invoice entry. Without this, receivables in the ledger
  // never came down and the books drifted from the customer's actual balance.
  await postJournal(db, {
    companyId,
    description: `Credit note ${creditNote.cnNumber}${invoice ? ` against ${invoice.invoiceNumber}` : ""}`,
    referenceType: "credit_note",
    referenceId: creditNote.id,
    postedBy: input.userId,
    lines: [
      { accountCode: ACCOUNTS.salesRevenue, debit: amount },
      { accountCode: ACCOUNTS.taxPayable, debit: taxAmount },
      { accountCode: ACCOUNTS.accountsReceivable, credit: total },
    ],
  })

  return {
    ok: true,
    creditNoteId: creditNote.id,
    cnNumber: creditNote.cnNumber,
    total,
    invoiceOutstanding,
  }
}

export type VoidInvoiceResult =
  | { ok: false; error: string }
  | { ok: true; creditNoteId: string; cnNumber: string; credited: number }

/**
 * Void an invoice by crediting it in full.
 *
 * Deliberately not a delete or a status flip. An invoice that has been sent is
 * a document the customer holds; making it disappear leaves their copy
 * unexplained and the ledger entry stranded. Crediting it reverses the money
 * and leaves both sides of the story on file.
 */
export async function voidInvoice(
  db: DbClient,
  invoiceId: string,
  reason: string,
  options?: { userId?: string | null }
): Promise<VoidInvoiceResult> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, customerId: true, companyId: true,
      subtotal: true, taxAmount: true, totalAmount: true, paidAmount: true, status: true,
    },
  })

  if (!invoice) {
    return { ok: false, error: "Invoice not found" }
  }

  if (invoice.paidAmount > 0) {
    // Voiding money that has already arrived would leave the payment
    // unexplained. A refund is a different, deliberate action.
    return {
      ok: false,
      error: `${invoice.invoiceNumber} has payments against it. Refund those before voiding, or raise a partial credit note.`,
    }
  }

  const result = await issueCreditNote(db, {
    customerId: invoice.customerId,
    invoiceId: invoice.id,
    amount: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    reason: reason?.trim() || `Voided invoice ${invoice.invoiceNumber}`,
    companyId: invoice.companyId,
    userId: options?.userId,
  })

  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    creditNoteId: result.creditNoteId,
    cnNumber: result.cnNumber,
    credited: result.total,
  }
}
