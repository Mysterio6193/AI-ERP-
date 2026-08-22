import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { createLinkCode } from "@/lib/agent/channels/identity"
import { db } from "@/lib/db"

// Issues the one-time code a staff member sends to the bot as /link CODE.

export async function GET(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const identities = await db.channelIdentity.findMany({
    where: { userId: user.id, status: "active" },
    select: { id: true, channel: true, displayName: true, verifiedAt: true },
  })

  return NextResponse.json({ success: true, data: { identities } })
}

export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const channel = String(body.channel || "telegram")
  const link = await createLinkCode(user.id, channel)

  return NextResponse.json({ success: true, data: link })
}

export async function DELETE(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
  }

  await db.channelIdentity.deleteMany({ where: { id, userId: user.id } })

  return NextResponse.json({ success: true })
}
