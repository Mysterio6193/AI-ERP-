import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

/**
 * Order-level discount rules.
 *
 * DiscountRule was modelled and nothing in the platform could create one, so
 * `applyOrderDiscounts` had a table to read that was always empty. Rules only
 * take effect once `pricing.enableDiscountRules` is on, so creating one is
 * safe on its own.
 */

export const dynamic = "force-dynamic"

const TYPES = ["order_total", "line_item", "customer_group"]
const DISCOUNT_TYPES = ["percentage", "flat"]

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  const rules = await db.discountRule.findMany({ orderBy: { createdAt: "desc" } })

  return NextResponse.json({
    success: true,
    data: rules,
    summary: {
      count: rules.length,
      active: rules.filter((r) => r.status === "active").length,
      needingApproval: rules.filter((r) => r.requiresApproval).length,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (!auth.user) return auth.response

  const body = await request.json().catch(() => ({}))

  const name = String(body.name || "").trim()
  const type = String(body.type || "order_total")
  const discountType = String(body.discountType || "percentage")
  const discountValue = Number(body.discountValue)

  if (!name) {
    return NextResponse.json({ success: false, error: "A rule needs a name." }, { status: 400 })
  }

  if (!TYPES.includes(type)) {
    return NextResponse.json(
      { success: false, error: `Type must be one of ${TYPES.join(", ")}.` },
      { status: 400 }
    )
  }

  if (!DISCOUNT_TYPES.includes(discountType)) {
    return NextResponse.json(
      { success: false, error: "Discount type must be percentage or flat." },
      { status: 400 }
    )
  }

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json(
      { success: false, error: "Discount value must be greater than zero." },
      { status: 400 }
    )
  }

  // Above 100 turns an order into a refund.
  if (discountType === "percentage" && discountValue > 100) {
    return NextResponse.json(
      { success: false, error: "A percentage discount cannot exceed 100." },
      { status: 400 }
    )
  }

  const validFrom = body.validFrom ? new Date(body.validFrom) : null
  const validTo = body.validTo ? new Date(body.validTo) : null

  if (validFrom && validTo && validTo < validFrom) {
    // A window that closes before it opens matches nothing, so the rule would
    // silently never apply.
    return NextResponse.json(
      { success: false, error: "The end date cannot be before the start date." },
      { status: 400 }
    )
  }

  if (body.customerIds !== undefined && body.customerIds !== null && !Array.isArray(body.customerIds)) {
    return NextResponse.json(
      { success: false, error: "customerIds must be a list of customer ids." },
      { status: 400 }
    )
  }

  const rule = await db.discountRule.create({
    data: {
      name,
      description: body.description ? String(body.description) : null,
      type,
      discountType,
      discountValue,
      minOrderValue:
        body.minOrderValue === undefined || body.minOrderValue === null
          ? null
          : Number(body.minOrderValue),
      minQty: body.minQty === undefined || body.minQty === null ? null : Number(body.minQty),
      // Stored as JSON because the column is a string. Null means everyone,
      // which is how applyOrderDiscounts reads it.
      customerIds:
        Array.isArray(body.customerIds) && body.customerIds.length > 0
          ? JSON.stringify(body.customerIds.map((id: unknown) => String(id)))
          : null,
      requiresApproval: Boolean(body.requiresApproval),
      approvalThreshold:
        body.approvalThreshold === undefined || body.approvalThreshold === null
          ? null
          : Number(body.approvalThreshold),
      validFrom,
      validTo,
      status: body.status === "paused" ? "paused" : "active",
    },
  })

  return NextResponse.json({ success: true, data: rule }, { status: 201 })
}
