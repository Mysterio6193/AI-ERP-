import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { emitDomainEvent, eventId } from "@/lib/agent/events/dispatch"
import { EVENT_CATALOGUE, KNOWN_EVENT_TYPES } from "@/lib/agent/events/catalogue"

/** Agents that wake when something happens, rather than on a clock. */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)

  try {
    if (searchParams.get("view") === "log") {
      const log = await db.agentEventLog.findMany({
        where: searchParams.get("subscriptionId")
          ? { subscriptionId: String(searchParams.get("subscriptionId")) }
          : {},
        orderBy: { startedAt: "desc" },
        take: 100,
        select: {
          id: true,
          eventId: true,
          eventType: true,
          ran: true,
          reason: true,
          startedAt: true,
          subscription: { select: { id: true, agent: { select: { name: true, slug: true } } } },
        },
      })

      return NextResponse.json({ success: true, data: log })
    }

    const subscriptions = await db.agentEventSubscription.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        eventType: true,
        enabled: true,
        filtersJson: true,
        companyId: true,
        maxPerHour: true,
        cooldownSeconds: true,
        cooldownKeyPath: true,
        prompt: true,
        agent: { select: { id: true, name: true, slug: true, enabled: true } },
        _count: { select: { log: true } },
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        // The full descriptors, so the UI can offer real payload paths and say
        // plainly which types nothing raises yet.
        eventTypes: EVENT_CATALOGUE,
        subscriptions: subscriptions.map((row) => ({
          ...row,
          filters: row.filtersJson ? safeParse(row.filtersJson) : [],
        })),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load" },
      { status: 500 }
    )
  }
}

function safeParse(json: string) {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")
  const companyId = await getActiveCompanyId(request)

  try {
    if (action === "subscribe") {
      const eventType = String(body.eventType || "")

      // Checked against the known list rather than accepted as free text: a
      // typo would create a subscription that can never fire and looks
      // configured, which is the defect this whole feature exists to fix.
      if (!(KNOWN_EVENT_TYPES as readonly string[]).includes(eventType)) {
        return NextResponse.json(
          { success: false, error: `Unknown event type. One of: ${KNOWN_EVENT_TYPES.join(", ")}` },
          { status: 400 }
        )
      }

      const agent = await db.agentDefinition.findFirst({
        where: body.agentId ? { id: String(body.agentId) } : { slug: String(body.agentSlug || "") },
        select: { id: true },
      })

      if (!agent) {
        return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 })
      }

      const created = await db.agentEventSubscription.create({
        data: {
          agentId: agent.id,
          eventType,
          enabled: body.enabled !== false,
          filtersJson: Array.isArray(body.filters) ? JSON.stringify(body.filters) : null,
          companyId: body.groupWide ? null : companyId,
          maxPerHour: Number.isFinite(Number(body.maxPerHour)) ? Number(body.maxPerHour) : 60,
          cooldownSeconds: Number.isFinite(Number(body.cooldownSeconds))
            ? Number(body.cooldownSeconds)
            : 0,
          cooldownKeyPath: body.cooldownKeyPath ? String(body.cooldownKeyPath) : null,
          prompt: body.prompt ? String(body.prompt) : null,
        },
        select: { id: true },
      })

      // The definition's own trigger has to say "event" too, or the UI shows
      // an agent that looks manual while it is quietly waking on its own.
      await db.agentDefinition.update({
        where: { id: agent.id },
        data: { trigger: "event" },
      })

      return NextResponse.json({ success: true, data: created })
    }

    if (action === "update") {
      if (!body.id) {
        return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
      }

      const updated = await db.agentEventSubscription.update({
        where: { id: String(body.id) },
        data: {
          ...(body.enabled !== undefined ? { enabled: !!body.enabled } : {}),
          ...(body.filters !== undefined
            ? { filtersJson: Array.isArray(body.filters) ? JSON.stringify(body.filters) : null }
            : {}),
          ...(body.maxPerHour !== undefined ? { maxPerHour: Number(body.maxPerHour) } : {}),
          ...(body.cooldownSeconds !== undefined
            ? { cooldownSeconds: Number(body.cooldownSeconds) }
            : {}),
          ...(body.cooldownKeyPath !== undefined
            ? { cooldownKeyPath: body.cooldownKeyPath ? String(body.cooldownKeyPath) : null }
            : {}),
          ...(body.prompt !== undefined ? { prompt: body.prompt ? String(body.prompt) : null } : {}),
        },
        select: { id: true, enabled: true },
      })

      return NextResponse.json({ success: true, data: updated })
    }

    if (action === "unsubscribe") {
      if (!body.id) {
        return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
      }

      await db.agentEventSubscription.delete({ where: { id: String(body.id) } })
      return NextResponse.json({ success: true })
    }

    if (action === "test") {
      // Raises a real event with a made-up payload, so a rule can be checked
      // before it is trusted with the business. The id carries a marker and a
      // timestamp so a test never collides with a real occurrence.
      const eventType = String(body.eventType || "")

      if (!(KNOWN_EVENT_TYPES as readonly string[]).includes(eventType)) {
        return NextResponse.json({ success: false, error: "Unknown event type" }, { status: 400 })
      }

      const outcome = await emitDomainEvent({
        type: eventType,
        id: eventId(eventType, "test", Date.now()),
        occurredAt: new Date(),
        companyId,
        payload: (body.payload as Record<string, unknown>) ?? {},
      })

      return NextResponse.json({ success: true, data: outcome })
    }

    return NextResponse.json(
      {
        success: false,
        error: `Unknown action "${action}". Expected subscribe, update, unsubscribe or test.`,
      },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    )
  }
}
