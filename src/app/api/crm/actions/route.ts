import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { nextDocumentNumber } from "@/lib/numbering"

/**
 * CRM write actions.
 *
 * The screens were read-only, which made the CRM a report rather than a tool.
 * Everything here mirrors an agent tool exactly, so a case resolved by a human
 * in the UI and one resolved by the agent from Telegram produce the same rows.
 */

type ActionHandler = (
  payload: Record<string, unknown>,
  userId: string
) => Promise<{ ok: boolean; error?: string; data?: unknown }>

const handlers: Record<string, ActionHandler> = {
  async resolveCase(payload, userId) {
    const caseId = String(payload.caseId || "")
    if (!caseId) {
      return { ok: false, error: "caseId is required" }
    }

    const record = await db.case.update({
      where: { id: caseId },
      data: {
        status: String(payload.status || "resolved"),
        resolution: payload.resolution ? String(payload.resolution) : null,
        resolvedAt: new Date(),
      },
      select: { id: true, caseNumber: true, status: true, customerId: true },
    })

    await db.activity.create({
      data: {
        type: "note",
        subject: `Case ${record.caseNumber} ${record.status}`,
        body: payload.resolution ? String(payload.resolution) : null,
        customerId: record.customerId,
        userId,
      },
    })

    return { ok: true, data: record }
  },

  async completeTask(payload, userId) {
    const taskId = String(payload.taskId || "")
    if (!taskId) {
      return { ok: false, error: "taskId is required" }
    }

    const task = await db.crmTask.update({
      where: { id: taskId },
      data: { status: "done", completedAt: new Date() },
      select: { id: true, title: true, customerId: true },
    })

    await db.activity.create({
      data: {
        type: "note",
        subject: `Completed: ${task.title}`,
        customerId: task.customerId,
        userId,
      },
    })

    return { ok: true, data: task }
  },

  async createTask(payload, userId) {
    const title = String(payload.title || "").trim()
    if (!title) {
      return { ok: false, error: "title is required" }
    }

    const task = await db.crmTask.create({
      data: {
        title,
        notes: payload.notes ? String(payload.notes) : null,
        type: String(payload.type || "follow_up"),
        customerId: payload.customerId ? String(payload.customerId) : null,
        priority: String(payload.priority || "normal"),
        dueAt: payload.dueAt ? new Date(String(payload.dueAt)) : null,
        assignedToId: userId,
        createdById: userId,
      },
      select: { id: true, title: true },
    })

    return { ok: true, data: task }
  },

  async moveOpportunity(payload, userId) {
    const opportunityId = String(payload.opportunityId || "")
    const stage = String(payload.stage || "")

    if (!opportunityId || !stage) {
      return { ok: false, error: "opportunityId and stage are required" }
    }

    const closing = stage === "won" || stage === "lost"

    const opportunity = await db.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage,
        ...(closing
          ? {
              closedAt: new Date(),
              probability: stage === "won" ? 100 : 0,
              lossReason: payload.lossReason ? String(payload.lossReason) : null,
            }
          : {}),
      },
      select: { id: true, name: true, stage: true, customerId: true },
    })

    await db.activity.create({
      data: {
        type: "note",
        subject: `Opportunity moved to ${stage}: ${opportunity.name}`,
        customerId: opportunity.customerId,
        opportunityId,
        userId,
      },
    })

    return { ok: true, data: opportunity }
  },

  async logActivity(payload, userId) {
    const subject = String(payload.subject || "").trim()
    if (!subject) {
      return { ok: false, error: "subject is required" }
    }

    const activity = await db.activity.create({
      data: {
        type: String(payload.type || "note"),
        subject,
        body: payload.body ? String(payload.body) : null,
        customerId: payload.customerId ? String(payload.customerId) : null,
        contactId: payload.contactId ? String(payload.contactId) : null,
        userId,
        occurredAt: new Date(),
      },
      select: { id: true, subject: true, type: true },
    })

    return { ok: true, data: activity }
  },

  async upsertContact(payload) {
    const name = String(payload.name || "").trim()
    if (!name) {
      return { ok: false, error: "name is required" }
    }

    const fields = {
      name,
      role: String(payload.role || "buyer"),
      jobTitle: payload.jobTitle ? String(payload.jobTitle) : null,
      email: payload.email ? String(payload.email) : null,
      phone: payload.phone ? String(payload.phone) : null,
      mobile: payload.mobile ? String(payload.mobile) : null,
      isPrimary: Boolean(payload.isPrimary),
      isDecisionMaker: Boolean(payload.isDecisionMaker),
      preferredChannel: payload.preferredChannel ? String(payload.preferredChannel) : null,
      notes: payload.notes ? String(payload.notes) : null,
    }

    if (payload.contactId) {
      const contact = await db.contact.update({
        where: { id: String(payload.contactId) },
        data: fields,
        select: { id: true, name: true },
      })
      return { ok: true, data: contact }
    }

    const customerId = String(payload.customerId || "")
    if (!customerId) {
      return { ok: false, error: "customerId is required to add a contact" }
    }

    // Only one primary contact per account.
    if (fields.isPrimary) {
      await db.contact.updateMany({
        where: { customerId, isPrimary: true },
        data: { isPrimary: false },
      })
    }

    const contact = await db.contact.create({
      data: { customerId, ...fields },
      select: { id: true, name: true },
    })

    return { ok: true, data: contact }
  },

  async createCase(payload, userId) {
    const customerId = String(payload.customerId || "")
    const subject = String(payload.subject || "").trim()

    if (!customerId || !subject) {
      return { ok: false, error: "customerId and subject are required" }
    }

    const year = new Date().getFullYear()
    const last = await db.case.findFirst({
      where: { caseNumber: { startsWith: `CS-${year}-` } },
      orderBy: { createdAt: "desc" },
      select: { caseNumber: true },
    })

    let next = 1001
    if (last) {
      const parts = last.caseNumber.split("-")
      if (parts.length >= 3) {
        next = parseInt(parts[2]) + 1
      }
    }

    const record = await db.case.create({
      data: {
        caseNumber: await nextDocumentNumber("case", {
          db,
          legacy: async () => `CS-${year}-${next.toString().padStart(5, "0")}`,
        }),
        customerId,
        contactId: payload.contactId ? String(payload.contactId) : null,
        subject,
        description: payload.description ? String(payload.description) : null,
        category: String(payload.category || "other"),
        severity: String(payload.severity || "normal"),
        assignedToId: userId,
      },
      select: { id: true, caseNumber: true, subject: true },
    })

    return { ok: true, data: record }
  },

  async createOpportunity(payload, userId) {
    const name = String(payload.name || "").trim()
    if (!name) {
      return { ok: false, error: "name is required" }
    }

    if (!payload.customerId && !payload.leadId) {
      return { ok: false, error: "An opportunity needs a customer or a lead" }
    }

    const opportunity = await db.opportunity.create({
      data: {
        name,
        customerId: payload.customerId ? String(payload.customerId) : null,
        leadId: payload.leadId ? String(payload.leadId) : null,
        value: Number(payload.value || 0),
        stage: String(payload.stage || "prospect"),
        probability: Number(payload.probability ?? 50),
        expectedCloseDate: payload.expectedCloseDate
          ? new Date(String(payload.expectedCloseDate))
          : null,
        notes: payload.notes ? String(payload.notes) : null,
        ownerId: userId,
      },
      select: { id: true, name: true, stage: true, value: true },
    })

    return { ok: true, data: opportunity }
  },

  async createLead(payload, userId) {
    const businessName = String(payload.businessName || "").trim()
    if (!businessName) {
      return { ok: false, error: "businessName is required" }
    }

    const lead = await db.lead.create({
      data: {
        businessName,
        contactName: payload.contactName ? String(payload.contactName) : null,
        email: payload.email ? String(payload.email) : null,
        phone: payload.phone ? String(payload.phone) : null,
        suburb: payload.suburb ? String(payload.suburb) : null,
        industry: payload.industry ? String(payload.industry) : null,
        source: String(payload.source || "inbound"),
        estimatedValue: payload.estimatedValue ? Number(payload.estimatedValue) : null,
        notes: payload.notes ? String(payload.notes) : null,
        ownerId: userId,
      },
      select: { id: true, businessName: true, status: true },
    })

    return { ok: true, data: lead }
  },

  async updateLeadStatus(payload) {
    const leadId = String(payload.leadId || "")
    const status = String(payload.status || "")

    if (!leadId || !status) {
      return { ok: false, error: "leadId and status are required" }
    }

    const lead = await db.lead.update({
      where: { id: leadId },
      data: {
        status,
        lostReason: payload.lostReason ? String(payload.lostReason) : undefined,
      },
      select: { id: true, businessName: true, status: true },
    })

    return { ok: true, data: lead }
  },

  async convertLead(payload, userId) {
    const leadId = String(payload.leadId || "")
    if (!leadId) {
      return { ok: false, error: "leadId is required" }
    }

    const lead = await db.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return { ok: false, error: "Lead not found" }
    }

    if (lead.status === "converted") {
      return { ok: false, error: "That lead has already been converted" }
    }

    const company = await db.company.findFirst({ select: { id: true } })

    const customer = await db.customer.create({
      data: {
        name: lead.businessName,
        contactPerson: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        industry: lead.industry,
        customerType: "wholesale",
        paymentTerms: Number(payload.paymentTerms ?? 30),
        creditLimit: Number(payload.creditLimit ?? 0),
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
        data: { status: "converted", convertedCustomerId: customer.id, convertedAt: new Date() },
      }),
      db.activity.create({
        data: {
          type: "note",
          subject: `Lead converted to customer ${customer.name}`,
          customerId: customer.id,
          leadId,
          userId,
        },
      }),
    ])

    return { ok: true, data: { customerId: customer.id, customer: customer.name } }
  },

  async assignRep(payload) {
    const customerId = String(payload.customerId || "")
    const userId = String(payload.userId || "")

    if (!customerId || !userId) {
      return { ok: false, error: "customerId and userId are required" }
    }

    const customer = await db.customer.update({
      where: { id: customerId },
      data: { salesRepId: userId },
      select: { id: true, name: true, salesRepId: true },
    })

    return { ok: true, data: customer }
  },

  async snoozeLapsed(payload, userId) {
    const customerId = String(payload.customerId || "")
    if (!customerId) {
      return { ok: false, error: "customerId is required" }
    }

    // Snoozing is really "someone owns chasing this", so it becomes a task.
    const days = Number(payload.days || 7)
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    })

    const task = await db.crmTask.create({
      data: {
        title: `Check in with ${customer?.name ?? "customer"}`,
        type: "follow_up",
        customerId,
        priority: "normal",
        dueAt: new Date(Date.now() + days * 86400000),
        assignedToId: userId,
        createdById: userId,
      },
      select: { id: true, title: true, dueAt: true },
    })

    return { ok: true, data: task }
  },
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")
  const handler = handlers[action]

  if (!handler) {
    return NextResponse.json(
      { success: false, error: `Unknown action "${action}"` },
      { status: 400 }
    )
  }

  try {
    const result = await handler(body, auth.user!.id)

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    console.error(`CRM action ${action} failed:`, error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 }
    )
  }
}
