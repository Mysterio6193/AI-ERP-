import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { resolveStaffPrincipal } from "@/lib/agent/context"
import { resolveProposal } from "@/lib/agent/runtime"
import { db } from "@/lib/db"

// The approval queue: everything the agent wanted to do but could not do alone.

export async function GET(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") || "pending"

  const proposals = await db.agentProposal.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return NextResponse.json({ success: true, data: proposals })
}

export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const principal = await resolveStaffPrincipal(user.id)
  if (!principal) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const proposalId = String(body.proposalId || "")
  const approved = Boolean(body.approved)

  if (!proposalId) {
    return NextResponse.json({ success: false, error: "proposalId is required" }, { status: 400 })
  }

  try {
    const turn = await resolveProposal({
      proposalId,
      approved,
      principal,
      decidedByUserId: user.id,
      note: body.note ? String(body.note) : undefined,
    })

    return NextResponse.json({ success: true, data: turn })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 400 }
    )
  }
}
