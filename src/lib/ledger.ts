import type { Prisma, PrismaClient } from "@prisma/client"

import { ensureDefaultChartOfAccounts } from "@/lib/accounting"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Double-entry posting.
 *
 * `JournalEntry` and `JournalLine` were modelled, and `journalLine` had **zero**
 * call sites. Invoicing, payment and goods receipt all moved real money and
 * real assets while the general ledger stayed empty, so the books could not be
 * balanced at all — not "were wrong", but had nothing in them.
 *
 * Two properties make this safe to call from inside business flows:
 *
 *   Balanced or refused. An unbalanced entry is a bug in the caller, and
 *   posting it would corrupt every report built on the ledger. It throws.
 *
 *   Once per source document. `entryNumber` is derived from the reference and
 *   is `@unique`, so a retried webhook or a double-clicked button collides at
 *   the database rather than posting twice. That is stronger than checking
 *   first and inserting after, which races.
 */

/** Account codes from the default chart, referenced by meaning not by number. */
export const ACCOUNTS = {
  bank: "1000",
  accountsReceivable: "1100",
  inventory: "1200",
  accountsPayable: "2000",
  taxPayable: "2100",
  salesRevenue: "4000",
  costOfGoodsSold: "5000",
} as const

export interface JournalLineInput {
  accountCode: string
  debit?: number
  credit?: number
  description?: string
}

export interface PostJournalInput {
  companyId: string | null
  date?: Date
  description: string
  /** invoice | payment | purchase_receipt | credit_note */
  referenceType: string
  referenceId: string
  lines: JournalLineInput[]
  postedBy?: string | null
}

export type PostResult =
  | { ok: true; skipped: true; reason: string; entryId?: string }
  | { ok: true; skipped: false; entryId: string; entryNumber: string; total: number }

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Deterministic, so the unique constraint does the idempotency work.
 *
 * Readability is deliberately sacrificed here: a pretty timestamped number
 * would let the same invoice post twice.
 */
export function entryNumberFor(referenceType: string, referenceId: string) {
  return `JE-${referenceType}-${referenceId}`.slice(0, 190)
}

export async function postJournal(db: DbClient, input: PostJournalInput): Promise<PostResult> {
  const lines = input.lines
    .map((line) => ({
      ...line,
      debit: round(line.debit || 0),
      credit: round(line.credit || 0),
    }))
    // A zero-value line carries no information and clutters the entry. Tax of
    // $0 on a GST-free invoice is the common case.
    .filter((line) => line.debit !== 0 || line.credit !== 0)

  if (lines.length === 0) {
    return { ok: true, skipped: true, reason: "Nothing to post" }
  }

  const totalDebit = round(lines.reduce((sum, line) => sum + line.debit, 0))
  const totalCredit = round(lines.reduce((sum, line) => sum + line.credit, 0))

  if (totalDebit !== totalCredit) {
    // Never post it. An unbalanced ledger is worse than an empty one, because
    // every report built on it silently inherits the error.
    throw new Error(
      `Refusing to post an unbalanced entry for ${input.referenceType} ${input.referenceId}: debits ${totalDebit} != credits ${totalCredit}`
    )
  }

  if (lines.some((line) => line.debit !== 0 && line.credit !== 0)) {
    throw new Error("A journal line is either a debit or a credit, never both")
  }

  const entryNumber = entryNumberFor(input.referenceType, input.referenceId)

  const existing = await db.journalEntry.findUnique({
    where: { entryNumber },
    select: { id: true },
  })

  if (existing) {
    return { ok: true, skipped: true, reason: "Already posted", entryId: existing.id }
  }

  // The chart has to exist before anything can reference it. It is defined in
  // accounting.ts and was never actually seeded for any company.
  // `ensureDefaultChartOfAccounts` comes back untyped (accounting.ts casts the
  // client), so pin the shape here rather than letting `{}` leak into the
  // create call.
  const accounts = (await ensureDefaultChartOfAccounts(input.companyId)) as Array<{
    id: string
    code: string
    normalSide: string
  }>

  const byCode = new Map<string, string>(accounts.map((account) => [account.code, account.id]))

  const missing = lines.map((line) => line.accountCode).filter((code) => !byCode.has(code))
  if (missing.length > 0) {
    throw new Error(`Chart of accounts is missing ${[...new Set(missing)].join(", ")}`)
  }

  try {
    const entry = await db.journalEntry.create({
      data: {
        entryNumber,
        date: input.date ?? new Date(),
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: "posted",
        totalDebit,
        totalCredit,
        postedBy: input.postedBy || null,
        postedAt: new Date(),
        companyId: input.companyId,
        lines: {
          create: lines.map((line) => ({
            accountId: byCode.get(line.accountCode)!,
            description: line.description || input.description,
            debit: line.debit,
            credit: line.credit,
          })),
        },
      },
      select: { id: true, entryNumber: true },
    })

    // Keep the denormalised balance in step, by the account's normal side, so
    // a debit-normal account grows on debits and shrinks on credits.
    for (const line of lines) {
      const account = accounts.find((a) => a.code === line.accountCode)
      if (!account) continue

      const delta =
        account.normalSide === "credit"
          ? line.credit - line.debit
          : line.debit - line.credit

      if (delta !== 0) {
        await db.chartOfAccount.update({
          where: { id: account.id },
          data: { balance: { increment: delta } },
        })
      }
    }

    return { ok: true, skipped: false, entryId: entry.id, entryNumber: entry.entryNumber, total: totalDebit }
  } catch (error) {
    // Lost the race to a concurrent caller; the entry exists, which is the
    // outcome we wanted.
    if ((error as { code?: string }).code === "P2002") {
      const winner = await db.journalEntry.findUnique({
        where: { entryNumber },
        select: { id: true },
      })
      return { ok: true, skipped: true, reason: "Already posted", entryId: winner?.id }
    }
    throw error
  }
}

/* ------------------------------------------------------------------------ */
/* The business events that move money                                      */
/* ------------------------------------------------------------------------ */

/**
 * Raising an invoice: the customer now owes us, and the tax is owed onward.
 *
 *   DR Accounts Receivable   gross
 *   CR Sales Revenue         net
 *   CR GST Payable           tax
 */
export async function postInvoiceRaised(db: DbClient, invoiceId: string, postedBy?: string | null) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, invoiceDate: true, companyId: true,
      subtotal: true, taxAmount: true, totalAmount: true,
      customer: { select: { name: true } },
    },
  })

  if (!invoice) {
    return { ok: true as const, skipped: true as const, reason: "Invoice not found" }
  }

  return postJournal(db, {
    companyId: invoice.companyId,
    date: invoice.invoiceDate ?? undefined,
    description: `Invoice ${invoice.invoiceNumber} — ${invoice.customer?.name ?? "customer"}`,
    referenceType: "invoice",
    referenceId: invoice.id,
    postedBy,
    lines: [
      { accountCode: ACCOUNTS.accountsReceivable, debit: Number(invoice.totalAmount) },
      { accountCode: ACCOUNTS.salesRevenue, credit: Number(invoice.subtotal) },
      { accountCode: ACCOUNTS.taxPayable, credit: Number(invoice.taxAmount) },
    ],
  })
}

/**
 * Receiving a payment: cash in, and the receivable is settled by that much.
 *
 *   DR Bank                  amount
 *   CR Accounts Receivable   amount
 */
export async function postPaymentReceived(db: DbClient, paymentId: string, postedBy?: string | null) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true, amount: true, paidAt: true, reference: true,
      invoice: { select: { invoiceNumber: true, companyId: true } },
    },
  })

  if (!payment) {
    return { ok: true as const, skipped: true as const, reason: "Payment not found" }
  }

  return postJournal(db, {
    companyId: payment.invoice?.companyId ?? null,
    date: payment.paidAt ?? undefined,
    description: `Payment for ${payment.invoice?.invoiceNumber ?? "invoice"}`,
    referenceType: "payment",
    referenceId: payment.id,
    postedBy,
    lines: [
      { accountCode: ACCOUNTS.bank, debit: Number(payment.amount) },
      { accountCode: ACCOUNTS.accountsReceivable, credit: Number(payment.amount) },
    ],
  })
}

/**
 * Receiving goods against a purchase order.
 *
 *   DR Inventory             cost
 *   CR Accounts Payable      cost
 *
 * This is the entry whose absence meant receiving stock created an asset with
 * no matching liability, so the books could never balance.
 */
export async function postPurchaseReceipt(
  db: DbClient,
  purchaseOrderId: string,
  amount: number,
  options?: {
    /**
     * Distinguishes one receipt from the next on the same PO. A purchase order
     * can be received in stages, so keying only on the PO id would post the
     * first delivery and silently swallow every one after it. Callers pass the
     * line and its new cumulative received quantity, which is unique per delta
     * and identical on a retry.
     */
    referenceKey?: string
    postedBy?: string | null
  }
) {
  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { id: true, poNumber: true, companyId: true, supplier: { select: { name: true } } },
  })

  if (!po || amount <= 0) {
    return { ok: true as const, skipped: true as const, reason: "Nothing to post" }
  }

  return postJournal(db, {
    companyId: po.companyId,
    description: `Goods received on ${po.poNumber} — ${po.supplier?.name ?? "supplier"}`,
    referenceType: "purchase_receipt",
    referenceId: options?.referenceKey ? `${po.id}:${options.referenceKey}` : po.id,
    postedBy: options?.postedBy,
    lines: [
      { accountCode: ACCOUNTS.inventory, debit: amount },
      { accountCode: ACCOUNTS.accountsPayable, credit: amount },
    ],
  })
}
