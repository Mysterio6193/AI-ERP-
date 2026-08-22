import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { forget, listMemories, remember } from "@/lib/agent/memory"
import { db } from "@/lib/db"

/**
 * What the agent knows.
 *
 * Visible and correctable on purpose. An assistant that accumulates beliefs
 * nobody can inspect is one nobody should trust, and the cheapest fix for a
 * wrong answer is usually deleting the wrong fact behind it.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get("scope") as "company" | "user" | "entity" | null

  try {
    const memories = await listMemories({
      scope: scope || undefined,
      // Personal memory is only ever the caller's own, whatever they ask for.
      userId: scope === "user" ? auth.user!.id : undefined,
      includeSuperseded: searchParams.get("includeSuperseded") === "true",
      limit: 200,
    })

    // Personal rows belonging to other people are removed even in an unscoped
    // listing, so the screen cannot become a way to read a colleague's notes.
    const visible = memories.filter(
      (memory) => memory.scope !== "user" || memory.userId === auth.user!.id
    )

    // Resolve entity names so a fact about a customer reads as one.
    const customerIds = visible
      .filter((memory) => memory.entityType === "customer" && memory.entityId)
      .map((memory) => memory.entityId as string)

    const customers = customerIds.length
      ? await db.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : []

    const nameById = new Map(customers.map((row) => [row.id, row.name]))

    return NextResponse.json({
      success: true,
      data: visible.map((memory) => ({
        ...memory,
        entityName: memory.entityId ? nameById.get(memory.entityId) ?? null : null,
      })),
    })
  } catch (error) {
    console.error("Memory read failed:", error)
    return NextResponse.json({ success: false, error: "Failed to load memory" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const scope = String(body.scope || "company")

  if (!["company", "user", "entity"].includes(scope)) {
    return NextResponse.json({ success: false, error: "Invalid scope" }, { status: 400 })
  }

  try {
    const result = await remember({
      scope: scope as "company" | "user" | "entity",
      content: String(body.content || ""),
      key: body.key ? String(body.key) : undefined,
      category: body.category,
      importance: body.importance !== undefined ? Number(body.importance) : undefined,
      userId: scope === "user" ? auth.user!.id : undefined,
      entityType: body.entityType ? String(body.entityType) : undefined,
      entityId: body.entityId ? String(body.entityId) : undefined,
      // Marked so a human-taught fact is distinguishable from an inferred one.
      source: "user",
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result.memory })
  } catch (error) {
    console.error("Memory write failed:", error)
    return NextResponse.json({ success: false, error: "Failed to save" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
  }

  const memory = await db.agentMemory.findUnique({
    where: { id },
    select: { scope: true, userId: true },
  })

  if (!memory) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  if (memory.scope === "user" && memory.userId !== auth.user!.id) {
    return NextResponse.json(
      { success: false, error: "That memory belongs to someone else" },
      { status: 403 }
    )
  }

  await forget(id)
  return NextResponse.json({ success: true, data: { id } })
}
