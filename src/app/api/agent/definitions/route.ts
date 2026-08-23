import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { ensureSystemDefinitions } from "@/lib/agent/definitions"
import { recomputeNextRun } from "@/lib/agent/scheduler"
import { TOOL_POLICY, listToolNames } from "@/lib/agent/tools"
import { validateCron } from "@/lib/cron"
import { db } from "@/lib/db"

/**
 * Agent definitions CRUD.
 *
 * Building an agent is choosing three things: what it is told, which tools it
 * can reach, and how much it may do alone. The tool catalogue is served
 * alongside so the editor can show risk per tool rather than a bare name list -
 * picking `recordPayment` should look different to picking `searchProducts`.
 */

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  try {
    await ensureSystemDefinitions()

    const definitions = await db.agentDefinition.findMany({
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    })

    return NextResponse.json({
      success: true,
      data: {
        definitions: definitions.map((definition) => ({
          ...definition,
          tools: definition.toolsJson ? JSON.parse(definition.toolsJson) : null,
          thresholds: definition.thresholdsJson ? JSON.parse(definition.thresholdsJson) : null,
        })),
        catalogue: listToolNames().map((name) => ({
          name,
          risk: TOOL_POLICY[name].risk,
          roles: TOOL_POLICY[name].roles ?? null,
          alwaysApprove: TOOL_POLICY[name].alwaysApprove ?? false,
        })),
      },
    })
  } catch (error) {
    console.error("Failed to load agent definitions:", error)
    return NextResponse.json({ success: false, error: "Failed to load agents" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const name = String(body.name || "").trim()

  if (!name) {
    return NextResponse.json({ success: false, error: "name is required" }, { status: 400 })
  }

  const instructions = String(body.instructions || "").trim()
  if (!instructions) {
    return NextResponse.json(
      { success: false, error: "instructions are required - an agent with no brief does nothing useful" },
      { status: 400 }
    )
  }

  // Unknown tool names are dropped rather than stored, so the allowlist can
  // never contain something the policy engine would deny at call time.
  const tools = Array.isArray(body.tools)
    ? body.tools.filter((tool: unknown): tool is string => typeof tool === "string" && tool in TOOL_POLICY)
    : null

  let slug = slugify(body.slug || name)
  if (!slug) {
    return NextResponse.json({ success: false, error: "name must contain letters or numbers" }, { status: 400 })
  }

  // Slugs are the persona written onto every run, so they must stay unique.
  const existing = await db.agentDefinition.findUnique({ where: { slug } })
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`
  }

  if (body.schedule) {
    const check = validateCron(String(body.schedule))

    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    }
  }

  try {
    const created = await db.agentDefinition.create({
      data: {
        slug,
        name,
        description: body.description ? String(body.description) : null,
        avatar: body.avatar ? String(body.avatar) : "🤖",
        instructions,
        toolsJson: tools ? JSON.stringify(tools) : null,
        audience: body.audience === "customer" ? "customer" : "staff",
        model: body.model ? String(body.model).trim() : null,
        maxSteps: Number(body.maxSteps) > 0 ? Math.min(Number(body.maxSteps), 30) : 12,
        thresholdsJson: body.thresholds ? JSON.stringify(body.thresholds) : null,
        trigger: ["manual", "schedule", "event"].includes(String(body.trigger))
          ? String(body.trigger)
          : "manual",
        schedule: body.schedule ? String(body.schedule) : null,
        runPrompt: body.runPrompt ? String(body.runPrompt) : null,
        enabled: body.enabled !== false,
        createdById: auth.user!.id,
        // Unattended runs act as this person, so their role and thresholds
        // bound what the schedule can do.
        runAsUserId: body.runAsUserId ? String(body.runAsUserId) : auth.user!.id,
      },
    })

    if (created.trigger === "schedule") {
      await recomputeNextRun(created.id)
    }

    return NextResponse.json({ success: true, data: created })
  } catch (error) {
    console.error("Failed to create agent:", error)
    return NextResponse.json({ success: false, error: "Failed to create agent" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || "")

  if (!id) {
    return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if (body.name !== undefined) data.name = String(body.name)
  if (body.description !== undefined) data.description = String(body.description)
  if (body.avatar !== undefined) data.avatar = String(body.avatar)
  if (body.instructions !== undefined) data.instructions = String(body.instructions)
  if (body.enabled !== undefined) data.enabled = Boolean(body.enabled)
  if (body.model !== undefined) data.model = body.model ? String(body.model).trim() : null
  if (body.maxSteps !== undefined) data.maxSteps = Math.min(Math.max(Number(body.maxSteps), 1), 30)
  if (body.schedule !== undefined) data.schedule = body.schedule ? String(body.schedule) : null
  if (body.runPrompt !== undefined) data.runPrompt = body.runPrompt ? String(body.runPrompt) : null
  if (body.trigger !== undefined && ["manual", "schedule", "event"].includes(String(body.trigger))) {
    data.trigger = String(body.trigger)
  }

  if (body.tools !== undefined) {
    data.toolsJson =
      body.tools === null
        ? null
        : JSON.stringify(
            (body.tools as unknown[]).filter(
              (tool): tool is string => typeof tool === "string" && tool in TOOL_POLICY
            )
          )
  }

  if (body.thresholds !== undefined) {
    data.thresholdsJson = body.thresholds ? JSON.stringify(body.thresholds) : null
  }

  // A schedule that does not parse must be refused at the edit, not discovered
  // by a tick at 3am.
  if (typeof data.schedule === "string" && data.schedule) {
    const check = validateCron(data.schedule)

    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    }
  }

  try {
    const updated = await db.agentDefinition.update({ where: { id }, data })

    // Anything that changes whether or when it fires invalidates nextRunAt.
    if (
      body.schedule !== undefined ||
      body.trigger !== undefined ||
      body.enabled !== undefined
    ) {
      await recomputeNextRun(updated.id)
    }

    const fresh = await db.agentDefinition.findUnique({ where: { id } })
    return NextResponse.json({ success: true, data: fresh })
  } catch (error) {
    console.error("Failed to update agent:", error)
    return NextResponse.json({ success: false, error: "Failed to update agent" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
  }

  const definition = await db.agentDefinition.findUnique({ where: { id } })

  if (!definition) {
    return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 })
  }

  // Built-ins back the default staff and customer surfaces; deleting one would
  // silently drop those conversations to the fallback prompt.
  if (definition.isSystem) {
    return NextResponse.json(
      { success: false, error: "Built-in agents can be disabled or edited, but not deleted" },
      { status: 400 }
    )
  }

  await db.agentDefinition.delete({ where: { id } })

  return NextResponse.json({ success: true, data: { id } })
}
