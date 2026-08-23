import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

/**
 * Copy a price list and every line on it.
 *
 * The usual way a new contract starts: take last year's list, change a dozen
 * prices. Retyping sixty lines is how transcription errors get into pricing.
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

  const source = await db.priceList.findUnique({
    where: { id },
    include: { items: true },
  })

  if (!source) {
    return NextResponse.json({ success: false, error: "Price list not found" }, { status: 404 })
  }

  const copy = await db.priceList.create({
    data: {
      name: String(body.name || `${source.name} (copy)`),
      description: source.description,
      type: source.type,
      currency: source.currency,
      // A copy is never the default and never active on arrival: it exists to
      // be edited, and inheriting either would change what customers pay the
      // moment it is created.
      status: "draft",
      isDefault: false,
      validFrom: source.validFrom,
      validTo: source.validTo,
      companyId: source.companyId,
      items: {
        create: source.items.map((item) => ({
          productId: item.productId,
          price: item.price,
          minQty: item.minQty,
          maxQty: item.maxQty,
          discountPercent: item.discountPercent,
          discountFlat: item.discountFlat,
        })),
      },
    },
    include: { _count: { select: { items: true } } },
  })

  return NextResponse.json({ success: true, data: copy }, { status: 201 })
}
