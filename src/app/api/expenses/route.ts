import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { createExpense, EXPENSE_CATEGORIES } from "@/lib/expenses"
import { db } from "@/lib/db"

/**
 * Operating expenses.
 *
 * The model existed with no API and no screen, so nothing could be recorded —
 * rent, freight and utilities never reached the books and every profit figure
 * was really gross margin.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const category = searchParams.get("category")
  const companyId = await getActiveCompanyId(request)

  const expenses = await db.expense.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(companyId ? { companyId } : {}),
    },
    orderBy: { date: "desc" },
    take: 200,
  })

  const outstanding = expenses
    .filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => sum + expense.totalAmount, 0)

  return NextResponse.json({
    success: true,
    data: expenses,
    summary: {
      count: expenses.length,
      total: expenses.reduce((sum, expense) => sum + expense.totalAmount, 0),
      // Approved but not yet paid — what is actually owed out.
      awaitingPayment: Math.round(outstanding * 100) / 100,
      categories: EXPENSE_CATEGORIES,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({}))

  const result = await createExpense(db, {
    category: String(body.category || "other"),
    description: String(body.description || ""),
    amount: Number(body.amount),
    taxAmount: body.taxAmount === undefined ? 0 : Number(body.taxAmount),
    date: body.date ? new Date(body.date) : undefined,
    paidTo: body.paidTo ? String(body.paidTo) : null,
    paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
    receiptUrl: body.receiptUrl ? String(body.receiptUrl) : null,
    notes: body.notes ? String(body.notes) : null,
    companyId: await getActiveCompanyId(request),
    status: body.status === "approved" ? "approved" : "pending",
    userId: auth.user?.id,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, data: result }, { status: 201 })
}
