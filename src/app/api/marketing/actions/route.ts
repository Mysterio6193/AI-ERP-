import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import {
  attributeCampaign,
  buildCampaign,
  sendCampaign,
  writeCampaignMessage,
} from "@/lib/marketing"
import { evaluateSegment, validateDefinition, type SegmentDefinition } from "@/lib/segments"

/**
 * Marketing write actions.
 *
 * Every handler here is the same call the matching agent tool makes, so a
 * campaign a human builds on the screen and one the agent builds from Telegram
 * are the same object with the same consent checks. Sending is deliberately the
 * only action that contacts anyone, and it re-checks consent per recipient
 * inside `sendCampaign` immediately before dispatch.
 */

type ActionHandler = (
  payload: Record<string, unknown>,
  userId: string
) => Promise<{ ok: boolean; error?: string; data?: unknown }>

const handlers: Record<string, ActionHandler> = {
  async previewAudience(payload) {
    const checked = validateDefinition(payload.definition)
    if (!checked.ok) {
      return { ok: false, error: checked.error }
    }

    const limit = Number(payload.limit) || 25
    const members = await evaluateSegment(payload.definition as SegmentDefinition, { limit })

    return {
      ok: true,
      data: {
        count: members.length,
        members: members.map((member) => ({
          customerId: member.customerId,
          customer: member.customer,
          contact: member.contactPerson,
          hasEmail: Boolean(member.email),
          daysSinceLastOrder: member.daysSinceLastOrder,
          orderCount: member.orderCount,
          totalSpend: member.totalSpend,
          matchedOn: member.matchedOn,
        })),
      },
    }
  },

  async saveSegment(payload, userId) {
    const name = String(payload.name || "").trim()
    if (!name) {
      return { ok: false, error: "name is required" }
    }

    const checked = validateDefinition(payload.definition)
    if (!checked.ok) {
      return { ok: false, error: checked.error }
    }

    const definitionJson = JSON.stringify(payload.definition)
    const description = payload.description ? String(payload.description) : null

    const segment = await db.segment.upsert({
      where: { name },
      create: { name, description, definitionJson, createdById: userId },
      update: { description, definitionJson },
      select: { id: true, name: true },
    })

    return { ok: true, data: segment }
  },

  async deleteSegment(payload) {
    const segmentId = String(payload.segmentId || "")
    if (!segmentId) {
      return { ok: false, error: "segmentId is required" }
    }

    await db.segment.delete({ where: { id: segmentId } })
    return { ok: true, data: { id: segmentId } }
  },

  async buildCampaign(payload, userId) {
    const name = String(payload.name || "").trim()
    if (!name) {
      return { ok: false, error: "name is required" }
    }

    const checked = validateDefinition(payload.definition)
    if (!checked.ok) {
      return { ok: false, error: checked.error }
    }

    const result = await buildCampaign({
      name,
      type: String(payload.type || "promotion"),
      channel: String(payload.channel || "email"),
      brief: String(payload.brief || ""),
      definition: payload.definition as SegmentDefinition,
      createdById: userId,
      createdByAgent: false,
      limit: payload.limit ? Number(payload.limit) : undefined,
    })

    return { ok: true, data: result }
  },

  async writeCopy(payload) {
    const memberId = String(payload.memberId || "")
    if (!memberId) {
      return { ok: false, error: "memberId is required" }
    }

    const member = await writeCampaignMessage({
      memberId,
      subject: payload.subject ? String(payload.subject) : undefined,
      message: String(payload.message || ""),
    })

    return { ok: true, data: { memberId: member.id, recipient: member.recipient } }
  },

  /** Dry run: reports exactly what a send would do without contacting anyone. */
  async previewSend(payload) {
    const campaignId = String(payload.campaignId || "")
    if (!campaignId) {
      return { ok: false, error: "campaignId is required" }
    }

    return { ok: true, data: await sendCampaign(campaignId, { dryRun: true }) }
  },

  async sendCampaign(payload) {
    const campaignId = String(payload.campaignId || "")
    if (!campaignId) {
      return { ok: false, error: "campaignId is required" }
    }

    return { ok: true, data: await sendCampaign(campaignId, { dryRun: false }) }
  },

  async attribute(payload) {
    const campaignId = String(payload.campaignId || "")
    if (!campaignId) {
      return { ok: false, error: "campaignId is required" }
    }

    const windowDays = payload.windowDays ? Number(payload.windowDays) : 30
    return { ok: true, data: await attributeCampaign(campaignId, windowDays) }
  },

  async recordConsent(payload) {
    const address = String(payload.address || "").trim()
    const channel = String(payload.channel || "email")
    const state = String(payload.state || "withdrawn")

    if (!address) {
      return { ok: false, error: "address is required" }
    }

    const record = await db.consentRecord.upsert({
      where: { address_channel: { address, channel } },
      create: {
        address,
        channel,
        state,
        customerId: payload.customerId ? String(payload.customerId) : null,
        source: payload.source ? String(payload.source) : "manual",
        note: payload.note ? String(payload.note) : null,
        changedAt: new Date(),
      },
      update: {
        state,
        note: payload.note ? String(payload.note) : null,
        changedAt: new Date(),
      },
      select: { address: true, channel: true, state: true },
    })

    return { ok: true, data: record }
  },
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")
  const handler = handlers[action]

  if (!handler) {
    return NextResponse.json({ success: false, error: `Unknown action "${action}"` }, { status: 400 })
  }

  try {
    const result = await handler(body, auth.user!.id)

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    console.error(`Marketing action ${action} failed:`, error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 }
    )
  }
}
