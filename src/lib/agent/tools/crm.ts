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
        mineOnly: z.boolean().optional().describe("Only accounts where you are the sales rep"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ minOrderHistory, mineOnly, limit }) =>
        findLapsedAccounts({
          minOrderHistory,
          limit,
          ...(mineOnly ? { salesRepId: principal.userId } : {}),
        }),
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
        "Record what happened on an account - a call, a complaint, a commitment made. Keeps the account history complete without anyone filling in a form.",
      inputSchema: z.object({
        customerId: z.string(),
        note: z.string(),
        subject: z.string().optional(),
      }),
      execute: async ({ customerId, note, subject }) => {
        const log = await db.communicationLog.create({
          data: {
            customerId,
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

        return { ok: true as const, logId: log.id }
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
