import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"

/** Change or remove one product-supplier link. */

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "warehouse", "accounts"])
  if (!auth.user) return auth.response

  const { id, linkId } = await params
  const body = await request.json().catch(() => ({}))

  // Scoped to the product in the path, so a link id from another product
  // cannot be edited by guessing the URL.
  const existing = await db.productSupplier.findFirst({
    where: { id: linkId, productId: id },
    select: { id: true },
  })

  if (!existing) {
    return NextResponse.json({ success: false, error: "Link not found" }, { status: 404 })
  }

  if (body.costPrice !== undefined) {
    const cost = Number(body.costPrice)
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json(
        { success: false, error: "Cost price must be zero or more." },
        { status: 400 }
      )
    }
  }

  if (body.isPreferred === true) {
    await db.productSupplier.updateMany({
      where: { productId: id, isPreferred: true, id: { not: linkId } },
      data: { isPreferred: false },
    })
  }

  const link = await db.productSupplier.update({
    where: { id: linkId },
    data: {
      ...(body.costPrice !== undefined ? { costPrice: Number(body.costPrice) } : {}),
      ...(body.supplierSku !== undefined
        ? { supplierSku: body.supplierSku ? String(body.supplierSku) : null }
        : {}),
      ...(body.minOrderQty !== undefined
        ? { minOrderQty: Math.max(Number(body.minOrderQty) || 1, 1) }
        : {}),
      ...(body.leadTime !== undefined ? { leadTime: Math.max(Number(body.leadTime) || 0, 0) } : {}),
      ...(body.isPreferred !== undefined ? { isPreferred: Boolean(body.isPreferred) } : {}),
    },
    include: { supplier: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ success: true, data: link })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "warehouse", "accounts"])
  if (!auth.user) return auth.response

  const { id, linkId } = await params

  const existing = await db.productSupplier.findFirst({
    where: { id: linkId, productId: id },
    select: { id: true },
  })

  if (!existing) {
    return NextResponse.json({ success: false, error: "Link not found" }, { status: 404 })
  }

  // Unlinking loses a cost and a lead time but breaks nothing: purchase orders
  // record their own price, so history is unaffected.
  await db.productSupplier.delete({ where: { id: linkId } })

  return NextResponse.json({ success: true, data: { id: linkId } })
}
