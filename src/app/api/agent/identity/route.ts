import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { ensureAgentUser, getAgentIdentity, saveAgentIdentity } from "@/lib/agent/identity"

/**
 * The agent's identity: its name, its email address, its phone number, and
 * the disclosure line that keeps it from ever reading as a person.
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if (auth.response) {
    return auth.response
  }

  const [identity, user] = await Promise.all([getAgentIdentity(), ensureAgentUser()])

  return NextResponse.json({ success: true, data: { identity, user } })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))

  const identity = await saveAgentIdentity({
    name: body.name ? String(body.name) : undefined,
    email: body.email ? String(body.email) : undefined,
    phone: body.phone !== undefined ? (body.phone ? String(body.phone) : null) : undefined,
    signature: body.signature ? String(body.signature) : undefined,
    disclosure: body.disclosure ? String(body.disclosure) : undefined,
  })

  return NextResponse.json({ success: true, data: identity })
}
