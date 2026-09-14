import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"
import { getSettings } from "@/lib/settings/service"
import { getStripeClient, resolveStripeReturnOrigin } from "@/lib/stripe"

/**
 * Starts a subscription checkout.
 *
 * Cloud only. A self-hosted install has no billing relationship with us and
 * activates a signed licence instead, so this refuses rather than sending a
 * customer to a Stripe page that would bill the wrong party.
 */

export const dynamic = "force-dynamic"

const schema = z.object({
  planId: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.adminOnly)
  if (!auth.user) return auth.response

  try {
    const parsed = schema.safeParse(await request.json())

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

    if (settings.deploymentMode === "self_hosted") {
      return NextResponse.json(
        {
          success: false,
          error: "This install is self-hosted — activate a licence key instead of paying here",
        },
        { status: 400 }
      )
    }

    const stripe = getStripeClient()

    if (!stripe) {
      return NextResponse.json(
        { success: false, error: "Stripe is not configured on this install" },
        { status: 503 }
      )
    }

    const plan = await db.plan.findUnique({ where: { id: parsed.data.planId } })

    if (!plan || plan.status !== "active") {
      return NextResponse.json({ success: false, error: "Plan not available" }, { status: 404 })
    }

    const priceId =
      parsed.data.interval === "yearly" ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId

    if (!priceId) {
      // Naming which price is missing beats a generic Stripe error — this is
      // the first thing that bites when a plan is added without being wired up.
      return NextResponse.json(
        {
          success: false,
          error: `Plan "${plan.code}" has no Stripe ${parsed.data.interval} price configured`,
        },
        { status: 400 }
      )
    }

    const origin = resolveStripeReturnOrigin(request)
    const existing = await db.subscription.findUnique({
      where: { companyId },
      select: { stripeCustomerId: true },
    })

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(existing?.stripeCustomerId ? { customer: existing.stripeCustomerId } : {}),
      // The webhook reads all three back. Without them it cannot say who
      // bought what, and deliberately refuses to guess.
      metadata: {
        companyId,
        planCode: plan.code,
        interval: parsed.data.interval,
      },
      subscription_data: {
        metadata: { companyId, planCode: plan.code },
        ...(plan.trialDays > 0 ? { trial_period_days: plan.trialDays } : {}),
      },
      success_url: `${origin}/settings/subscription?checkout=success`,
      cancel_url: `${origin}/settings/subscription?checkout=cancelled`,
    })

    return NextResponse.json({ success: true, data: { url: session.url, id: session.id } })
  } catch (error) {
    console.error("Failed to start subscription checkout:", error)
    return NextResponse.json(
      { success: false, error: "Failed to start checkout" },
      { status: 500 }
    )
  }
}
