import type { Prisma, PrismaClient } from "@prisma/client"

import { ACCOUNTS, postJournal } from "@/lib/ledger"
import { nextDocumentNumber } from "@/lib/numbering"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Operating expenses.
 *
 * The `Expense` model existed with no API and no screen — there was no way to
 * record a single one, so rent, freight and utilities never reached the books
 * at all and every profit figure was really just gross margin.
 *
 * Expenses follow the same two-step shape as supplier invoices, for the same
 * reason: approving one creates an obligation, paying it settles the
 * obligation, and collapsing the two loses the period the cost belongs to.
 *
 *   approved  DR <expense account>   CR Accounts Payable
 *   paid      DR Accounts Payable    CR Bank
 */

export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salary",
  "travel",
  "supplies",
  "marketing",
  "bank_fees",
  "other",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/**
 * Which account a category lands in.
 *
 * An unrecognised category falls to General Expenses rather than being
 * rejected — a cost that cannot be filed still has to appear somewhere, and
 * refusing it would just leave it off the books entirely.
 */
const CATEGORY_ACCOUNTS: Record<string, string> = {
  rent: "6200",
  utilities: "6300",
  marketing: "6400",
  salary: "6500",
  travel: "6600",
  supplies: "6700",
  bank_fees: "6100",
  other: "6900",
}

export function accountForCategory(category: string) {
  return CATEGORY_ACCOUNTS[category?.toLowerCase()] ?? "6900"
}

export const EXPENSE_STATUSES = ["pending", "approved", "rejected", "paid"] as const
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number]

/**
 * Which status changes are legal.
 *
 * A rejected or paid expense is finished. Allowing "paid → pending" would let
 * someone un-pay money that has already left the bank, and the ledger entry
 * would still be sitting there.
 */
const TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["paid", "rejected"],
  rejected: [],
  paid: [],
}

export function canTransition(from: string, to: string) {
  return (TRANSITIONS[from as ExpenseStatus] ?? []).includes(to as ExpenseStatus)
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export interface CreateExpenseInput {
  category: string
  description: string
  amount: number
  taxAmount?: number
  date?: Date
  paidTo?: string | null
  paymentMethod?: string | null
  receiptUrl?: string | null
  notes?: string | null
  companyId?: string | null
  /** Record it already approved, for someone entering a bill they have signed off. */
  status?: ExpenseStatus
  userId?: string | null
}

export type CreateExpenseResult =
  | { ok: false; error: string }
  | { ok: true; expenseId: string; expenseNumber: string; totalAmount: number }

export async function createExpense(
  db: DbClient,
  input: CreateExpenseInput
): Promise<CreateExpenseResult> {
  const amount = round(input.amount)
  const taxAmount = round(input.taxAmount || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "An expense must be for a positive amount" }
  }

  if (!input.description?.trim()) {
    return { ok: false, error: "An expense needs a description" }
  }

  const totalAmount = round(amount + taxAmount)
  const status: ExpenseStatus = input.status ?? "pending"

  const expenseNumber = await nextDocumentNumber("expense", {
    db,
    companyId: input.companyId,
    legacy: async () => {
      // Unreachable: `expense` has no legacy generator because there was no
      // API before this. Present because the signature requires it.
      throw new Error("Expense numbering requires the document counter")
    },
  })

  const expense = await db.expense.create({
    data: {
      expenseNumber,
      date: input.date ?? new Date(),
      category: input.category || "other",
      description: input.description.trim(),
      amount,
      taxAmount,
      totalAmount,
      paymentMethod: input.paymentMethod || null,
      paidTo: input.paidTo || null,
      receiptUrl: input.receiptUrl || null,
      status,
      notes: input.notes || null,
      companyId: input.companyId || null,
      ...(status === "approved"
        ? { approvedBy: input.userId || null, approvedAt: new Date() }
        : {}),
    },
    select: { id: true, expenseNumber: true },
  })

  // A pending expense is a request, not a cost. Nothing posts until someone
  // approves it.
  if (status === "approved") {
    await postExpenseApproved(db, expense.id, input.userId)
  }

  return { ok: true, expenseId: expense.id, expenseNumber: expense.expenseNumber, totalAmount }
}

async function postExpenseApproved(db: DbClient, expenseId: string, userId?: string | null) {
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true, expenseNumber: true, description: true, category: true,
      amount: true, taxAmount: true, totalAmount: true, date: true, companyId: true,
    },
  })

  if (!expense) return

  return postJournal(db, {
    companyId: expense.companyId,
    date: expense.date,
    description: `${expense.expenseNumber} — ${expense.description}`,
    referenceType: "expense",
    referenceId: expense.id,
    postedBy: userId,
    lines: [
      { accountCode: accountForCategory(expense.category), debit: expense.amount },
      // GST on a purchase is an input credit against the same control account
      // that sales credit, so what is remitted is the net.
      { accountCode: ACCOUNTS.taxPayable, debit: expense.taxAmount },
      { accountCode: ACCOUNTS.accountsPayable, credit: expense.totalAmount },
    ],
  })
}

export type SetExpenseStatusResult =
  | { ok: false; error: string }
  | { ok: true; status: ExpenseStatus }

export async function setExpenseStatus(
  db: DbClient,
  expenseId: string,
  next: string,
  options?: { userId?: string | null; notes?: string | null }
): Promise<SetExpenseStatusResult> {
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true, expenseNumber: true, status: true, totalAmount: true,
      companyId: true, description: true,
    },
  })

  if (!expense) {
    return { ok: false, error: "Expense not found" }
  }

  if (expense.status === next) {
    return { ok: true, status: next as ExpenseStatus }
  }

  if (!canTransition(expense.status, next)) {
    return {
      ok: false,
      error: `An expense cannot go from ${expense.status} to ${next}.`,
    }
  }

  await db.expense.update({
    where: { id: expenseId },
    data: {
      status: next,
      ...(next === "approved"
        ? { approvedBy: options?.userId || null, approvedAt: new Date() }
        : {}),
      ...(options?.notes ? { notes: options.notes } : {}),
    },
  })

  if (next === "approved") {
    await postExpenseApproved(db, expenseId, options?.userId)
  }

  if (next === "paid") {
    // Approval already booked the cost and the liability; paying only settles
    // it. Posting the expense account again here would double the cost.
    await postJournal(db, {
      companyId: expense.companyId,
      description: `Payment of ${expense.expenseNumber} — ${expense.description}`,
      referenceType: "expense_payment",
      referenceId: expense.id,
      postedBy: options?.userId,
      lines: [
        { accountCode: ACCOUNTS.accountsPayable, debit: expense.totalAmount },
        { accountCode: ACCOUNTS.bank, credit: expense.totalAmount },
      ],
    })
  }

  return { ok: true, status: next as ExpenseStatus }
}
