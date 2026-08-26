import { randomBytes } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"

/**
 * Issue or replace this person's calendar subscription URL.
 *
 * Regeneration is the only way to revoke a feed URL that has been shared or
 * leaked, so it is a first-class action rather than something requiring support.
 */

function feedUrl(request: NextRequest, token: string) {
  const base = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin
  return `${base.replace(/\/$/, "")}/api/calendar/${token}`
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse", "driver"])
  if (auth.response) return auth.response

  const user = await db.user.findUnique({
    where: { id: auth.user!.id },
    select: { calendarFeedToken: true },
  })

  return NextResponse.json({
    success: true,
    data: {
      url: user?.calendarFeedToken ? feedUrl(request, user.calendarFeedToken) : null,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse", "driver"])
  if (auth.response) return auth.response

  // 32 bytes: the URL is the credential, so it has to be long enough that
  // guessing is not a strategy.
  const token = randomBytes(32).toString("base64url")

  await db.user.update({
    where: { id: auth.user!.id },
    data: { calendarFeedToken: token },
  })

  return NextResponse.json({
    success: true,
    data: {
      url: feedUrl(request, token),
      note: "Anyone with this link can see your schedule. Generating a new one immediately stops the old link working.",
    },
  })
}
