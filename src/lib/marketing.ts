import { sendCommunicationMessage } from "@/lib/communications"
import { db } from "@/lib/db"
import { evaluateSegment, type SegmentDefinition } from "@/lib/segments"

/**
 * Campaign build, send and attribution.
 *
 * The shape is deliberately three separate steps rather than one "send
 * campaign" call:
 *
 *   1. build   - resolve the audience from a stored definition and snapshot it
 *   2. write   - copy is authored per recipient, from that account's own facts
 *   3. send    - consent and suppression checked in code, immediately before dispatch
 *
 * Splitting them means a human can read the actual messages before anything
 * leaves the building, and that the recipient list cannot change between
 * approval and send.
 */

export interface CampaignMemberContext {
  memberId: string
  customerId: string
  customer: string
  contactPerson: string | null
  recipient: string
  /** The facts the copy should be grounded in - never invent beyond these. */
  facts: {
    daysSinceLastOrder: number | null
    orderCount: number
    averageOrderValue: number
    outstandingAmount: number
    isLapsing: boolean
    usualProducts: string[]
    matchedOn: string[]
  }
}

function addressFor(channel: string, customer: { email: string | null; phone: string | null }) {
  if (channel === "email") {
    return customer.email
  }

  return customer.phone || customer.email
}

/**
 * Consent is checked against an explicit record. Absence of a record is treated
 * as consent for email to existing trade customers (an existing business
 * relationship), but never for a withdrawn, bounced or complained address.
 */
export async function checkConsent(address: string, channel: string) {
  const record = await db.consentRecord.findUnique({
    where: { address_channel: { address, channel } },
    select: { state: true },
  })

  if (!record) {
    return { allowed: channel === "email", reason: channel === "email" ? null : "no consent on record" }
  }

  if (record.state === "granted") {
    return { allowed: true, reason: null }
  }

  return { allowed: false, reason: record.state }
}

export async function buildCampaign(input: {
  name: string
  type: string
  channel: string
  brief?: string
  definition: SegmentDefinition
  segmentId?: string
  createdById?: string
  createdByAgent?: boolean
  limit?: number
}) {
  const members = await evaluateSegment(input.definition, { limit: input.limit })

  if (!members.length) {
    return { ok: false as const, error: "That audience matched nobody. Widen the definition." }
  }

  const campaign = await db.campaign.create({
    data: {
      name: input.name,
      type: input.type,
      channel: input.channel,
      brief: input.brief,
      segmentId: input.segmentId,
      // Snapshot: editing the segment later must not rewrite history.
      definitionJson: JSON.stringify(input.definition),
      createdById: input.createdById,
      createdByAgent: input.createdByAgent ?? false,
      status: "draft",
    },
    select: { id: true, name: true },
  })

  let suppressed = 0
  let added = 0

  for (const member of members) {
    const address = addressFor(input.channel, member)

    if (!address) {
      suppressed += 1
      await db.campaignMember.create({
        data: {
          campaignId: campaign.id,
          customerId: member.customerId,
          recipient: "",
          status: "suppressed",
          suppressionReason: `no ${input.channel} address on file`,
        },
      })
      continue
    }

    const consent = await checkConsent(address, input.channel)

    await db.campaignMember.create({
      data: {
        campaignId: campaign.id,
        customerId: member.customerId,
        recipient: address,
        status: consent.allowed ? "pending" : "suppressed",
        suppressionReason: consent.allowed ? null : consent.reason,
      },
    })

    if (consent.allowed) {
      added += 1
    } else {
      suppressed += 1
    }
  }

  return {
    ok: true as const,
    campaignId: campaign.id,
    name: campaign.name,
    audienceSize: members.length,
    sendable: added,
    suppressed,
  }
}

/** Per-recipient facts the copy must be grounded in. */
export async function getCampaignMemberContext(
  campaignId: string,
  limit = 25
): Promise<CampaignMemberContext[]> {
  const members = await db.campaignMember.findMany({
    where: { campaignId, status: "pending" },
    take: limit,
    select: { id: true, customerId: true, recipient: true },
  })

  const context: CampaignMemberContext[] = []

  for (const member of members) {
    const customer = await db.customer.findUnique({
      where: { id: member.customerId },
      select: {
        name: true,
        contactPerson: true,
        orders: {
          where: { status: { not: "cancelled" } },
          orderBy: { orderDate: "desc" },
          take: 20,
          select: {
            orderDate: true,
            totalAmount: true,
            items: { select: { quantity: true, product: { select: { name: true } } } },
          },
        },
        invoices: { where: { status: { not: "paid" } }, select: { outstandingAmt: true } },
      },
    })

    if (!customer) {
      continue
    }

    const counts = new Map<string, number>()
    for (const order of customer.orders) {
      for (const item of order.items) {
        const name = item.product?.name
        if (name) {
          counts.set(name, (counts.get(name) || 0) + item.quantity)
        }
      }
    }

    const lastOrder = customer.orders[0]?.orderDate
    const totalSpend = customer.orders.reduce((sum, order) => sum + order.totalAmount, 0)

    context.push({
      memberId: member.id,
      customerId: member.customerId,
      customer: customer.name,
      contactPerson: customer.contactPerson,
      recipient: member.recipient,
      facts: {
        daysSinceLastOrder: lastOrder
          ? Math.floor((Date.now() - lastOrder.getTime()) / 86400000)
          : null,
        orderCount: customer.orders.length,
        averageOrderValue: customer.orders.length
          ? Number((totalSpend / customer.orders.length).toFixed(2))
          : 0,
        outstandingAmount: Number(
          customer.invoices.reduce((sum, invoice) => sum + invoice.outstandingAmt, 0).toFixed(2)
        ),
        isLapsing: false,
        usualProducts: [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name]) => name),
        matchedOn: [],
      },
    })
  }

  return context
}

export async function writeCampaignMessage(input: {
  memberId: string
  subject?: string
  message: string
}) {
  const member = await db.campaignMember.update({
    where: { id: input.memberId },
    data: { subject: input.subject, message: input.message },
    select: { id: true, recipient: true },
  })

  return member
}

/**
 * Dispatch. Consent is re-checked here rather than trusted from build time,
 * because someone may have unsubscribed while the campaign sat in review.
 */
export async function sendCampaign(campaignId: string, options?: { dryRun?: boolean }) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, channel: true, status: true, subject: true },
  })

  if (!campaign) {
    return { ok: false as const, error: "Campaign not found" }
  }

  if (campaign.status === "sent") {
    return { ok: false as const, error: "That campaign has already been sent" }
  }

  const members = await db.campaignMember.findMany({
    where: { campaignId, status: "pending" },
    select: { id: true, customerId: true, recipient: true, subject: true, message: true },
  })

  const unwritten = members.filter((member) => !member.message)
  if (unwritten.length) {
    return {
      ok: false as const,
      error: `${unwritten.length} recipients have no message written yet. Draft them before sending.`,
    }
  }

  let sent = 0
  let suppressed = 0
  let failed = 0

  for (const member of members) {
    const consent = await checkConsent(member.recipient, campaign.channel)

    if (!consent.allowed) {
      suppressed += 1
      await db.campaignMember.update({
        where: { id: member.id },
        data: { status: "suppressed", suppressionReason: consent.reason },
      })
      continue
    }

    if (options?.dryRun) {
      sent += 1
      continue
    }

    try {
      await sendCommunicationMessage({
        to: member.recipient,
        method: campaign.channel,
        subject: member.subject || campaign.subject || campaign.name,
        message: member.message,
        customerId: member.customerId,
        metadata: { campaignId, campaignName: campaign.name },
      })

      await db.campaignMember.update({
        where: { id: member.id },
        data: { status: "sent", sentAt: new Date() },
      })

      sent += 1
    } catch (error) {
      failed += 1
      await db.campaignMember.update({
        where: { id: member.id },
        data: {
          status: "failed",
          failureReason: error instanceof Error ? error.message : "send failed",
        },
      })
    }
  }

  if (!options?.dryRun) {
    await db.campaign.update({
      where: { id: campaignId },
      data: { status: "sent", sentAt: new Date() },
    })
  }

  return { ok: true as const, sent, suppressed, failed, dryRun: Boolean(options?.dryRun) }
}

/**
 * Attribution: orders placed by a recipient after the send, within the window.
 * Deliberately conservative - first order only, so one campaign cannot claim a
 * customer's entire subsequent trading.
 */
export async function attributeCampaign(campaignId: string, windowDays = 30) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { sentAt: true },
  })

  if (!campaign?.sentAt) {
    return { ok: false as const, error: "Campaign has not been sent" }
  }

  const until = new Date(campaign.sentAt.getTime() + windowDays * 86400000)

  const members = await db.campaignMember.findMany({
    where: { campaignId, status: "sent", convertedOrderId: null },
    select: { id: true, customerId: true, sentAt: true },
  })

  let converted = 0
  let revenue = 0

  for (const member of members) {
    const order = await db.salesOrder.findFirst({
      where: {
        customerId: member.customerId,
        status: { not: "cancelled" },
        createdAt: { gte: member.sentAt ?? campaign.sentAt, lte: until },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, totalAmount: true },
    })

    if (!order) {
      continue
    }

    await db.campaignMember.update({
      where: { id: member.id },
      data: {
        status: "converted",
        convertedOrderId: order.id,
        convertedAt: new Date(),
        convertedValue: order.totalAmount,
      },
    })

    converted += 1
    revenue += order.totalAmount
  }

  return { ok: true as const, converted, revenue: Number(revenue.toFixed(2)), windowDays }
}

export async function campaignPerformance(campaignId?: string) {
  const campaigns = await db.campaign.findMany({
    where: campaignId ? { id: campaignId } : {},
    orderBy: { createdAt: "desc" },
    take: campaignId ? 1 : 20,
    select: {
      id: true,
      name: true,
      type: true,
      channel: true,
      status: true,
      sentAt: true,
      createdByAgent: true,
      members: { select: { status: true, convertedValue: true } },
    },
  })

  return campaigns.map((campaign) => {
    const total = campaign.members.length
    const sent = campaign.members.filter((member) =>
      ["sent", "replied", "converted"].includes(member.status)
    ).length
    const converted = campaign.members.filter((member) => member.status === "converted").length
    const revenue = campaign.members.reduce((sum, member) => sum + (member.convertedValue || 0), 0)

    return {
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      channel: campaign.channel,
      status: campaign.status,
      sentAt: campaign.sentAt,
      createdByAgent: campaign.createdByAgent,
      audience: total,
      sent,
      suppressed: campaign.members.filter((member) => member.status === "suppressed").length,
      converted,
      conversionRate: sent ? Number(((converted / sent) * 100).toFixed(1)) : 0,
      revenue: Number(revenue.toFixed(2)),
    }
  })
}
