import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { campaignPerformance } from "@/lib/marketing"

/**
 * Read model for the marketing screens.
 *
 * Backed by the same `lib/marketing` and `lib/segments` functions the agent
 * tools call, so a campaign the agent built in chat and the same campaign on
 * this screen can never disagree about who is in it or what it earned.
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales"])
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const view = searchParams.get("view") || "campaigns"

  try {
    switch (view) {
      case "campaigns": {
        return NextResponse.json({ success: true, data: await campaignPerformance() })
      }

      case "campaign": {
        const campaignId = searchParams.get("id")
        if (!campaignId) {
          return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
        }

        const campaign = await db.campaign.findUnique({
          where: { id: campaignId },
          select: {
            id: true,
            name: true,
            type: true,
            channel: true,
            status: true,
            brief: true,
            sentAt: true,
            scheduledFor: true,
            createdByAgent: true,
            members: {
              select: {
                id: true,
                customerId: true,
                recipient: true,
                subject: true,
                message: true,
                status: true,
                suppressionReason: true,
                convertedValue: true,
                sentAt: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        })

        if (!campaign) {
          return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 })
        }

        // Resolve customer names in one query rather than per-member includes.
        const customers = await db.customer.findMany({
          where: { id: { in: campaign.members.map((member) => member.customerId) } },
          select: { id: true, name: true },
        })
        const nameById = new Map(customers.map((entry) => [entry.id, entry.name]))

        return NextResponse.json({
          success: true,
          data: {
            ...campaign,
            members: campaign.members.map((member) => ({
              ...member,
              customer: nameById.get(member.customerId) ?? null,
            })),
          },
        })
      }

      case "segments": {
        const segments = await db.segment.findMany({
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            description: true,
            definitionJson: true,
            updatedAt: true,
          },
        })

        return NextResponse.json({ success: true, data: segments })
      }

      case "consent": {
        const records = await db.consentRecord.findMany({
          where: { state: { in: ["withdrawn", "bounced", "complained"] } },
          orderBy: { changedAt: "desc" },
          take: 100,
          select: {
            id: true,
            address: true,
            channel: true,
            state: true,
            source: true,
            note: true,
            changedAt: true,
            customerId: true,
          },
        })

        return NextResponse.json({ success: true, data: records })
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown view: ${view}` }, { status: 400 })
    }
  } catch (error) {
    console.error("Marketing read failed:", error)
    return NextResponse.json({ success: false, error: "Failed to load marketing data" }, { status: 500 })
  }
}
