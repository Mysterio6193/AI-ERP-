import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

/**
 * One price list.
 *
 * Edit, Duplicate and Delete rendered on the pricing page with no handler and
 * no endpoint behind them — the menu looked complete and did nothing.
 *
 * These are guarded harder than most CRUD because a price list now actually
 * prices order lines. Deleting one that customers are assigned to would
 * silently move them back to wholesale, and nobody would notice until an
 * invoice went out.
 */

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  const { id } = await params

  const priceList = await db.priceList.findUnique({
    where: { id },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, sku: true, wholesalePrice: true } } },
        orderBy: [{ productId: "asc" }, { minQty: "asc" }],
      },
      _count: { select: { customers: true } },
    },
  })

  if (!priceList) {
    return NextResponse.json({ success: false, error: "Price list not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: priceList })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const existing = await db.priceList.findUnique({
    where: { id },
    select: { id: true, companyId: true },
  })

  if (!existing) {
    return NextResponse.json({ success: false, error: "Price list not found" }, { status: 404 })
  }

  if (body.isDefault === true) {
    // Within the company only — see the note in the create handler.
    await db.priceList.updateMany({
      where: { isDefault: true, companyId: existing.companyId, id: { not: id } },
      data: { isDefault: false },
    })
  }

  const priceList = await db.priceList.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
      ...(body.type !== undefined ? { type: String(body.type) } : {}),
      ...(body.status !== undefined ? { status: String(body.status) } : {}),
      ...(body.isDefault !== undefined ? { isDefault: Boolean(body.isDefault) } : {}),
      ...(body.validFrom !== undefined ? { validFrom: body.validFrom ? new Date(body.validFrom) : null } : {}),
      ...(body.validTo !== undefined ? { validTo: body.validTo ? new Date(body.validTo) : null } : {}),
    },
  })

  return NextResponse.json({ success: true, data: priceList })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  const { id } = await params

  const priceList = await db.priceList.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { customers: true, items: true } } },
  })

  if (!priceList) {
    return NextResponse.json({ success: false, error: "Price list not found" }, { status: 404 })
  }

  if (priceList._count.customers > 0) {
    // Deleting this would move those customers back to wholesale pricing with
    // no warning, and the first anyone would hear of it is an invoice.
    return NextResponse.json(
      {
        success: false,
        error: `${priceList._count.customers} customer${priceList._count.customers === 1 ? " is" : "s are"} on "${priceList.name}". Move them to another list first, or archive this one instead of deleting it.`,
      },
      { status: 409 }
    )
  }

  // Items cascade with the list, which is what should happen for a list nobody
  // is on.
  await db.priceList.delete({ where: { id } })

  return NextResponse.json({
    success: true,
    data: { id, itemsRemoved: priceList._count.items },
  })
}
