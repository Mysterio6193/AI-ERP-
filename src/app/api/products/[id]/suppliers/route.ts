import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

/**
 * Which suppliers sell a product, at what cost and lead time.
 *
 * `ProductSupplier` was modelled and never written, so `reorderSuggestions` —
 * which already reads it and picks a supplier — always found nothing. Reorder
 * advice fell back to the product's own cost price and named nobody to buy
 * from, which is the one thing that advice is for.
 */

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  const { id } = await params

  const links = await db.productSupplier.findMany({
    where: { productId: id },
    orderBy: [{ isPreferred: "desc" }, { costPrice: "asc" }],
    include: { supplier: { select: { id: true, name: true, paymentTerms: true } } },
  })

  return NextResponse.json({
    success: true,
    data: links,
    summary: {
      count: links.length,
      preferred: links.find((l) => l.isPreferred)?.supplier.name ?? null,
      cheapest: links.length ? links.reduce((a, b) => (a.costPrice <= b.costPrice ? a : b)).supplier.name : null,
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "warehouse", "accounts"])
  if (!auth.user) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const supplierId = String(body.supplierId || "")
  const costPrice = Number(body.costPrice)

  if (!supplierId) {
    return NextResponse.json({ success: false, error: "A supplier is required." }, { status: 400 })
  }

  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return NextResponse.json(
      { success: false, error: "Cost price must be zero or more." },
      { status: 400 }
    )
  }

  const [product, supplier] = await Promise.all([
    db.product.findUnique({ where: { id }, select: { id: true } }),
    db.supplier.findUnique({ where: { id: supplierId }, select: { id: true } }),
  ])

  if (!product) {
    return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 })
  }

  if (!supplier) {
    return NextResponse.json({ success: false, error: "Supplier not found" }, { status: 404 })
  }

  const clash = await db.productSupplier.findFirst({
    where: { productId: id, supplierId },
    select: { id: true },
  })

  if (clash) {
    return NextResponse.json(
      { success: false, error: "That supplier is already linked to this product." },
      { status: 409 }
    )
  }

  // One preferred supplier per product, or "preferred" means nothing.
  if (body.isPreferred) {
    await db.productSupplier.updateMany({
      where: { productId: id, isPreferred: true },
      data: { isPreferred: false },
    })
  }

  const link = await db.productSupplier.create({
    data: {
      productId: id,
      supplierId,
      supplierSku: body.supplierSku ? String(body.supplierSku) : null,
      costPrice,
      minOrderQty: body.minOrderQty === undefined ? 1 : Math.max(Number(body.minOrderQty) || 1, 1),
      leadTime: body.leadTime === undefined ? 7 : Math.max(Number(body.leadTime) || 0, 0),
      isPreferred: Boolean(body.isPreferred),
    },
    include: { supplier: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ success: true, data: link }, { status: 201 })
}
