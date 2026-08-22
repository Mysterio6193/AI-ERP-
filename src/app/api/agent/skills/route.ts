import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { createSkill, improveSkill, listSkills } from "@/lib/agent/skills"
import { db } from "@/lib/db"

/**
 * Procedures the agent knows.
 *
 * Editable by people as well as the agent: the agent's first draft of how to do
 * something is often nearly right, and correcting it is faster than explaining
 * the correction in every conversation.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("slug")

  try {
    if (slug) {
      const skill = await db.agentSkill.findFirst({
        where: { OR: [{ slug }, { id: slug }] },
        include: { revisions: { orderBy: { version: "desc" } } },
      })

      if (!skill) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
      }

      return NextResponse.json({ success: true, data: skill })
    }

    return NextResponse.json({
      success: true,
      data: await listSkills(searchParams.get("includeArchived") === "true"),
    })
  } catch (error) {
    console.error("Skills read failed:", error)
    return NextResponse.json({ success: false, error: "Failed to load skills" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "create")

  try {
    if (action === "improve") {
      const result = await improveSkill({
        slug: String(body.slug || ""),
        content: String(body.content || ""),
        changeNote: body.changeNote ? String(body.changeNote) : "Edited by hand",
      })

      return result.ok
        ? NextResponse.json({ success: true, data: result.skill })
        : NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    if (action === "archive") {
      const id = String(body.id || "")
      if (!id) {
        return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
      }

      // Archived rather than deleted: a procedure that was followed for months
      // is part of the record of how the business ran.
      await db.agentSkill.update({ where: { id }, data: { status: "archived" } })
      return NextResponse.json({ success: true, data: { id } })
    }

    if (action === "restore") {
      await db.agentSkill.update({ where: { id: String(body.id) }, data: { status: "active" } })
      return NextResponse.json({ success: true, data: { id: body.id } })
    }

    const result = await createSkill({
      name: String(body.name || ""),
      description: String(body.description || ""),
      content: String(body.content || ""),
      tools: Array.isArray(body.tools) ? body.tools : undefined,
      category: body.category,
      createdById: auth.user!.id,
      createdByAgent: false,
    })

    return result.ok
      ? NextResponse.json({ success: true, data: result.skill })
      : NextResponse.json({ success: false, error: result.error }, { status: 400 })
  } catch (error) {
    console.error(`Skill action ${action} failed:`, error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 }
    )
  }
}
