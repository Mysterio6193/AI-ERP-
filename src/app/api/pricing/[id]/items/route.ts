import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

/**
 * Lines on a price list.
 *
 * There was no way to add, change or remove one from anywhere in the product —
 * the seeded lines were the only lines a business could ever have.
 */

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const priceList = await db.priceList.findUnique({ where: { id }, select: { id: true } })
  if (!priceList) {
    return NextResponse.json({ success: false, error: "Price list not found" }, { status: 404 })
  }

  const productId = String(body.productId || "")
  const price = Number(body.price)
  const minQty = body.minQty === undefined ? 1 : Number(body.minQty)
  const maxQty = body.maxQty === undefined || body.maxQty === null ? null : Number(body.maxQty)

  if (!productId) {
    return NextResponse.json({ success: false, error: "A product is required." }, { status: 400 })
  }

  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ success: false, error: "Price must be zero or more." }, { status: 400 })
  }

  if (maxQty !== null && maxQty < minQty) {
    // An inverted band matches nothing, so the line would silently never apply.
    return NextResponse.json(
      { success: false, error: "The maximum quantity cannot be below the minimum." },
      { status: 400 }
    )
  }

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } })
  if (!product) {
    return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 })
  }

  const clash = await db.priceListItem.findFirst({
    where: { priceListId: id, productId, minQty },
    select: { id: true },
  })

  if (clash) {
    return NextResponse.json(
      { success: false, error: "That product already has a band starting at this quantity." },
      { status: 409 }
    )
  }

  const item = await db.priceListItem.create({
    data: {
      priceListId: id,
      productId,
      price,
      minQty,
      maxQty,
      discountPercent: Number(body.discountPercent) || 0,
      discountFlat: Number(body.discountFlat) || 0,
    },
    include: { product: { select: { name: true, sku: true, wholesalePrice: true } } },
  })

  return NextResponse.json({ success: true, data: item }, { status: 201 })
}
