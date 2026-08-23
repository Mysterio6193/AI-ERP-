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

  // An admin needs to see who on the team is connected; everyone else sees
  // only their own. Without this an admin had no way to tell whether a staff
  // member had linked, or to unlink someone who had left.
  const isAdmin = user.role === "admin"

  const identities = await db.channelIdentity.findMany({
    where: { status: "active", ...(isAdmin ? {} : { userId: user.id }) },
    select: { id: true, channel: true, displayName: true, verifiedAt: true, userId: true },
    orderBy: { verifiedAt: "desc" },
  })

  const owners = isAdmin
    ? await db.user.findMany({
        where: { id: { in: identities.map((i) => i.userId).filter(Boolean) as string[] } },
        select: { id: true, name: true, email: true, role: true },
      })
    : []

  const ownerById = new Map(owners.map((o) => [o.id, o]))

  return NextResponse.json({
    success: true,
    data: {
      identities: identities.map((i) => ({
        ...i,
        mine: i.userId === user.id,
        owner: i.userId ? (ownerById.get(i.userId) ?? null) : null,
      })),
      canLinkOthers: isAdmin,
    },
  })
}

export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const channel = String(body.channel || "telegram")

  // Was always the signed-in user's own id, so an admin could only ever link
  // themselves — and once they had, generating another code just re-linked the
  // same account. Every other staff member needed their own working login to
  // self-serve, which is why a team could not be onboarded.
  const targetUserId = body.userId ? String(body.userId) : user.id

  if (targetUserId !== user.id) {
    if (user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Only an admin can create a link code for someone else." },
        { status: 403 }
      )
    }

    const target = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, status: true },
    })

    if (!target) {
      return NextResponse.json({ success: false, error: "That staff member was not found." }, { status: 404 })
    }

    if (target.status !== "active") {
      // The code would be issued and then refused at the bot, because the
      // principal cannot be resolved for an inactive account.
      return NextResponse.json(
        { success: false, error: `${target.name} is not an active staff member.` },
        { status: 400 }
      )
    }
  }

  const link = await createLinkCode(targetUserId, channel)

  const owner = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true },
  })

  return NextResponse.json({
    success: true,
    data: { ...link, forUser: owner, forSelf: targetUserId === user.id },
  })
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

  // Scoped to the caller unless they are an admin, who must be able to
  // disconnect someone who has left.
  await db.channelIdentity.deleteMany({
    where: { id, ...(user.role === "admin" ? {} : { userId: user.id }) },
  })

  return NextResponse.json({ success: true })
}
