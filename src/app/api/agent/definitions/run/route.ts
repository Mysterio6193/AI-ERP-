import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { runScheduledAgent } from "@/lib/agent/scheduler"

/**
 * Runs a scheduled agent once, now.
 *
 * The point is to test a schedule without waiting for it - the run is identical
 * to the unattended one, including which user it acts as, so what you see here
 * is what the cron will do. It does not consume or move `nextRunAt`.
 */

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || "")

  if (!id) {
    return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
  }

  const result = await runScheduledAgent(id)

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    data: { text: result.text, pending: result.pending, threadId: result.threadId },
  })
}
