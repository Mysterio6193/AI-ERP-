import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { templateVariables } from "@/lib/message-templates"

/** Edit or retire one template. */

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts"])
  if (!auth.user) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const existing = await db.messageTemplate.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 })
  }

  if (body.body !== undefined && !String(body.body).trim()) {
    return NextResponse.json({ success: false, error: "A template needs a body." }, { status: 400 })
  }

  const updated = await db.messageTemplate.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.channel !== undefined ? { channel: String(body.channel) } : {}),
      ...(body.subject !== undefined ? { subject: body.subject ? String(body.subject) : null } : {}),
      ...(body.body !== undefined ? { body: String(body.body) } : {}),
      ...(body.approvalStatus !== undefined ? { approvalStatus: String(body.approvalStatus) } : {}),
    },
  })

  return NextResponse.json({
    success: true,
    data: { ...updated, variables: templateVariables(`${updated.subject ?? ""} ${updated.body}`) },
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin"])
  if (!auth.user) return auth.response

  const { id } = await params

  const existing = await db.messageTemplate.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 })
  }

  // Messages already sent stored their own text, so removing a template
  // changes nothing that has gone out.
  await db.messageTemplate.delete({ where: { id } })

  return NextResponse.json({ success: true, data: { id } })
}
