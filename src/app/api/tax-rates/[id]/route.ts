import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { taxRateUsage } from "@/lib/tax-rates"

/** Change or retire one named tax rate. */

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const existing = await db.taxRate.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ success: false, error: "Tax rate not found" }, { status: 404 })
  }

  if (body.rate !== undefined) {
    const rate = Number(body.rate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return NextResponse.json(
        { success: false, error: "Rate must be between 0 and 100." },
        { status: 400 }
      )
    }
  }

  if (body.isDefault === true) {
    await db.taxRate.updateMany({
      where: {
        isDefault: true,
        companyId: existing.companyId,
        country: existing.country,
        id: { not: id },
      },
      data: { isDefault: false },
    })
  }

  const updated = await db.taxRate.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.rate !== undefined ? { rate: Number(body.rate) } : {}),
      ...(body.taxType !== undefined ? { taxType: String(body.taxType) } : {}),
      ...(body.hsnFrom !== undefined ? { hsnFrom: body.hsnFrom ? String(body.hsnFrom) : null } : {}),
      ...(body.hsnTo !== undefined ? { hsnTo: body.hsnTo ? String(body.hsnTo) : null } : {}),
      ...(body.isDefault !== undefined ? { isDefault: Boolean(body.isDefault) } : {}),
      ...(body.status !== undefined ? { status: String(body.status) } : {}),
    },
  })

  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) return auth.response

  const { id } = await params

  const existing = await db.taxRate.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!existing) {
    return NextResponse.json({ success: false, error: "Tax rate not found" }, { status: 404 })
  }

  const usage = await taxRateUsage(db, id)

  if (usage.inUse) {
    // Those products would silently fall back to their bare gstRate, which may
    // be a different number, and nobody would be told.
    return NextResponse.json(
      {
        success: false,
        error: `${usage.products} product${usage.products === 1 ? " is" : "s are"} on "${existing.name}". Move them to another rate first, or archive this one instead of deleting it.`,
      },
      { status: 409 }
    )
  }

  await db.taxRate.delete({ where: { id } })

  return NextResponse.json({ success: true, data: { id } })
}
