import { z } from "zod"

import { db } from "@/lib/db"
import { recordPaymentAtomic } from "@/lib/payments"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { customerScope, days, isStaff, money, safeDb } from "./shared"

/** Receivables, payments and collections. */

const AGE_BUCKETS = [
  { label: "current", min: -Infinity, max: 0 },
  { label: "1-30", min: 1, max: 30 },
  { label: "31-60", min: 31, max: 60 },
  { label: "61-90", min: 61, max: 90 },
  { label: "90+", min: 91, max: Infinity },
]

function bucketFor(daysOverdue: number) {
  return AGE_BUCKETS.find((bucket) => daysOverdue >= bucket.min && daysOverdue <= bucket.max)!.label
}

export function buildFinanceTools(principal: AgentPrincipal) {
  const scope = customerScope(principal)

  const shared = {
    listInvoices: defineTool({
      description:
        "List invoices, optionally only unpaid or overdue. Customers only ever see their own.",
      inputSchema: z.object({
        onlyOverdue: z.boolean().optional(),
        onlyUnpaid: z.boolean().optional(),
        customerId: z.string().optional(),
        cursor: z.string().optional().describe("ID of the last item from previous page for cursor pagination"),
        page: z.number().int().min(1).optional().describe("Page number (1-based)"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of items to fetch (max 100)")
      }),
      execute: async ({ onlyOverdue, onlyUnpaid, customerId, cursor, page, limit }) =>  safeDb(async () => {
        const _limit = limit ?? 20;
        const invoices = await db.invoice.findMany({
          where: {
            ...scope,
            ...(isStaff(principal) && customerId ? { customerId } : {}),
            ...(onlyUnpaid || onlyOverdue ? { status: { not: "paid" } } : {}),
            ...(onlyOverdue ? { dueDate: { lt: new Date() } } : {}),
          },
          orderBy: { dueDate: "asc" },
          take: _limit,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : page ? (page - 1) * _limit : 0,
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            outstandingAmt: true,
            dueDate: true,
            customer: { select: { id: true, name: true } },
          },
        })

        return invoices.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          total: money(invoice.totalAmount),
          outstanding: money(invoice.outstandingAmt),
          dueDate: invoice.dueDate,
          daysOverdue: Math.max(0, days(invoice.dueDate)),
          customer: invoice.customer?.name,
          customerId: invoice.customer?.id,
        }))
      }),
    }),

    getInvoice: defineTool({
      description: "One invoice in full, including payments received against it and the order it came from.",
      inputSchema: z.object({ invoiceNumberOrId: z.string() }),
      execute: async ({ invoiceNumberOrId }) =>  safeDb(async () => {
        const invoice = await db.invoice.findFirst({
          where: {
            ...scope,
            OR: [{ id: invoiceNumberOrId }, { invoiceNumber: invoiceNumberOrId }],
          },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            invoiceDate: true,
            dueDate: true,
            subtotal: true,
            taxAmount: true,
            totalAmount: true,
            paidAmount: true,
            outstandingAmt: true,
            customer: { select: { id: true, name: true } },
            order: { select: { orderNumber: true } },
            payments: {
              select: { amount: true, method: true, paidAt: true, reference: true },
              orderBy: { paidAt: "desc" },
            },
          },
        })

        if (!invoice) {
          return { found: false as const }
        }

        return {
          found: true as const,
          ...invoice,
          total: money(invoice.totalAmount),
          paid: money(invoice.paidAmount),
          outstanding: money(invoice.outstandingAmt),
          daysOverdue: Math.max(0, days(invoice.dueDate)),
          payments: invoice.payments.map((payment) => ({
            ...payment,
            amount: money(payment.amount),
          })),
        }
      }),
    }),
  }

  if (!isStaff(principal)) {
    return shared
  }

  return {
    ...shared,

    agedReceivables: defineTool({
      description:
        "Aged receivables summary - what is owed, by whom, in current / 1-30 / 31-60 / 61-90 / 90+ buckets. Use for 'how bad is our debtor book' questions.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        minOutstanding: z.number().optional(),
      }),
      execute: async ({ customerId, minOutstanding }) =>  safeDb(async () => {
        const invoices = await db.invoice.findMany({
          where: {
            status: { not: "paid" },
            ...(customerId ? { customerId } : {}),
            ...(minOutstanding ? { outstandingAmt: { gte: minOutstanding } } : {}),
          },
          select: {
            outstandingAmt: true,
            dueDate: true,
            invoiceNumber: true,
            customer: { select: { id: true, name: true, creditStatus: true } },
          },
        })

        const buckets: Record<string, number> = {}
        const byCustomer = new Map<
          string,
          { customerId: string; customer: string; outstanding: number; oldestDays: number; creditStatus: string }
        >()

        for (const invoice of invoices) {
          const daysOverdue = days(invoice.dueDate)
          const bucket = bucketFor(daysOverdue)
          buckets[bucket] = money((buckets[bucket] || 0) + invoice.outstandingAmt)

          const key = invoice.customer?.id || "unknown"
          const existing = byCustomer.get(key)

          if (existing) {
            existing.outstanding = money(existing.outstanding + invoice.outstandingAmt)
            existing.oldestDays = Math.max(existing.oldestDays, daysOverdue)
          } else {
            byCustomer.set(key, {
              customerId: key,
              customer: invoice.customer?.name || "Unknown",
              outstanding: money(invoice.outstandingAmt),
              oldestDays: daysOverdue,
              creditStatus: invoice.customer?.creditStatus || "unknown",
            })
          }
        }

        const worst = [...byCustomer.values()].sort((a, b) => b.outstanding - a.outstanding)

        return {
          totalOutstanding: money(invoices.reduce((sum, row) => sum + row.outstandingAmt, 0)),
          invoiceCount: invoices.length,
          buckets,
          worstOffenders: worst.slice(0, 10),
        }
      }),
    }),

    recordPayment: defineTool({
      description:
        "Record a payment against an invoice. Updates the invoice, the customer balance, and closes the invoice if fully paid.",
      inputSchema: z.object({
        invoiceId: z.string(),
        amount: z.number().positive(),
        method: z.enum(["bank_transfer", "bpay", "credit_card", "eftpos", "cash", "cheque"]),
        reference: z.string().optional(),
      }),
      execute: async ({ invoiceId, amount, method, reference }) =>  safeDb(async () => {
        const invoice = await db.invoice.findUnique({
          where: { id: invoiceId },
          select: {
            id: true,
            customerId: true,
            paidAmount: true,
            outstandingAmt: true,
            totalAmount: true,
          },
        })

        if (!invoice) {
          return { ok: false as const, error: "Invoice not found" }
        }

        // Shared with the manual route, Stripe and COD. This path used to write
        // no CreditTransaction and never release a credit hold, so a customer
        // stayed blocked from ordering after the agent recorded their payment.
        const result = await recordPaymentAtomic({
          invoiceId,
          amount,
          method,
          reference,
        })

        if (!result.ok) {
          return { ok: false as const, error: result.error }
        }

        if ("duplicate" in result) {
          return { ok: true as const, note: "That payment was already recorded." }
        }

        return {
          ok: true as const,
          outstanding: money(result.outstanding),
          status: result.invoiceStatus,
          creditReleased: result.creditReleased,
        }
      }),
    }),

    setCreditStatus: defineTool({
      description:
        "Change a customer's credit status. Stopping an account blocks new orders, so this always needs a human decision.",
      inputSchema: z.object({
        customerId: z.string(),
        status: z.enum(["active", "on_hold", "stopped"]),
        reason: z.string(),
      }),
      execute: async ({ customerId, status, reason }) =>  safeDb(async () => {
        const customer = await db.customer.update({
          where: { id: customerId },
          data: { creditStatus: status },
          select: { name: true, creditStatus: true },
        })

        await db.communicationLog.create({
          data: {
            customerId,
            method: "note",
            direction: "outbound",
            recipient: customer.name,
            subject: `Credit status changed to ${status}`,
            message: reason,
            status: "sent",
          },
        })

        return { ok: true as const, customer: customer.name, creditStatus: customer.creditStatus }
      }),
    }),
  }
}
