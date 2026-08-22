import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { completeReturn, receiveReturn, setReturnStatus } from "@/lib/returns"

/**
 * The rest of the returns lifecycle.
 *
 * This route did not exist, so `approved`, `received`, `completed` and
 * `rejected` were unreachable — every return stayed `pending` forever while the
 * UI rendered four states that could never occur.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const { id } = await params

  const record = await db.return.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { name: true, sku: true } } } },
      customer: { select: { id: true, name: true } },
    },
  })

  if (!record) {
    return NextResponse.json({ success: false, error: "Return not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: record })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const status = String(body.status || "")

  try {
    // Each step has real consequences, so they are separate operations rather
    // than one status write: receiving moves stock, completing moves money.
    if (status === "received") {
      const result = await receiveReturn(id, {
        warehouseId: body.warehouseId,
        userId: auth.user!.id,
      })

      return result.ok
        ? NextResponse.json({ success: true, data: result })
        : NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    if (status === "completed") {
      const result = await completeReturn(id, { userId: auth.user!.id })

      return result.ok
        ? NextResponse.json({ success: true, data: result })
        : NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    if (status === "approved" || status === "rejected") {
      const result = await setReturnStatus(id, status, { notes: body.notes })

      return result.ok
        ? NextResponse.json({ success: true, data: result })
        : NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, error: `Unsupported status "${status}"` },
      { status: 400 }
    )
  } catch (error) {
    console.error("Return update failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Update failed" },
      { status: 500 }
    )
  }
}
