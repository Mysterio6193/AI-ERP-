import { z } from "zod"

import { analyseCadence, findLapsedAccounts } from "@/lib/crm"
import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { days, isStaff, money } from "./shared"

/** Accounts, follow-ups, and the account-health signals a rep actually acts on. */

export function buildCrmTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    findCustomers: defineTool({
      description: "Search customers by business name, trading name, contact person, email or phone.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ query, limit }) => {
        const customers = await db.customer.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { tradingName: { contains: query, mode: "insensitive" } },
              { contactPerson: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } },
            ],
          },
          take: limit ?? 8,
          select: {
            id: true,
            name: true,
            contactPerson: true,
            phone: true,
            email: true,
            creditStatus: true,
            creditLimit: true,
            creditBalance: true,
          },
        })

        return customers.map((customer) => ({
          ...customer,
          availableCredit: money(Math.max(customer.creditLimit - customer.creditBalance, 0)),
        }))
      },
    }),

    createCustomer: defineTool({
      description:
        "Create a new customer account or trade profile in SupplySure OS. Use this when a user provides customer/business details (name, contact, email, phone, address, etc.) to set up a new account.",
      inputSchema: z.object({
        name: z.string().describe("Business or trade account name, e.g. 'Bella Italia Pizzeria'"),
        tradingName: z.string().optional().describe("Trading name if different"),
        contactPerson: z.string().optional().describe("Primary contact full name"),
        email: z.string().optional().describe("Email address for invoices/orders"),
        phone: z.string().optional().describe("Contact phone number"),
        customerType: z.enum(["wholesale", "retail", "business"]).optional().default("wholesale"),
        creditLimit: z.number().nonnegative().optional().default(0),
        paymentTerms: z.number().int().min(0).max(180).optional().default(30),
        address: z.string().optional().describe("Street address"),
        city: z.string().optional().describe("City or Suburb"),
        state: z.string().optional().describe("State/Province"),
        postcode: z.string().optional().describe("Postal/ZIP code"),
        deliveryNotes: z.string().optional().describe("Delivery instructions or loading dock access"),
      }),
      execute: async (input) => {
        // A customer with no company produces orders and invoices with none
        // either, so it follows the staff member who created it.
        const creator =
          principal.kind === "staff"
            ? await db.user.findUnique({ where: { id: principal.userId }, select: { companyId: true } })
            : null

        const customer = await db.customer.create({
          data: {
            companyId: creator?.companyId ?? null,
            name: input.name.trim(),
            tradingName: input.tradingName?.trim() || null,
            contactPerson: input.contactPerson?.trim() || null,
            email: input.email?.trim() || null,
            phone: input.phone?.trim() || null,
            customerType: input.customerType || "wholesale",
            creditLimit: input.creditLimit || 0,
            paymentTerms: input.paymentTerms || 30,
            salesRepId: principal.kind === "staff" && principal.role === "sales" ? principal.userId : null,
            status: "active",
            locations: input.address && input.city && input.state && input.postcode ? {
              create: {
                label: "Main Location",
                address: input.address,
                city: input.city,
                state: input.state,
                postcode: input.postcode,
                contactName: input.contactPerson || null,
                phone: input.phone || null,
                email: input.email || null,
                deliveryNotes: input.deliveryNotes || null,
                isDefault: true,
                isBilling: true,
                isShipping: true,
              }
            } : undefined,
          },
          select: {
            id: true,
            name: true,
            contactPerson: true,
            email: true,
            phone: true,
            creditLimit: true,
            paymentTerms: true,
            status: true,
          },
        })

        return {
          ok: true as const,
          customer,
          message: `Created customer account "${customer.name}" with ID ${customer.id}.`,
        }
      },
    }),

    updateCustomer: defineTool({
      description: "Update an existing customer's contact details, credit terms, or status.",
      inputSchema: z.object({
        customerId: z.string(),
        name: z.string().optional(),
        contactPerson: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        creditLimit: z.number().nonnegative().optional(),
        paymentTerms: z.number().int().min(0).max(180).optional(),
        status: z.enum(["active", "inactive", "blocked"]).optional(),
      }),
      execute: async ({ customerId, ...patch }) => {
        const customer = await db.customer.update({
          where: { id: customerId },
          data: patch,
          select: {
            id: true,
            name: true,
            contactPerson: true,
            email: true,
            phone: true,
            creditLimit: true,
            paymentTerms: true,
            status: true,
          },
        })

        return {
          ok: true as const,
          customer,
          message: `Updated customer "${customer.name}".`,
        }
      },
    }),

    getCustomer: defineTool({
      description:
        "A full 360 view of one customer: credit position, ordering rhythm, recent orders, unpaid invoices and open tasks. Read this before advising on an account.",
      inputSchema: z.object({ customerId: z.string() }),
      execute: async ({ customerId }) => {
        const customer = await db.customer.findUnique({
          where: { id: customerId },
          select: {
            id: true,
            name: true,
            tradingName: true,
            contactPerson: true,
            email: true,
            phone: true,
            creditLimit: true,
            creditBalance: true,
            creditStatus: true,
            creditRating: true,
            paymentTerms: true,
            customerType: true,
            status: true,
            invoices: {
              where: { status: { not: "paid" } },
              take: 10,
              select: { invoiceNumber: true, outstandingAmt: true, dueDate: true, status: true },
            },
          },
        })

        if (!customer) {
          return { found: false as const }
        }

        const [orders, tasks] = await Promise.all([
          db.salesOrder.findMany({
            where: { customerId, status: { not: "cancelled" } },
            orderBy: { orderDate: "desc" },
            take: 30,
            select: { orderNumber: true, status: true, totalAmount: true, orderDate: true },
          }),
          db.crmTask.findMany({
            where: { customerId, status: "open" },
            select: { id: true, title: true, dueAt: true, priority: true },
          }),
        ])

        return {
          found: true as const,
          ...customer,
          availableCredit: money(Math.max(customer.creditLimit - customer.creditBalance, 0)),
          cadence: analyseCadence(orders),
          recentOrders: orders.slice(0, 5).map((order) => ({
            ...order,
            totalAmount: money(order.totalAmount),
          })),
          openTasks: tasks,
        }
      },
    }),

    lapsedAccounts: defineTool({
      description:
        "Accounts that have stopped ordering relative to their own usual rhythm - the earliest signal of churn. Returns who, how overdue against their pattern, and what they are worth. Use for 'who's gone quiet' and win-back questions.",
      inputSchema: z.object({
        minOrderHistory: z
          .number()
          .int()
          .min(3)
          .optional()
          .describe("Minimum past orders before a rhythm is trusted. Defaults to 3."),
        mineOnly: z
          .boolean()
          .optional()
          .describe(
            "Only accounts where you are the sales rep. Defaults to true for a sales rep, false for everyone else - set it to false explicitly to see the whole book."
          ),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ minOrderHistory, mineOnly, limit }) => {
        // A rep asking "who has gone quiet" means their own accounts. Answering
        // for the whole business buries the three they can actually act on.
        // Everyone else keeps the full view unless they ask to narrow it.
        const scoped =
          mineOnly ?? (principal.kind === "staff" && principal.role === "sales")

        return findLapsedAccounts({
          minOrderHistory,
          limit,
          ...(scoped ? { salesRepId: principal.userId } : {}),
        })
      },
    }),

    listTasks: defineTool({
      description: "List CRM tasks. Defaults to open tasks, soonest due first.",
      inputSchema: z.object({
        assignedToMe: z.boolean().optional(),
        customerId: z.string().optional(),
        status: z.enum(["open", "done", "cancelled"]).optional(),
        overdueOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ assignedToMe, customerId, status, overdueOnly, limit }) => {
        const tasks = await db.crmTask.findMany({
          where: {
            status: status ?? "open",
            ...(assignedToMe ? { assignedToId: principal.userId } : {}),
            ...(customerId ? { customerId } : {}),
            ...(overdueOnly ? { dueAt: { lt: new Date() } } : {}),
          },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          take: limit ?? 15,
          select: {
            id: true,
            title: true,
            type: true,
            notes: true,
            dueAt: true,
            priority: true,
            status: true,
            customerId: true,
            createdByAgent: true,
          },
        })

        const customerIds = tasks.map((task) => task.customerId).filter(Boolean) as string[]
        const names = await db.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
        const nameById = new Map(names.map((entry) => [entry.id, entry.name]))

        return tasks.map((task) => ({
          ...task,
          customer: task.customerId ? nameById.get(task.customerId) : null,
        }))
      },
    }),

    createTask: defineTool({
      description:
        "Create a follow-up - a call to make, an account to chase, a quote to send. This is how a commitment survives the conversation.",
      inputSchema: z.object({
        title: z.string(),
        notes: z.string().optional(),
        type: z.enum(["follow_up", "call", "visit", "quote", "collection"]).optional(),
        customerId: z.string().optional(),
        dueAt: z.string().optional().describe("ISO datetime"),
        priority: z.enum(["low", "normal", "high"]).optional(),
        assignedToId: z.string().optional().describe("Defaults to the person you are talking to"),
      }),
      execute: async ({ title, notes, type, customerId, dueAt, priority, assignedToId }) => {
        const task = await db.crmTask.create({
          data: {
            title,
            notes,
            type: type || "follow_up",
            customerId: customerId || null,
            dueAt: dueAt ? new Date(dueAt) : null,
            priority: priority || "normal",
            assignedToId: assignedToId || principal.userId,
            createdById: principal.userId,
            createdByAgent: true,
          },
          select: { id: true, title: true, dueAt: true, priority: true },
        })

        return { ok: true as const, task }
      },
    }),

    completeTask: defineTool({
      description: "Mark a task done, optionally recording what happened.",
      inputSchema: z.object({ taskId: z.string(), note: z.string().optional() }),
      execute: async ({ taskId, note }) => {
        const task = await db.crmTask.update({
          where: { id: taskId },
          data: {
            status: "done",
            completedAt: new Date(),
            ...(note ? { notes: note } : {}),
          },
          select: { id: true, title: true },
        })

        return { ok: true as const, task }
      },
    }),

    logCustomerNote: defineTool({
      description:
        "Record what happened on an account or prospect lead - a visit, a call, product interest, or a commitment made. Keeps history complete without anyone filling in a form.",
      inputSchema: z.object({
        customerId: z.string().describe("Customer ID, lead ID, or company/venue name"),
        note: z.string().describe("The note or visit summary to record"),
        subject: z.string().optional().describe("Short subject or topic"),
      }),
      execute: async ({ customerId, note, subject }) => {
        let validCustomerId: string | null = null
        const customer = await db.customer.findFirst({
          where: {
            OR: [
              { id: customerId },
              { name: { contains: customerId, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true },
        })

        if (customer) {
          validCustomerId = customer.id
        } else {
          // Check if it is a lead
          const lead = await db.lead.findFirst({
            where: {
              OR: [
                { id: customerId },
                { businessName: { contains: customerId, mode: "insensitive" } },
              ],
            },
          })
          if (lead) {
            const updatedNotes = lead.notes ? `${lead.notes}\n[${new Date().toLocaleDateString("en-AU")}] ${note}` : note
            await db.lead.update({
              where: { id: lead.id },
              data: { notes: updatedNotes },
            })
            return { ok: true as const, message: `Note successfully logged to prospect lead "${lead.businessName}".` }
          }
        }

        if (!validCustomerId) {
          return { ok: false as const, error: `Could not find an active customer or lead matching "${customerId}".` }
        }

        const log = await db.communicationLog.create({
          data: {
            customerId: validCustomerId,
            method: "note",
            direction: "inbound",
            recipient: principal.email,
            subject: subject || "Account note",
            message: note,
            status: "received",
            metadataJson: JSON.stringify({ loggedByAgent: true }),
          },
          select: { id: true },
        })

        return { ok: true as const, logId: log.id, message: `Note logged on customer account "${customer?.name}".` }
      },
    }),

    accountTimeline: defineTool({
      description:
        "Everything that has happened on an account in one chronological list - orders, invoices, payments, notes and messages. Use before calling a customer.",
      inputSchema: z.object({
        customerId: z.string(),
        limit: z.number().int().min(5).max(60).optional(),
      }),
      execute: async ({ customerId, limit }) => {
        const take = limit ?? 25

        const [orders, invoices, payments, comms] = await Promise.all([
          db.salesOrder.findMany({
            where: { customerId },
            orderBy: { orderDate: "desc" },
            take,
            select: { orderNumber: true, status: true, totalAmount: true, orderDate: true },
          }),
          db.invoice.findMany({
            where: { customerId },
            orderBy: { invoiceDate: "desc" },
            take,
            select: { invoiceNumber: true, status: true, totalAmount: true, invoiceDate: true },
          }),
          db.payment.findMany({
            where: { customerId },
            orderBy: { paidAt: "desc" },
            take,
            select: { amount: true, method: true, paidAt: true },
          }),
          db.communicationLog.findMany({
            where: { customerId },
            orderBy: { createdAt: "desc" },
            take,
            select: { method: true, direction: true, subject: true, message: true, createdAt: true },
          }),
        ])

        const events = [
          ...orders.map((order) => ({
            at: order.orderDate,
            type: "order" as const,
            summary: `Order ${order.orderNumber} (${order.status}) ${money(order.totalAmount)}`,
          })),
          ...invoices.map((invoice) => ({
            at: invoice.invoiceDate,
            type: "invoice" as const,
            summary: `Invoice ${invoice.invoiceNumber} (${invoice.status}) ${money(invoice.totalAmount)}`,
          })),
          ...payments.map((payment) => ({
            at: payment.paidAt,
            type: "payment" as const,
            summary: `Paid ${money(payment.amount)} by ${payment.method}`,
          })),
          ...comms.map((entry) => ({
            at: entry.createdAt,
            type: "message" as const,
            summary: `${entry.direction} ${entry.method}: ${entry.subject || entry.message?.slice(0, 80) || ""}`,
          })),
        ]

        return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take)
      },
    }),
  }
}
