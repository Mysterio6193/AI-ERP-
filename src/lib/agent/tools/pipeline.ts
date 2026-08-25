import { z } from "zod"

import { summarisePipeline } from "@/lib/crm"
import { importLeads, inferColumnMapping, parseCsv } from "@/lib/leads-import"
import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/** Leads, opportunities and the pipeline built on top of them. */

function refuse(reason: string) {
  return { ok: false as const, error: reason }
}

const STAGES = ["prospect", "qualified", "proposal", "negotiation", "won", "lost"] as const

export function buildPipelineTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    /**
     * A whole list at once, which is how prospects actually arrive — a trade
     * show exports one CSV, not fifty conversations. Calling createLead per row
     * would burn fifty tool calls and half the context.
     */
    importLeadsFromCsv: defineTool({
      description:
        "Import many leads at once from CSV text, such as a file someone attached. Runs a dry run by default and reports what it found, including duplicates, so the numbers can be read before anything is written. Call it again with confirm: true to actually save them.",
      inputSchema: z.object({
        csv: z.string().describe("The raw CSV text, including its header row"),
        source: z.string().optional().describe("Where the list came from, e.g. trade_show"),
        confirm: z
          .boolean()
          .optional()
          .describe("false or omitted reports what would happen; true writes the leads"),
      }),
      execute: async ({ csv, source, confirm }) => {
        const rows = parseCsv(csv)

        if (!rows.length) {
          return refuse("No data rows in that CSV. It needs a header row and at least one record below it.")
        }

        const headers = Object.keys(rows[0])
        const mapping = inferColumnMapping(headers)

        if (!mapping.businessName) {
          return refuse(
            `I can't tell which column holds the business name. The columns are: ${headers.join(", ")}.`
          )
        }

        const summary = await importLeads({
          rows,
          mapping,
          defaultSource: source,
          ownerId: principal.userId ?? null,
          dryRun: !confirm,
        })

        return {
          ok: true as const,
          // Said explicitly, because "imported 40" reads the same either way and
          // the difference between a dry run and a write is the whole point.
          committed: Boolean(confirm),
          columnsUsed: Object.fromEntries(Object.entries(mapping).filter(([, column]) => column)),
          totalRows: summary.totalRows,
          wouldImport: summary.imported,
          duplicatesInFile: summary.duplicatesInFile,
          alreadyOnFile: summary.duplicatesExisting,
          skipped: summary.skipped.slice(0, 10),
        }
      },
    }),

    createLead: defineTool({
      description:
        "Capture a new prospect - a venue that called, a referral, someone met at a trade show. Cheap to create; qualify later.",
      inputSchema: z.object({
        businessName: z.string(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        suburb: z.string().optional(),
        industry: z.string().optional(),
        source: z
          .enum(["inbound", "referral", "trade_show", "cold_call", "website", "campaign"])
          .optional(),
        estimatedValue: z.number().positive().optional().describe("Likely monthly spend"),
        notes: z.string().optional(),
      }),
      execute: async (fields) => {
        const lead = await db.lead.create({
          data: { ...fields, ownerId: principal.userId },
          select: { id: true, businessName: true, status: true },
        })

        return { ok: true as const, lead }
      },
    }),

    listLeads: defineTool({
      description: "Leads in the funnel, newest first.",
      inputSchema: z.object({
        status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
        mineOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ status, mineOnly, limit }) => {
        const leads = await db.lead.findMany({
          where: {
            ...(status ? { status } : {}),
            ...(mineOnly ? { ownerId: principal.userId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit ?? 20,
          select: {
            id: true,
            businessName: true,
            contactName: true,
            email: true,
            phone: true,
            suburb: true,
            source: true,
            status: true,
            estimatedValue: true,
            createdAt: true,
            owner: { select: { name: true } },
          },
        })

        return leads.map((lead) => ({ ...lead, owner: lead.owner?.name ?? null }))
      },
    }),

    updateLead: defineTool({
      description: "Move a lead along, or mark it lost with the reason.",
      inputSchema: z.object({
        leadId: z.string(),
        status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
        notes: z.string().optional(),
        estimatedValue: z.number().positive().optional(),
        lostReason: z.string().optional(),
      }),
      execute: async ({ leadId, ...fields }) => {
        const lead = await db.lead.update({
          where: { id: leadId },
          data: fields,
          select: { id: true, businessName: true, status: true },
        })

        return { ok: true as const, lead }
      },
    }),

    convertLead: defineTool({
      description:
        "Turn a qualified lead into a real customer account. Creates the customer, carries the contact across, and marks the lead converted.",
      inputSchema: z.object({
        leadId: z.string(),
        creditLimit: z.number().min(0).optional(),
        paymentTerms: z.number().int().min(0).optional().describe("Net days, defaults to 30"),
        customerType: z.enum(["business", "retail", "wholesale"]).optional(),
      }),
      execute: async ({ leadId, creditLimit, paymentTerms, customerType }) => {
        const lead = await db.lead.findUnique({ where: { id: leadId } })

        if (!lead) {
          return { ok: false as const, error: "Lead not found" }
        }

        if (lead.status === "converted") {
          return { ok: false as const, error: "That lead has already been converted" }
        }

        const company = await db.company.findFirst({ select: { id: true } })

        const customer = await db.customer.create({
          data: {
            name: lead.businessName,
            contactPerson: lead.contactName,
            email: lead.email,
            phone: lead.phone,
            industry: lead.industry,
            customerType: customerType || "wholesale",
            paymentTerms: paymentTerms ?? 30,
            creditLimit: creditLimit ?? 0,
            salesRepId: lead.ownerId,
            companyId: company?.id,
          },
          select: { id: true, name: true },
        })

        if (lead.contactName) {
          await db.contact.create({
            data: {
              customerId: customer.id,
              name: lead.contactName,
              email: lead.email,
              phone: lead.phone,
              isPrimary: true,
              isDecisionMaker: true,
            },
          })
        }

        await db.$transaction([
          db.lead.update({
            where: { id: leadId },
            data: {
              status: "converted",
              convertedCustomerId: customer.id,
              convertedAt: new Date(),
            },
          }),
          db.activity.create({
            data: {
              type: "note",
              subject: `Lead converted to customer ${customer.name}`,
              customerId: customer.id,
              leadId,
              userId: principal.userId,
              createdByAgent: true,
            },
          }),
        ])

        return { ok: true as const, customerId: customer.id, customer: customer.name }
      },
    }),

    createOpportunity: defineTool({
      description:
        "Track a deal in progress - a tender, a big first order, a competitor takeover. Use when there is real money with a decision date.",
      inputSchema: z.object({
        name: z.string(),
        customerId: z.string().optional(),
        leadId: z.string().optional(),
        value: z.number().min(0),
        stage: z.enum(STAGES).optional(),
        probability: z.number().int().min(0).max(100).optional(),
        expectedCloseDate: z.string().optional().describe("ISO date"),
        notes: z.string().optional(),
      }),
      execute: async ({ expectedCloseDate, ...fields }) => {
        if (!fields.customerId && !fields.leadId) {
          return { ok: false as const, error: "An opportunity needs a customer or a lead" }
        }

        const opportunity = await db.opportunity.create({
          data: {
            ...fields,
            ownerId: principal.userId,
            expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
          },
          select: { id: true, name: true, stage: true, value: true },
        })

        return { ok: true as const, opportunity }
      },
    }),

    updateOpportunity: defineTool({
      description:
        "Move a deal to a new stage, revise the value, or close it out. Always record a loss reason when marking one lost.",
      inputSchema: z.object({
        opportunityId: z.string(),
        stage: z.enum(STAGES).optional(),
        value: z.number().min(0).optional(),
        probability: z.number().int().min(0).max(100).optional(),
        expectedCloseDate: z.string().optional(),
        lossReason: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ opportunityId, stage, expectedCloseDate, ...fields }) => {
        const closing = stage === "won" || stage === "lost"

        const opportunity = await db.opportunity.update({
          where: { id: opportunityId },
          data: {
            ...fields,
            ...(stage ? { stage } : {}),
            ...(expectedCloseDate ? { expectedCloseDate: new Date(expectedCloseDate) } : {}),
            ...(closing ? { closedAt: new Date(), probability: stage === "won" ? 100 : 0 } : {}),
          },
          select: { id: true, name: true, stage: true, value: true, customerId: true },
        })

        if (closing) {
          await db.activity.create({
            data: {
              type: "note",
              subject: `Opportunity ${stage}: ${opportunity.name}`,
              body: fields.lossReason,
              customerId: opportunity.customerId,
              opportunityId,
              userId: principal.userId,
              createdByAgent: true,
            },
          })
        }

        return { ok: true as const, opportunity }
      },
    }),

    pipelineSummary: defineTool({
      description:
        "The pipeline by stage - count, total value, and probability-weighted value. Use for 'what's the pipeline look like' and forecasting.",
      inputSchema: z.object({
        mineOnly: z.boolean().optional(),
        includeClosed: z.boolean().optional(),
      }),
      execute: async ({ mineOnly, includeClosed }) =>
        summarisePipeline({
          includeClosed,
          ...(mineOnly ? { ownerId: principal.userId } : {}),
        }),
    }),

    assignSalesRep: defineTool({
      description:
        "Set who owns an account. Ownership drives 'my accounts', rep performance and who gets chased about a quiet customer.",
      inputSchema: z.object({ customerId: z.string(), userId: z.string() }),
      execute: async ({ customerId, userId }) => {
        const rep = await db.user.findUnique({ where: { id: userId }, select: { name: true } })

        if (!rep) {
          return { ok: false as const, error: "No such user" }
        }

        const customer = await db.customer.update({
          where: { id: customerId },
          data: { salesRepId: userId },
          select: { name: true },
        })

        return { ok: true as const, customer: customer.name, salesRep: rep.name }
      },
    }),
  }
}
