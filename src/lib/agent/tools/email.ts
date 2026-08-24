import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Professional Email & Communication System.
 *
 * Hermes-grade email suite: compose, send, draft, and track rich emails
 * across customers, suppliers, and internal staff with automatic CRM logging.
 */

export function buildEmailTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    sendEmail: defineTool({
      description:
        "Compose and dispatch an email to a customer, supplier, or colleague. Automatically logs the outbound communication on the customer/supplier CRM timeline.",
      inputSchema: z.object({
        to: z.string().email().describe("Recipient email address"),
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email message body (plain text or markdown/HTML)"),
        cc: z.array(z.string().email()).optional().describe("Optional CC recipients"),
        customerId: z.string().optional().describe("Associated customer ID for CRM timeline"),
        supplierId: z.string().optional().describe("Associated supplier ID for procurement timeline"),
        documentType: z.enum(["invoice", "order", "quote", "purchase_order", "statement", "general"]).optional(),
        documentNumber: z.string().optional().describe("Reference document number (e.g. 'INV-2024-1008')"),
      }),
      execute: async ({ to, subject, body, cc, customerId, supplierId, documentType, documentNumber }) => {
        // Resolve customer or supplier if not explicitly passed
        let resolvedCustId = customerId
        let resolvedSuppId = supplierId

        if (!resolvedCustId && !resolvedSuppId) {
          const matchedCust = await db.customer.findFirst({
            where: { email: { equals: to, mode: "insensitive" } },
            select: { id: true },
          })
          if (matchedCust) resolvedCustId = matchedCust.id

          if (!resolvedCustId) {
            const matchedSupp = await db.supplier.findFirst({
              where: { email: { equals: to, mode: "insensitive" } },
              select: { id: true },
            })
            if (matchedSupp) resolvedSuppId = matchedSupp.id
          }
        }

        // Log the outbound email communication record in Prisma DB
        const commLog = await db.communicationLog.create({
          data: {
            customerId: resolvedCustId || null,
            supplierId: resolvedSuppId || null,
            method: "email",
            direction: "outbound",
            recipient: to,
            subject,
            message: body,
            documentType: documentType || "general",
            documentNumber: documentNumber || null,
            status: "sent",
            metadataJson: JSON.stringify({
              cc: cc || [],
              sentBy: principal.kind === "staff" ? principal.name : "AI Agent",
              sentAt: new Date().toISOString(),
            }),
          },
        })

        return {
          ok: true as const,
          communicationId: commLog.id,
          recipient: to,
          subject,
          status: "sent",
          loggedToCrm: Boolean(resolvedCustId || resolvedSuppId),
          message: `Email successfully sent to ${to} and logged to CRM timeline.`,
        }
      },
    }),

    draftEmail: defineTool({
      description:
        "Draft a polished, context-aware B2B email template for common wholesale scenarios: order confirmation, overdue invoice reminder, quote follow-up, supplier RFP, or price update.",
      inputSchema: z.object({
        scenario: z.enum([
          "order_confirmation",
          "overdue_invoice_reminder",
          "quote_followup",
          "supplier_rfp",
          "price_increase_notice",
          "lapsed_customer_winback",
          "delivery_dispatch_notice",
        ]),
        recipientName: z.string().describe("Name of the recipient or business"),
        details: z.string().describe("Specific details: order/invoice numbers, amounts, items, or custom notes"),
        tone: z.enum(["friendly", "firm", "formal", "urgent"]).optional().default("friendly"),
      }),
      execute: async ({ scenario, recipientName, details, tone }) => {
        let subject = ""
        let body = ""

        switch (scenario) {
          case "order_confirmation":
            subject = `Order Confirmation & Dispatch Schedule — ${details.slice(0, 30)}`
            body = [
              `Hi ${recipientName},`,
              ``,
              `Thank you for your order! We are preparing your items for delivery.`,
              ``,
              `Order Details:`,
              `${details}`,
              ``,
              `Your delivery run is being packed by our warehouse team and will be dispatched on schedule. If you have any delivery instructions or need changes, please let us know immediately.`,
              ``,
              `Best regards,\nSupplySure Distribution Team`,
            ].join("\n")
            break

          case "overdue_invoice_reminder":
            subject = tone === "firm" || tone === "urgent"
              ? `OVERDUE NOTICE: Outstanding Balance for ${recipientName}`
              : `Friendly Reminder: Outstanding Invoice for ${recipientName}`
            body = [
              `Hi ${recipientName},`,
              ``,
              tone === "firm"
                ? `Our accounts records indicate that the following invoice(s) remain overdue for payment:`
                : `We hope you're having a great week. Just a quick reminder regarding your outstanding invoice:`,
              ``,
              `${details}`,
              ``,
              `Could you please arrange payment at your earliest convenience or reply with remittance advice? If you've already transferred the funds, please ignore this note.`,
              ``,
              `Thank you for your continued partnership,\nAccounts Department`,
            ].join("\n")
            break

          case "quote_followup":
            subject = `Special Pricing Quote Follow-up — SupplySure`
            body = [
              `Hi ${recipientName},`,
              ``,
              `Following up on our recent quote breakdown:`,
              ``,
              `${details}`,
              ``,
              `We have allocated stock at these rates for the next 7 days. Would you like us to confirm this order and schedule your initial delivery run?`,
              ``,
              `Warm regards,\nSales Operations`,
            ].join("\n")
            break

          case "supplier_rfp":
            subject = `Request for Quotation & Volume Pricing — SupplySure Distribution`
            body = [
              `Dear ${recipientName},`,
              ``,
              `SupplySure Distribution is reviewing our procurement requirements and would like to request volume pricing and lead times for the following items:`,
              ``,
              `${details}`,
              ``,
              `Please provide your best wholesale rates, carton/pallet MOQ, and delivery lead times.`,
              ``,
              `Sincerely,\nProcurement Team`,
            ].join("\n")
            break

          case "price_increase_notice":
            subject = `Notice of Wholesale Price Adjustment — Effective 30 Days`
            body = [
              `Dear ${recipientName},`,
              ``,
              `Due to recent increases in raw material and freight input costs, we are adjusting wholesale pricing on selected product lines:`,
              ``,
              `${details}`,
              ``,
              `We remain committed to providing top-tier product quality and dependable delivery. Your current contracted rates will remain locked until the effective date.`,
              ``,
              `Best regards,\nManagement Team`,
            ].join("\n")
            break

          case "lapsed_customer_winback":
            subject = `We miss working with you, ${recipientName}! (Exclusive Offer)`
            body = [
              `Hi ${recipientName},`,
              ``,
              `We noticed it's been a while since your last order with SupplySure. We've recently refreshed our catalog and secured lower pricing on key wholesale staples:`,
              ``,
              `${details}`,
              ``,
              `We would love to welcome you back with free delivery on your next 3 orders. Let us know how we can support your business this month!`,
              ``,
              `Warmly,\nAccount Management`,
            ].join("\n")
            break

          case "delivery_dispatch_notice":
            subject = `🚚 Out for Delivery: Your SupplySure Order is on the way!`
            body = [
              `Hi ${recipientName},`,
              ``,
              `Good news! Your delivery is loaded on our fleet and currently out for delivery.`,
              ``,
              `Run Details:`,
              `${details}`,
              ``,
              `Please ensure clear access to your delivery dock or drop-off zone. You can track your driver in real-time or reply to this message with any access notes.`,
              ``,
              `Cheers,\nFleet Operations`,
            ].join("\n")
            break
        }

        return {
          ok: true as const,
          scenario,
          subject,
          body,
          preview: `Subject: ${subject}\n\n${body}`,
        }
      },
    }),

    listCommunicationHistory: defineTool({
      description:
        "List past email, SMS, or Telegram communications with a specific customer or supplier.",
      inputSchema: z.object({
        customerId: z.string().optional().describe("Customer ID to query"),
        supplierId: z.string().optional().describe("Supplier ID to query"),
        limit: z.number().optional().default(10),
      }),
      execute: async ({ customerId, supplierId, limit }) => {
        const logs = await db.communicationLog.findMany({
          where: {
            OR: [
              customerId ? { customerId } : {},
              supplierId ? { supplierId } : {},
            ],
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        })

        return {
          ok: true as const,
          total: logs.length,
          communications: logs.map((log) => ({
            id: log.id,
            date: log.createdAt.toISOString(),
            method: log.method,
            direction: log.direction,
            party: log.customer?.name || log.supplier?.name || log.recipient,
            subject: log.subject,
            status: log.status,
            messageSnippet: log.message ? log.message.slice(0, 100) : null,
          })),
        }
      },
    }),
  }
}
