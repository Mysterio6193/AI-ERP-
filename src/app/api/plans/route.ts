import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

/**
 * Plans.
 *
 * Readable by any staff member so the upgrade prompt can name what the next
 * plan gives; only an admin may create or reprice one.
 */

export const dynamic = "force-dynamic"

const entitlementSchema = z.object({
  key: z.string().trim().min(1).max(80),
  enabled: z.boolean().optional(),
  /** Null is unlimited; 0 is none allowed. Both are meaningful. */
  limit: z.number().int().min(0).nullish(),
})

const planSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullish(),
  monthlyPriceCents: z.number().int().min(0).optional(),
  yearlyPriceCents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  includedSeats: z.number().int().min(0).nullish(),
  perSeatCents: z.number().int().min(0).optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  entitlements: z.array(entitlementSchema).max(100).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.staff)
  if (!auth.user) return auth.response

  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true"

  const plans = await db.plan.findMany({
    where: includeArchived ? {} : { status: "active" },
    include: {
      entitlements: { orderBy: { key: "asc" } },
      _count: { select: { subscriptions: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { monthlyPriceCents: "asc" }],
  })

  return NextResponse.json({ success: true, data: plans })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.adminOnly)
  if (!auth.user) return auth.response

  try {
    const parsed = planSchema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid plan" },
        { status: 400 }
      )
    }

    const input = parsed.data
    const code = input.code.toLowerCase()

    const clash = await db.plan.findUnique({ where: { code }, select: { id: true } })

    if (clash) {
      return NextResponse.json(
        { success: false, error: `Plan "${code}" already exists` },
        { status: 409 }
      )
    }

    const plan = await db.plan.create({
      data: {
        code,
        name: input.name,
        description: input.description ?? null,
        monthlyPriceCents: input.monthlyPriceCents ?? 0,
        yearlyPriceCents: input.yearlyPriceCents ?? 0,
        currency: (input.currency ?? "AUD").toUpperCase(),
        trialDays: input.trialDays ?? 0,
        includedSeats: input.includedSeats ?? null,
        perSeatCents: input.perSeatCents ?? 0,
        isPublic: input.isPublic ?? true,
        sortOrder: input.sortOrder ?? 0,
        entitlements: {
          create: (input.entitlements ?? []).map((item) => ({
            key: item.key,
            enabled: item.enabled ?? true,
            // Undefined means the caller said nothing, which is unlimited.
            // An explicit 0 is preserved as a real ceiling of none.
            limit: item.limit === undefined ? null : item.limit,
          })),
        },
      },
      include: { entitlements: true },
    })

    return NextResponse.json({ success: true, data: plan }, { status: 201 })
  } catch (error) {
    console.error("Failed to create plan:", error)
    return NextResponse.json({ success: false, error: "Failed to create plan" }, { status: 500 })
  }
}
