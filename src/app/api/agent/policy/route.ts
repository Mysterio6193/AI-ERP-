import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import {
  clampThresholds,
  describeThresholds,
  getThresholds,
  saveThresholds,
  DEFAULT_THRESHOLDS,
  THRESHOLD_LIMITS,
} from "@/lib/agent/policy"
import { db } from "@/lib/db"

/**
 * How much the agent may do on its own.
 *
 * `saveThresholds` has existed since the policy engine was written and had no
 * caller — the limits were whatever `DEFAULT_THRESHOLDS` said, and there was no
 * way to change them. This is that missing surface.
 *
 * **Human-only, by construction.** Writes require an admin session, so the
 * agent cannot reach this endpoint: it has no session and its tools do not
 * include HTTP. When settings-as-tools lands, the tool that lets it propose
 * changes must hard-reject the `agent.` namespace in its own body, so the agent
 * can never raise its own ceiling even with someone tapping Approve on a card
 * they skimmed.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  const thresholds = await getThresholds()

  return NextResponse.json({
    success: true,
    data: {
      thresholds,
      defaults: DEFAULT_THRESHOLDS,
      limits: THRESHOLD_LIMITS,
      // Rendered above the form, so nobody has to infer what a number means.
      summary: describeThresholds(thresholds),
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))

  const current = await getThresholds()

  if (body.reset === true) {
    const restored = await saveThresholds(DEFAULT_THRESHOLDS)
    await record(auth.user?.id, current, restored, "reset")

    return NextResponse.json({
      success: true,
      data: { thresholds: restored, summary: describeThresholds(restored) },
    })
  }

  // Clamped server-side. The form does its own bounding, but a form is not a
  // guarantee — this endpoint is the one that decides.
  const next = clampThresholds(body as Record<string, unknown>, current)
  const saved = await saveThresholds(next)

  await record(auth.user?.id, current, saved, "update")

  return NextResponse.json({
    success: true,
    data: { thresholds: saved, summary: describeThresholds(saved) },
  })
}

/**
 * Autonomy changes are exactly the thing someone needs to reconstruct after an
 * incident — "who let it place $50,000 orders, and when".
 */
async function record(
  userId: string | undefined,
  before: unknown,
  after: unknown,
  action: string
) {
  try {
    await db.auditLog.create({
      data: {
        entityType: "agent_policy",
        entityId: "agent.thresholds",
        action,
        userId: userId || null,
        oldValues: JSON.stringify(before),
        newValues: JSON.stringify(after),
      },
    })
  } catch (error) {
    // The threshold change already succeeded; losing its audit row must not
    // fail the request, but it must be visible.
    console.error("Failed to write agent policy audit log:", error)
  }
}
