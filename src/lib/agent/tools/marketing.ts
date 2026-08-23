import { z } from "zod"

import { db } from "@/lib/db"
import {
  attributeCampaign,
  buildCampaign,
  campaignPerformance,
  getCampaignMemberContext,
  sendCampaign,
  writeCampaignMessage,
} from "@/lib/marketing"
import { evaluateSegment, validateDefinition, type SegmentDefinition } from "@/lib/segments"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money, safeDb } from "./shared"

/**
 * Marketing.
 *
 * The agent turns a plain-English brief into a *stored audience definition*,
 * not a list of names: the definition is evaluated by code at build time, so
 * who received a message is reproducible and explainable months later. The
 * agent then writes each recipient's copy from that account's own facts, and a
 * human reads it before anything sends.
 */

const conditionSchema = z.union([
  z.object({
    kind: z.literal("field"),
    field: z.enum([
      "customerType",
      "industry",
      "creditStatus",
      "status",
      "salesRepId",
      "paymentTerms",
    ]),
    op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in"]),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
  }),
  z.object({
    kind: z.literal("metric"),
    metric: z.enum([
      "daysSinceLastOrder",
      "orderCount",
      "totalSpend",
      "averageOrderValue",
      "outstandingAmount",
      "daysAsCustomer",
    ]),
    op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
    value: z.number(),
  }),
  z.object({
    kind: z.literal("product"),
    mode: z.enum(["bought", "never_bought"]),
    productId: z.string().optional(),
    sku: z.string().optional(),
    nameContains: z.string().optional(),
    withinDays: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("location"),
    field: z.enum(["state", "city", "postcode"]),
    op: z.enum(["eq", "neq", "in", "not_in"]),
    value: z.union([z.string(), z.array(z.string())]),
  }),
  z.object({
    kind: z.literal("flag"),
    flag: z.enum(["isLapsing", "hasOverdueInvoice", "isOnCreditHold"]),
    value: z.boolean(),
  }),
])

const definitionSchema = z.object({
  all: z.array(conditionSchema).optional(),
  any: z.array(conditionSchema).optional(),
  none: z.array(conditionSchema).optional(),
})

export function buildMarketingTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    previewAudience: defineTool({
      description:
        "Turn an audience description into a saved definition and see exactly who it selects, without creating anything. ALWAYS run this and read the count back before building a campaign - it is how you and the user agree on who will be contacted.",
      inputSchema: z.object({
        definition: definitionSchema.describe(
          "Conditions on the customer base. 'all' must every hold, 'any' needs one, 'none' excludes."
        ),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ definition, limit }) => {
        const checked = validateDefinition(definition)
        if (!checked.ok) {
          return { ok: false as const, error: checked.error }
        }

        const members = await evaluateSegment(definition as SegmentDefinition, { limit: limit ?? 25 })

        return {
          ok: true as const,
          count: members.length,
          members: members.map((member) => ({
            customer: member.customer,
            contact: member.contactPerson,
            hasEmail: Boolean(member.email),
            daysSinceLastOrder: member.daysSinceLastOrder,
            orderCount: member.orderCount,
            totalSpend: member.totalSpend,
            matchedOn: member.matchedOn,
          })),
        }
      },
    }),

    saveSegment: defineTool({
      description: "Save an audience definition under a name so it can be reused and re-evaluated later.",
      inputSchema: z.object({
        name: z.string(),
        description: z.string().optional(),
        definition: definitionSchema,
      }),
      execute: async ({ name, description, definition }) => {
        const checked = validateDefinition(definition)
        if (!checked.ok) {
          return { ok: false as const, error: checked.error }
        }

        const segment = await db.segment.upsert({
          where: { name },
          create: {
            name,
            description,
            definitionJson: JSON.stringify(definition),
            createdById: principal.userId,
          },
          update: { description, definitionJson: JSON.stringify(definition) },
          select: { id: true, name: true },
        })

        return { ok: true as const, segment }
      },
    }),

    buildCampaign: defineTool({
      description:
        "Create a campaign against an audience. Resolves the recipients now and snapshots the definition, checks consent, and returns how many are sendable. Nothing is sent by this - copy still has to be written and a human still has to approve.",
      inputSchema: z.object({
        name: z.string(),
        type: z
          .enum([
            "win_back",
            "catalogue_drop",
            "promotion",
            "price_change",
            "cross_sell",
            "reorder_nudge",
            "event",
          ])
          .optional(),
        channel: z.enum(["email", "whatsapp", "sms"]).optional(),
        brief: z.string().describe("What this campaign is trying to achieve, in plain English"),
        definition: definitionSchema,
        limit: z.number().int().min(1).max(500).optional(),
      }),
      execute: async ({ name, type, channel, brief, definition, limit }) => {
        const checked = validateDefinition(definition)
        if (!checked.ok) {
          return { ok: false as const, error: checked.error }
        }

        return buildCampaign({
          name,
          type: type || "promotion",
          channel: channel || "email",
          brief,
          definition: definition as SegmentDefinition,
          createdById: principal.userId,
          createdByAgent: true,
          limit,
        })
      },
    }),

    getCampaignRecipients: defineTool({
      description:
        "The recipients of a campaign with the facts about each account - what they usually buy, how long since they ordered, what they owe. Use this to write copy that is true for that specific customer, and do not claim anything these facts do not support.",
      inputSchema: z.object({
        campaignId: z.string(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ campaignId, limit }) => safeDb(async () => getCampaignMemberContext(campaignId, limit ?? 25)),
    }),

    writeCampaignMessage: defineTool({
      description:
        "Write the message for one recipient. Call once per recipient, grounded in that account's facts. Keep it short, specific and human - a trade buyer reads it on a phone between deliveries.",
      inputSchema: z.object({
        memberId: z.string(),
        subject: z.string().optional(),
        message: z.string(),
      }),
      execute: async ({ memberId, subject, message }) => {
        const member = await writeCampaignMessage({ memberId, subject, message })
        return { ok: true as const, memberId: member.id, recipient: member.recipient }
      },
    }),

    reviewCampaign: defineTool({
      description:
        "The campaign as it stands: who it will go to, what each of them will receive, and who was suppressed and why. Show this to a human before sending.",
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async ({ campaignId }) => {
        const campaign = await db.campaign.findUnique({
          where: { id: campaignId },
          select: {
            id: true,
            name: true,
            type: true,
            channel: true,
            status: true,
            brief: true,
            members: {
              select: {
                id: true,
                recipient: true,
                subject: true,
                message: true,
                status: true,
                suppressionReason: true,
                customerId: true,
              },
            },
          },
        })

        if (!campaign) {
          return { found: false as const }
        }

        const names = await db.customer.findMany({
          where: { id: { in: campaign.members.map((member) => member.customerId) } },
          select: { id: true, name: true },
        })
        const nameById = new Map(names.map((entry) => [entry.id, entry.name]))

        const pending = campaign.members.filter((member) => member.status === "pending")

        return {
          found: true as const,
          campaign: {
            id: campaign.id,
            name: campaign.name,
            type: campaign.type,
            channel: campaign.channel,
            status: campaign.status,
            brief: campaign.brief,
          },
          readyToSend: pending.filter((member) => member.message).length,
          awaitingCopy: pending.filter((member) => !member.message).length,
          suppressed: campaign.members
            .filter((member) => member.status === "suppressed")
            .map((member) => ({
              customer: nameById.get(member.customerId),
              reason: member.suppressionReason,
            })),
          messages: pending.slice(0, 20).map((member) => ({
            memberId: member.id,
            customer: nameById.get(member.customerId),
            to: member.recipient,
            subject: member.subject,
            message: member.message,
          })),
        }
      },
    }),

    previewCampaignSend: defineTool({
      description:
        "Report exactly what a send would do right now - who would receive it, who would be suppressed and why - without contacting anyone. Safe to run at any time, and the right thing to show a human before asking them to approve the send.",
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async ({ campaignId }) => safeDb(async () => sendCampaign(campaignId, { dryRun: true })),
    }),

    sendCampaign: defineTool({
      description:
        "Send a campaign. Re-checks consent for every recipient immediately before dispatch. This contacts real customers, so it always needs human approval.",
      inputSchema: z.object({
        campaignId: z.string(),
        dryRun: z
          .boolean()
          .optional()
          .describe("Go through every step and report the outcome without actually sending"),
      }),
      execute: async ({ campaignId, dryRun }) => safeDb(async () => sendCampaign(campaignId, { dryRun })),
    }),

    campaignPerformance: defineTool({
      description:
        "How campaigns performed: audience, sent, suppressed, conversions and attributed revenue.",
      inputSchema: z.object({ campaignId: z.string().optional() }),
      execute: async ({ campaignId }) => safeDb(async () => campaignPerformance(campaignId)),
    }),

    attributeCampaign: defineTool({
      description:
        "Match orders placed after a send back to the campaign that prompted them. Conservative: first order per recipient inside the window only.",
      inputSchema: z.object({
        campaignId: z.string(),
        windowDays: z.number().int().min(1).max(120).optional(),
      }),
      execute: async ({ campaignId, windowDays }) => safeDb(async () => attributeCampaign(campaignId, windowDays)),
    }),

    recordConsent: defineTool({
      description:
        "Record or withdraw marketing consent for an address. Use immediately when someone asks to stop receiving messages.",
      inputSchema: z.object({
        address: z.string(),
        channel: z.enum(["email", "whatsapp", "sms"]),
        state: z.enum(["granted", "withdrawn", "bounced", "complained"]),
        customerId: z.string().optional(),
        source: z.string().optional(),
        note: z.string().optional(),
      }),
      execute: async ({ address, channel, state, customerId, source, note }) => {
        const record = await db.consentRecord.upsert({
          where: { address_channel: { address, channel } },
          create: { address, channel, state, customerId, source, note, changedAt: new Date() },
          update: { state, note, changedAt: new Date() },
          select: { address: true, channel: true, state: true },
        })

        return { ok: true as const, consent: record }
      },
    }),
  }
}
