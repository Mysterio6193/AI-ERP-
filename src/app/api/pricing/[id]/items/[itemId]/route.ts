import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

/** Change or remove one line on a price list. */

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  const { id, itemId } = await params
  const body = await request.json().catch(() => ({}))

  // Scoped to the list in the path, so an item id from another list cannot be
  // edited by guessing the URL.
  const existing = await db.priceListItem.findFirst({
    where: { id: itemId, priceListId: id },
    select: { id: true, minQty: true, maxQty: true },
  })

  if (!existing) {
    return NextResponse.json({ success: false, error: "Price list line not found" }, { status: 404 })
  }

  const minQty = body.minQty === undefined ? existing.minQty : Number(body.minQty)
  const maxQty =
    body.maxQty === undefined
      ? existing.maxQty
      : body.maxQty === null
        ? null
        : Number(body.maxQty)

  if (maxQty !== null && maxQty < minQty) {
    return NextResponse.json(
      { success: false, error: "The maximum quantity cannot be below the minimum." },
      { status: 400 }
    )
  }

  if (body.price !== undefined && (!Number.isFinite(Number(body.price)) || Number(body.price) < 0)) {
    return NextResponse.json({ success: false, error: "Price must be zero or more." }, { status: 400 })
  }

  const item = await db.priceListItem.update({
    where: { id: itemId },
    data: {
      ...(body.price !== undefined ? { price: Number(body.price) } : {}),
      minQty,
      maxQty,
      ...(body.discountPercent !== undefined ? { discountPercent: Number(body.discountPercent) || 0 } : {}),
      ...(body.discountFlat !== undefined ? { discountFlat: Number(body.discountFlat) || 0 } : {}),
    },
    include: { product: { select: { name: true, sku: true, wholesalePrice: true } } },
  })

  return NextResponse.json({ success: true, data: item })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  const { id, itemId } = await params

  const existing = await db.priceListItem.findFirst({
    where: { id: itemId, priceListId: id },
    select: { id: true },
  })

  if (!existing) {
    return NextResponse.json({ success: false, error: "Price list line not found" }, { status: 404 })
  }

  await db.priceListItem.delete({ where: { id: itemId } })

  return NextResponse.json({ success: true, data: { id: itemId } })
}
