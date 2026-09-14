import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"
import { getSettings } from "@/lib/settings/service"
import {
  hashLicenseKey,
  installFingerprint,
  licenseHint,
  verifyLicense,
} from "@/lib/subscription/license"
import { getEntitlementState, recordEvent, setSubscription } from "@/lib/subscription/service"

/**
 * Licence activation, for an install that cannot reach our billing server.
 *
 * The whole check is a signature verification against the public key in the
 * environment: no outbound call, so this works on a machine with no internet
 * at all. That is the point — a self-hosted customer must not be one DNS
 * failure away from losing their ERP.
 */

export const dynamic = "force-dynamic"

const activateSchema = z.object({
  key: z.string().trim().min(16).max(4000),
})

function publicKey() {
  return process.env.LICENSE_PUBLIC_KEY?.replace(/\\n/g, "\n") ?? null
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.adminOnly)
  if (!auth.user) return auth.response

  const companyId = await getActiveCompanyId(request)

  const subscription = companyId
    ? await db.subscription.findUnique({
        where: { companyId },
        include: { licenseKey: { include: { plan: { select: { code: true, name: true } } } } },
      })
    : null

  return NextResponse.json({
    success: true,
    data: {
      configured: Boolean(publicKey()),
      license: subscription?.licenseKey
        ? {
            hint: subscription.licenseKey.keyHint,
            issuedTo: subscription.licenseKey.issuedTo,
            seats: subscription.licenseKey.seats,
            plan: subscription.licenseKey.plan,
            expiresAt: subscription.licenseKey.expiresAt,
            activatedAt: subscription.licenseKey.activatedAt,
            status: subscription.licenseKey.status,
          }
        : null,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.adminOnly)
  if (!auth.user) return auth.response

  try {
    const parsed = activateSchema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "That does not look like a licence key" },
        { status: 400 }
      )
    }

    const pem = publicKey()

    if (!pem) {
      // Naming the missing variable beats a generic failure — this is the
      // first thing a self-hosted operator hits if the build was misconfigured.
      return NextResponse.json(
        {
          success: false,
          error: "This install has no LICENSE_PUBLIC_KEY set, so licences cannot be checked",
        },
        { status: 500 }
      )
    }

    const result = verifyLicense(parsed.data.key, pem)

    if (!result.valid) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 })
    }

    const companyId = await getActiveCompanyId(request)

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "No active company to license" },
        { status: 400 }
      )
    }

    const settings = await getSettings("subscription", { companyId })
    const plan = await db.plan.findUnique({
      where: { code: result.payload.plan },
      select: { id: true, code: true, name: true },
    })

    if (!plan) {
      return NextResponse.json(
        {
          success: false,
          error: `This licence is for plan "${result.payload.plan}", which this install does not have`,
        },
        { status: 400 }
      )
    }

    const keyHash = hashLicenseKey(parsed.data.key)
    const fingerprint = installFingerprint(companyId)

    const existing = await db.licenseKey.findUnique({ where: { keyHash } })

    if (existing?.status === "revoked") {
      return NextResponse.json(
        { success: false, error: "This licence has been revoked" },
        { status: 403 }
      )
    }

    // Bound to one install. Re-activating on the same install is fine — that
    // happens on every restore from backup — but a second site is not.
    if (
      existing?.activationFingerprint &&
      existing.activationFingerprint !== fingerprint
    ) {
      return NextResponse.json(
        { success: false, error: "This licence is already activated on another install" },
        { status: 409 }
      )
    }

    const expiresAt = result.payload.expires ? new Date(result.payload.expires) : null

    const licenseKey = existing
      ? await db.licenseKey.update({
          where: { id: existing.id },
          data: {
            activatedAt: existing.activatedAt ?? new Date(),
            activationFingerprint: fingerprint,
            status: result.expired ? "expired" : "active",
          },
        })
      : await db.licenseKey.create({
          data: {
            keyHash,
            keyHint: licenseHint(parsed.data.key),
            planId: plan.id,
            issuedTo: result.payload.issuedTo,
            seats: result.payload.seats,
            expiresAt,
            activatedAt: new Date(),
            activationFingerprint: fingerprint,
            status: result.expired ? "expired" : "active",
          },
        })

    const applied = await setSubscription({
      companyId,
      planId: plan.id,
      // An expired licence is authentic, so it is recorded rather than
      // refused; the grace rules in settings then decide what it still buys.
      status: result.expired ? "expired" : "active",
      source: "license",
      seats: result.payload.seats,
      currentPeriodEnd: expiresAt,
      licenseKeyId: licenseKey.id,
      detail: `licence ${licenseKey.keyHint} activated by ${auth.user.email}`,
    })

    if (!applied.ok) {
      return NextResponse.json({ success: false, error: applied.error }, { status: 400 })
    }

    await recordEvent({
      subscriptionId: applied.subscription.id,
      type: "license_activated",
      toPlanCode: plan.code,
      detail: `${licenseKey.keyHint}, ${result.payload.seats} seat(s)${
        expiresAt ? `, expires ${expiresAt.toISOString().slice(0, 10)}` : ", perpetual"
      }`,
    })

    return NextResponse.json({
      success: true,
      data: {
        plan,
        expired: result.expired,
        daysRemaining: result.daysRemaining,
        graceDays: settings.graceDays,
        state: await getEntitlementState(companyId),
      },
    })
  } catch (error) {
    console.error("Failed to activate licence:", error)
    return NextResponse.json(
      { success: false, error: "Failed to activate licence" },
      { status: 500 }
    )
  }
}
