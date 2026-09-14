import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"
import { getSettings } from "@/lib/settings/service"
import { getEntitlementState, setSubscription } from "@/lib/subscription/service"

/**
 * The current company's subscription: what it is, what it allows, and how much
 * of each allowance is used.
 *
 * One endpoint rather than three, because every screen that cares about any of
 * it cares about all of it — a banner needs the status, a limit warning needs
 * usage against entitlement.
 */

export const dynamic = "force-dynamic"

const assignSchema = z.object({
  planId: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]).optional(),
  seats: z.number().int().min(1).optional(),
  /** Admin override for a bespoke deal; otherwise the plan's own trial applies. */
  trialDays: z.number().int().min(0).max(365).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.staff)
  if (!auth.user) return auth.response

  try {
    const companyId = await getActiveCompanyId(request)
    const settings = await getSettings("subscription", { companyId })
    const state = await getEntitlementState(companyId)

    return NextResponse.json({
      success: true,
      data: {
        ...state,
        deploymentMode: settings.deploymentMode,
        // Staff see their own limits; the plan catalogue is admin-gated unless
        // settings open it, so an upgrade prompt can be shown deliberately.
        canSeePlans: auth.user.role === "admin" || settings.showPlansToStaff,
      },
    })
  } catch (error) {
    console.error("Failed to load subscription:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load subscription" },
      { status: 500 }
    )
  }
}

/** Assigns a plan directly. The cloud path uses Stripe; this is the admin path. */
export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.adminOnly)
  if (!auth.user) return auth.response

  try {
    const parsed = assignSchema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      )
    }

    const companyId = await getActiveCompanyId(request)

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "No active company to subscribe" },
        { status: 400 }
      )
    }

    const settings = await getSettings("subscription", { companyId })
    const plan = await db.plan.findUnique({
      where: { id: parsed.data.planId },
      select: { id: true, trialDays: true, includedSeats: true },
    })

    if (!plan) {
      return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 })
    }

    const trialDays = parsed.data.trialDays ?? plan.trialDays ?? settings.defaultTrialDays
    const now = new Date()
    const periodDays = parsed.data.interval === "yearly" ? 365 : 30

    const result = await setSubscription({
      companyId,
      planId: plan.id,
      status: trialDays > 0 ? "trialing" : "active",
      source: "manual",
      interval: parsed.data.interval ?? "monthly",
      seats: parsed.data.seats ?? plan.includedSeats ?? 1,
      trialEndsAt: trialDays > 0 ? new Date(now.getTime() + trialDays * 86_400_000) : null,
      currentPeriodEnd: new Date(
        now.getTime() + (trialDays > 0 ? trialDays : periodDays) * 86_400_000
      ),
      detail: `assigned by ${auth.user.email}`,
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: await getEntitlementState(companyId) })
  } catch (error) {
    console.error("Failed to assign plan:", error)
    return NextResponse.json({ success: false, error: "Failed to assign plan" }, { status: 500 })
  }
}
