import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { resolveStaffPrincipal } from "@/lib/agent/context"
import { resolveProposal, runAgentTurn, type AgentTurn } from "@/lib/agent/runtime"
import { db } from "@/lib/db"

/**
 * Telegram demo.
 *
 * Runs the exact Telegram path - the ops persona, the same tools, the same
 * policy thresholds and the same approval flow - but returns the reply instead
 * of handing it to Telegram's API. That means the experience can be shown and
 * tested before a bot token exists, and any difference between this and the
 * real bot is only transport.
 */

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if (auth.response) {
    return auth.response
  }

  const principal = await resolveStaffPrincipal(auth.user!.id)
  if (!principal) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const message = String(body.message || "").trim()
  const approve = body.approve as { proposalId: string; approved: boolean } | undefined

  // A demo chat is still a real conversation, kept apart from the live one.
  const threadKey = `demo:${auth.user!.id}`

  try {
    if (approve?.proposalId) {
      const turn = await resolveProposal({
        proposalId: approve.proposalId,
        approved: approve.approved,
        principal,
        decidedByUserId: auth.user!.id,
        note: approve.approved ? "Approved in demo" : "Rejected in demo",
      })

      if ("ok" in turn && turn.ok === false) {
        return NextResponse.json({ success: false, error: turn.error }, { status: 403 })
      }

      const successfulTurn = turn as AgentTurn
      return NextResponse.json({
        success: true,
        data: { text: successfulTurn.text, pendingApprovals: successfulTurn.pendingApprovals },
      })
    }

    if (!message) {
      return NextResponse.json({ success: false, error: "message is required" }, { status: 400 })
    }

    const turn = await runAgentTurn({
      principal,
      channel: "telegram",
      threadKey,
      userMessage: message,
      trigger: "demo",
    })

    return NextResponse.json({
      success: true,
      data: {
        text: 'ok' in turn ? '' : turn.text,
        pendingApprovals: 'ok' in turn ? [] : turn.pendingApprovals,
        threadId: 'ok' in turn ? '' : turn.threadId,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Agent failed" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if (auth.response) {
    return auth.response
  }

  // Start the demo over without touching the real Telegram thread.
  await db.agentThread.deleteMany({
    where: { channel: "telegram", threadKey: `demo:${auth.user!.id}` },
  })

  return NextResponse.json({ success: true })
}
