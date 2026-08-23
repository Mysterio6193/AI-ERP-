import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { setExpenseStatus } from "@/lib/expenses"

/** Approve, reject or pay one expense. */

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const { id } = await params
  const expense = await db.expense.findUnique({ where: { id } })

  if (!expense) {
    return NextResponse.json({ success: false, error: "Expense not found" }, { status: 404 })
  }

  // The ledger entries this expense produced, so "why does the P&L say that"
  // is answerable from the document itself.
  const entries = await db.journalEntry.findMany({
    where: { referenceId: id, referenceType: { in: ["expense", "expense_payment"] } },
    select: {
      entryNumber: true, description: true, date: true,
      totalDebit: true, totalCredit: true,
    },
  })

  return NextResponse.json({ success: true, data: { ...expense, journalEntries: entries } })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const status = String(body.status || "")

  if (!status) {
    return NextResponse.json(
      { success: false, error: "A status is required." },
      { status: 400 }
    )
  }

  const result = await setExpenseStatus(db, id, status, {
    userId: auth.user?.id,
    notes: body.notes ? String(body.notes) : null,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, data: result })
}
