import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

/** Change or retire one discount rule. */

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  const { id } = await params
  const rule = await db.discountRule.findUnique({ where: { id } })

  if (!rule) {
    return NextResponse.json({ success: false, error: "Discount rule not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: rule })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin"])
  if (!auth.user) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const existing = await db.discountRule.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ success: false, error: "Discount rule not found" }, { status: 404 })
  }

  if (body.discountValue !== undefined) {
    const value = Number(body.discountValue)
    const discountType = String(body.discountType || existing.discountType)

    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json(
        { success: false, error: "Discount value must be greater than zero." },
        { status: 400 }
      )
    }

    if (discountType === "percentage" && value > 100) {
      return NextResponse.json(
        { success: false, error: "A percentage discount cannot exceed 100." },
        { status: 400 }
      )
    }
  }

  const rule = await db.discountRule.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.description !== undefined
        ? { description: body.description ? String(body.description) : null }
        : {}),
      ...(body.discountValue !== undefined ? { discountValue: Number(body.discountValue) } : {}),
      ...(body.discountType !== undefined ? { discountType: String(body.discountType) } : {}),
      ...(body.minOrderValue !== undefined
        ? { minOrderValue: body.minOrderValue === null ? null : Number(body.minOrderValue) }
        : {}),
      ...(body.minQty !== undefined
        ? { minQty: body.minQty === null ? null : Number(body.minQty) }
        : {}),
      ...(body.requiresApproval !== undefined
        ? { requiresApproval: Boolean(body.requiresApproval) }
        : {}),
      ...(body.approvalThreshold !== undefined
        ? { approvalThreshold: body.approvalThreshold === null ? null : Number(body.approvalThreshold) }
        : {}),
      ...(body.validFrom !== undefined
        ? { validFrom: body.validFrom ? new Date(body.validFrom) : null }
        : {}),
      ...(body.validTo !== undefined
        ? { validTo: body.validTo ? new Date(body.validTo) : null }
        : {}),
      ...(body.status !== undefined ? { status: String(body.status) } : {}),
      ...(body.customerIds !== undefined
        ? {
            customerIds:
              Array.isArray(body.customerIds) && body.customerIds.length > 0
                ? JSON.stringify(body.customerIds.map((c: unknown) => String(c)))
                : null,
          }
        : {}),
    },
  })

  return NextResponse.json({ success: true, data: rule })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin"])
  if (!auth.user) return auth.response

  const { id } = await params

  const existing = await db.discountRule.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return NextResponse.json({ success: false, error: "Discount rule not found" }, { status: 404 })
  }

  // Orders store the discount as an amount, not a reference, so removing a
  // rule changes nothing already placed.
  await db.discountRule.delete({ where: { id } })

  return NextResponse.json({ success: true, data: { id } })
}
