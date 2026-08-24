import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ensureDefaultTemplates, templateVariables } from "@/lib/message-templates"
import { ROLE_SETS } from "@/lib/permissions"

/**
 * Reusable messages.
 *
 * MessageTemplate was modelled and nothing ever created one or read one, so
 * every chase and confirmation was written from scratch and the wording drifted
 * each time.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.commercial)
  if (!auth.user) return auth.response

  // The starting set appears on first read rather than needing a seeding step
  // nobody would run.
  await ensureDefaultTemplates(db)

  const templates = await db.messageTemplate.findMany({ orderBy: { name: "asc" } })

  return NextResponse.json({
    success: true,
    data: templates.map((t) => ({
      ...t,
      // So a caller can see what it must supply before sending.
      variables: templateVariables(`${t.subject ?? ""} ${t.body}`),
    })),
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts"])
  if (!auth.user) return auth.response

  const body = await request.json().catch(() => ({}))

  const name = String(body.name || "").trim()
  const templateBody = String(body.body || "").trim()

  if (!name || !templateBody) {
    return NextResponse.json(
      { success: false, error: "A template needs a name and a body." },
      { status: 400 }
    )
  }

  const clash = await db.messageTemplate.findFirst({ where: { name }, select: { id: true } })

  if (clash) {
    // Names are how a template is chosen in a tool call, so two sharing one
    // means the caller cannot say which it wants.
    return NextResponse.json(
      { success: false, error: `A template named "${name}" already exists.` },
      { status: 409 }
    )
  }

  const created = await db.messageTemplate.create({
    data: {
      name,
      channel: String(body.channel || "email"),
      subject: body.subject ? String(body.subject) : null,
      body: templateBody,
      approvalStatus: String(body.approvalStatus || "draft"),
      externalTemplateName: body.externalTemplateName ? String(body.externalTemplateName) : null,
    },
  })

  return NextResponse.json(
    { success: true, data: { ...created, variables: templateVariables(`${created.subject ?? ""} ${created.body}`) } },
    { status: 201 }
  )
}
