import { z } from "zod"

import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Contacts, the account timeline, and service cases.
 *
 * These are the tools that let a rep talk instead of typing: "visited Sarah at
 * the café, unhappy with Tuesday delivery, wants a quote on olive oil" should
 * become an activity, a case and a follow-up without anyone opening a form.
 */

async function generateCaseNumber() {
  const prefix = `CS-${new Date().getFullYear()}-`

  const last = await db.case.findFirst({
    where: { caseNumber: { startsWith: prefix } },
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

  return `${prefix}${next.toString().padStart(5, "0")}`
}

export function buildContactTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listContacts: defineTool({
      description:
        "The people at an account - buyer, venue manager, chef, accounts payable, owner - with how each prefers to be contacted.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        query: z.string().optional().describe("Search by person's name or email across accounts"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ customerId, query, limit }) => {
        const contacts = await db.contact.findMany({
          where: {
            status: "active",
            ...(customerId ? { customerId } : {}),
            ...(query
              ? {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { email: { contains: query, mode: "insensitive" } },
                    { phone: { contains: query, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          take: limit ?? 20,
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            role: true,
            jobTitle: true,
            email: true,
            phone: true,
            mobile: true,
            isPrimary: true,
            isDecisionMaker: true,
            preferredChannel: true,
            notes: true,
            customer: { select: { id: true, name: true } },
          },
        })

        return contacts.map((contact) => ({
          ...contact,
          customer: contact.customer?.name,
          customerId: contact.customer?.id,
        }))
      },
    }),

    upsertContact: defineTool({
      description:
        "Add a person to an account, or update what we know about them. Use when someone mentions a new name, a changed number, or who actually makes the decisions.",
      inputSchema: z.object({
        contactId: z.string().optional().describe("Provide to update an existing person"),
        customerId: z.string().optional().describe("Required when creating"),
        name: z.string(),
        role: z
          .enum(["buyer", "manager", "chef", "accounts_payable", "owner", "other"])
          .optional(),
        jobTitle: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        mobile: z.string().optional(),
        isPrimary: z.boolean().optional(),
        isDecisionMaker: z.boolean().optional(),
        preferredChannel: z.enum(["email", "phone", "whatsapp", "telegram", "sms"]).optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ contactId, customerId, ...fields }) => {
        if (contactId) {
          const contact = await db.contact.update({
            where: { id: contactId },
            data: fields,
            select: { id: true, name: true, role: true },
          })

          return { ok: true as const, created: false, contact }
        }

        if (!customerId) {
          return { ok: false as const, error: "customerId is required to create a contact" }
        }

        // Only one primary per account.
        if (fields.isPrimary) {
          await db.contact.updateMany({
            where: { customerId, isPrimary: true },
            data: { isPrimary: false },
          })
        }

        const contact = await db.contact.create({
          data: { customerId, ...fields },
          select: { id: true, name: true, role: true },
        })

        return { ok: true as const, created: true, contact }
      },
    }),

    logActivity: defineTool({
      description:
        "Record something that happened on an account - a call, a visit, a complaint, a note. This is the main way the CRM stays current: describe what happened and it is filed against the right account and person.",
      inputSchema: z.object({
        type: z.enum([
          "call",
          "visit",
          "note",
          "email",
          "meeting",
          "quote_sent",
          "complaint",
          "message",
        ]),
        subject: z.string().describe("One line summary, e.g. 'Visited - unhappy with Tuesday delivery'"),
        body: z.string().optional().describe("What was actually said or agreed"),
        customerId: z.string().optional(),
        contactId: z.string().optional(),
        opportunityId: z.string().optional(),
        leadId: z.string().optional(),
        durationMinutes: z.number().int().positive().optional(),
        outcome: z.string().optional(),
        occurredAt: z.string().optional().describe("ISO datetime, defaults to now"),
      }),
      execute: async ({ occurredAt, ...fields }) => {
        const activity = await db.activity.create({
          data: {
            ...fields,
            userId: principal.userId,
            createdByAgent: true,
            occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
          },
          select: { id: true, type: true, subject: true, occurredAt: true },
        })

        return { ok: true as const, activity }
      },
    }),

    listActivities: defineTool({
      description: "Recent activity on an account or across the team - what has actually been happening.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        contactId: z.string().optional(),
        type: z.string().optional(),
        mineOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ customerId, contactId, type, mineOnly, limit }) => {
        const activities = await db.activity.findMany({
          where: {
            ...(customerId ? { customerId } : {}),
            ...(contactId ? { contactId } : {}),
            ...(type ? { type } : {}),
            ...(mineOnly ? { userId: principal.userId } : {}),
          },
          orderBy: { occurredAt: "desc" },
          take: limit ?? 20,
          select: {
            id: true,
            type: true,
            subject: true,
            body: true,
            outcome: true,
            occurredAt: true,
            createdByAgent: true,
            customer: { select: { name: true } },
            contact: { select: { name: true } },
            user: { select: { name: true } },
          },
        })

        return activities.map((activity) => ({
          ...activity,
          customer: activity.customer?.name ?? null,
          contact: activity.contact?.name ?? null,
          by: activity.user?.name ?? null,
        }))
      },
    }),

    createCase: defineTool({
      description:
        "Open a service case for a complaint or problem - a short delivery, a quality issue, a billing dispute. Use whenever a customer is unhappy so it does not get lost.",
      inputSchema: z.object({
        customerId: z.string(),
        subject: z.string(),
        description: z.string().optional(),
        category: z
          .enum(["delivery", "quality", "pricing", "billing", "shortage", "other"])
          .optional(),
        severity: z.enum(["low", "normal", "high"]).optional(),
        contactId: z.string().optional(),
        orderId: z.string().optional(),
        assignedToId: z.string().optional().describe("Defaults to you"),
      }),
      execute: async ({ assignedToId, ...fields }) => {
        const record = await db.case.create({
          data: {
            ...fields,
            caseNumber: await generateCaseNumber(),
            assignedToId: assignedToId || principal.userId,
            createdByAgent: true,
          },
          select: { id: true, caseNumber: true, subject: true, severity: true, status: true },
        })

        return { ok: true as const, case: record }
      },
    }),

    listCases: defineTool({
      description: "Open service cases, most severe first. Use for 'what problems are outstanding'.",
      inputSchema: z.object({
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
        customerId: z.string().optional(),
        mineOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ status, customerId, mineOnly, limit }) => {
        const cases = await db.case.findMany({
          where: {
            status: status ?? "open",
            ...(customerId ? { customerId } : {}),
            ...(mineOnly ? { assignedToId: principal.userId } : {}),
          },
          orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
          take: limit ?? 20,
          select: {
            id: true,
            caseNumber: true,
            subject: true,
            category: true,
            severity: true,
            status: true,
            createdAt: true,
            customer: { select: { id: true, name: true } },
            contact: { select: { name: true } },
            assignedTo: { select: { name: true } },
          },
        })

        return cases.map((record) => ({
          ...record,
          customer: record.customer?.name,
          customerId: record.customer?.id,
          contact: record.contact?.name ?? null,
          assignedTo: record.assignedTo?.name ?? null,
        }))
      },
    }),

    resolveCase: defineTool({
      description: "Close out a service case with what was done about it.",
      inputSchema: z.object({
        caseId: z.string(),
        resolution: z.string(),
        status: z.enum(["resolved", "closed"]).optional(),
      }),
      execute: async ({ caseId, resolution, status }) => {
        const record = await db.case.update({
          where: { id: caseId },
          data: {
            resolution,
            status: status || "resolved",
            resolvedAt: new Date(),
          },
          select: { caseNumber: true, status: true },
        })

        return { ok: true as const, case: record }
      },
    }),
  }
}
