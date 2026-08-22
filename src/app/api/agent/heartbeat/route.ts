import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { getHeartbeatConfig, heartbeat, saveHeartbeatConfig } from "@/lib/agent/heartbeat"
import { collectSignals } from "@/lib/agent/signals"
import { resolveAlertRecipients } from "@/lib/agent/notify"
import { db } from "@/lib/db"

/**
 * The watch loop: what it can see, what it would say, and the thresholds that
 * decide. Reading it never sends anything.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  try {
    const config = await getHeartbeatConfig()

    const [signals, recipients, recent] = await Promise.all([
      collectSignals(config),
      resolveAlertRecipients(config.roles),
      db.agentNotification.findMany({
        orderBy: { sentAt: "desc" },
        take: 25,
        select: {
          id: true,
          kind: true,
          severity: true,
          title: true,
          body: true,
          status: true,
          sentAt: true,
          channel: true,
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        config,
        recipients: recipients.map((user) => ({ id: user.id, name: user.name, role: user.role })),
        // What it can see right now. An empty list on a normal day is correct.
        signals: signals.map((signal) => ({
          kind: signal.kind,
          severity: signal.severity,
          title: signal.title,
          body: signal.body,
          weight: signal.weight,
        })),
        recent,
      },
    })
  } catch (error) {
    console.error("Heartbeat read failed:", error)
    return NextResponse.json({ success: false, error: "Failed to load heartbeat" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "config")

  try {
    if (action === "run") {
      // dryRun by default: seeing what it would say must not contact anyone
      // unless that was asked for explicitly.
      const result = await heartbeat({ dryRun: body.dryRun !== false })
      return NextResponse.json({ success: true, data: result })
    }

    const next = await saveHeartbeatConfig({
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
      maxPerTick:
        body.maxPerTick !== undefined
          ? Math.min(Math.max(Number(body.maxPerTick), 1), 20)
          : undefined,
      overdueDays: body.overdueDays !== undefined ? Number(body.overdueDays) : undefined,
      overdueAmount: body.overdueAmount !== undefined ? Number(body.overdueAmount) : undefined,
      approvalStaleHours:
        body.approvalStaleHours !== undefined ? Number(body.approvalStaleHours) : undefined,
      lapsedMonthlyValue:
        body.lapsedMonthlyValue !== undefined ? Number(body.lapsedMonthlyValue) : undefined,
      stockOutMinOrders:
        body.stockOutMinOrders !== undefined ? Number(body.stockOutMinOrders) : undefined,
      freightCutoffWarningHours:
        body.freightCutoffWarningHours !== undefined
          ? Number(body.freightCutoffWarningHours)
          : undefined,
      // These three are in HeartbeatConfig and were silently dropped here, so
      // expiry alerting could not be tuned and alerts always went to admins.
      expiryWarningDays:
        body.expiryWarningDays !== undefined
          ? Math.min(Math.max(Number(body.expiryWarningDays), 0), 365)
          : undefined,
      expiryMinValue:
        body.expiryMinValue !== undefined
          ? Math.max(Number(body.expiryMinValue), 0)
          : undefined,
      roles: Array.isArray(body.roles)
        ? body.roles.map((role: unknown) => String(role)).filter(Boolean)
        : undefined,
    })

    return NextResponse.json({ success: true, data: next })
  } catch (error) {
    console.error("Heartbeat action failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 }
    )
  }
}
