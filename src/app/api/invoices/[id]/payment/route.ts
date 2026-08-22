import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { recordPaymentAtomic } from "@/lib/payments"

/**
 * Record a payment against an invoice.
 *
 * The logic moved to `lib/payments.ts` so Stripe, COD and the agent take money
 * the same way. This route is now auth plus input handling.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "accounts", "sales"])
  if (auth.response) {
    return auth.response
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const result = await recordPaymentAtomic({
      invoiceId: id,
      amount: Number(body.amount),
      method: body.method,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Error recording invoice payment:", error)
    return NextResponse.json(
      { success: false, error: "Failed to record payment" },
      { status: 500 }
    )
  }
}
