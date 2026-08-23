import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { issueCreditNote } from "@/lib/credit-notes"
import { db } from "@/lib/db"

/**
 * Credit notes.
 *
 * These existed only as a side effect of completing a return, so a billing
 * mistake or a goodwill adjustment had to be dressed up as a fictional return
 * to reduce what a customer owed.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts", "sales"])
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get("customerId")
  const invoiceId = searchParams.get("invoiceId")

  const creditNotes = await db.creditNote.findMany({
    where: {
      ...(customerId ? { customerId } : {}),
      ...(invoiceId ? { invoiceId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { invoice: { select: { invoiceNumber: true } } },
  })

  const total = creditNotes
    .filter((note) => note.status !== "cancelled")
    .reduce((sum, note) => sum + Number(note.amount) + Number(note.taxAmount), 0)

  return NextResponse.json({
    success: true,
    data: creditNotes,
    summary: { count: creditNotes.length, total: Math.round(total * 100) / 100 },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({}))

  if (!body.customerId) {
    return NextResponse.json(
      { success: false, error: "A customer is required." },
      { status: 400 }
    )
  }

  const result = await issueCreditNote(db, {
    customerId: String(body.customerId),
    invoiceId: body.invoiceId ? String(body.invoiceId) : null,
    amount: Number(body.amount),
    taxAmount: body.taxAmount === undefined ? 0 : Number(body.taxAmount),
    reason: String(body.reason || ""),
    companyId: await getActiveCompanyId(request),
    userId: auth.user?.id,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, data: result }, { status: 201 })
}
