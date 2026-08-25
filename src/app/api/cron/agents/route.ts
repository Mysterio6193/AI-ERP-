import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest, hasRole } from "@/lib/admin-auth"
import { tick } from "@/lib/agent/scheduler"
import { bearerToken, secretEquals } from "@/lib/secret-compare"

/**
 * The scheduler tick.
 *
 * Called by an external scheduler (Vercel Cron, systemd timer, any pinger) on
 * whatever interval suits the finest schedule in use - every 5 minutes is a
 * sensible default. Running more often than needed is harmless: due-ness comes
 * from each agent's `nextRunAt`, not from when the tick arrived.
 *
 * Auth is deliberately not the normal session check, because there is no user
 * behind a cron request. Either a shared secret in `CRON_SECRET`, or a signed-in
 * admin hitting it by hand to test.
 */

export const maxDuration = 300
export const dynamic = "force-dynamic"

function authorised(request: NextRequest) {
  // Constant-time: this endpoint is public and may be called as often as the
  // caller likes, which is exactly the condition a timing attack needs.
  return secretEquals(process.env.CRON_SECRET, bearerToken(request.headers, "x-cron-secret"))
}

async function handle(request: NextRequest) {
  const viaSecret = authorised(request)

  if (!viaSecret) {
    // Fall back to an admin session so this is testable from the app, and so a
    // deployment with no CRON_SECRET set is not wide open.
    const user = await getAdminUserFromRequest(request)

    if (!hasRole(user, ["admin"])) {
      return NextResponse.json(
        {
          success: false,
          error: process.env.CRON_SECRET
            ? "Unauthorized"
            : "CRON_SECRET is not set. Set it and send it as a Bearer token, or sign in as an admin.",
        },
        { status: 401 }
      )
    }
  }

  try {
    const result = await tick()

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        at: new Date().toISOString(),
        invokedBy: viaSecret ? "cron" : "admin",
      },
    })
  } catch (error) {
    console.error("Scheduler tick failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Tick failed" },
      { status: 500 }
    )
  }
}

// GET so platform cron products that only issue GETs work unchanged.
export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
