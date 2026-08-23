import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { voidInvoice } from "@/lib/credit-notes"
import { db } from "@/lib/db"

/**
 * Void an invoice by crediting it in full.
 *
 * Not a delete and not a status flip: a sent invoice is a document the customer
 * holds, so it is reversed rather than made to disappear.
 */

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const result = await voidInvoice(db, id, String(body.reason || ""), {
    userId: auth.user?.id,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  const invoice = await db.invoice.findUnique({
    where: { id },
    select: { invoiceNumber: true, status: true, outstandingAmt: true },
  })

  return NextResponse.json({ success: true, data: { ...result, invoice } })
}
