import { z } from "zod"

import { db } from "@/lib/db"
import { createSalesOrder, priceSalesOrder } from "@/lib/sales-orders"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { customerScope, isStaff, money } from "./shared"
import { applyOrderStatus } from "@/lib/order-status"

/** Orders and quoting. Customers get a scoped subset of the same tools. */

export function buildSalesTools(principal: AgentPrincipal, channel?: string) {
  const scope = customerScope(principal)
  const boundCustomerId = principal.kind === "customer" ? principal.customerId : undefined

  const shared = {
    listOrders: defineTool({
      description:
        "List sales orders, newest first. Staff can filter by customer; customers only ever see their own.",
      inputSchema: z.object({
        status: z.string().optional().describe("draft, confirmed, approved, picking, delivered, cancelled"),
        customerId: z.string().optional(),
        cursor: z.string().optional().describe("ID of the last item from previous page for cursor pagination"),
        page: z.number().int().min(1).optional().describe("Page number (1-based)"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of items to fetch (max 100)"),
      }),
      execute: async ({ status, customerId, cursor, page, limit }) => {
        const _limit = limit ?? 20;
        const orders = await db.salesOrder.findMany({
          where: {
            ...scope,
            ...(isStaff(principal) && customerId ? { customerId } : {}),
            ...(status ? { status } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: _limit,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : page ? (page - 1) * _limit : 0,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            orderDate: true,
            sourceChannel: true,
            customer: { select: { name: true } },
          },
        })

        const items = orders.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          total: money(order.totalAmount),
          date: order.orderDate,
          channel: order.sourceChannel,
          customer: order.customer?.name,
        }));
        return {
          items,
          nextCursor: orders.length === _limit ? orders[orders.length - 1].id : undefined
        };
      },
    }),

    getOrder: defineTool({
      description: "Full detail for one order by order number or id, including line items.",
      inputSchema: z.object({ orderNumberOrId: z.string() }),
      execute: async ({ orderNumberOrId }) => {
        const order = await db.salesOrder.findFirst({
          where: {
            ...scope,
            OR: [{ id: orderNumberOrId }, { orderNumber: orderNumberOrId }],
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            subtotal: true,
            taxAmount: true,
            totalAmount: true,
            orderDate: true,
            requiredDate: true,
            customerNotes: true,
            customer: { select: { id: true, name: true } },
            items: {
              select: {
                quantity: true,
                unitPrice: true,
                total: true,
                product: { select: { id: true, name: true, sku: true } },
              },
            },
          },
        })

        if (!order) {
          return { found: false as const }
        }

        return {
          found: true as const,
          ...order,
          total: money(order.totalAmount),
          items: order.items.map((item) => ({
            product: item.product?.name,
            sku: item.product?.sku,
            productId: item.product?.id,
            quantity: item.quantity,
            unitPrice: money(item.unitPrice),
            total: money(item.total),
          })),
        }
      },
    }),

    quoteBasket: defineTool({
      description:
        "Price a basket without saving anything: line totals, GST and grand total. Always use this to confirm an order before creating it.",
      inputSchema: z.object({
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().positive(),
            unitPrice: z.number().positive().optional(),
          })
        ),
      }),
      execute: async ({ items }) => {
        const priced = await priceSalesOrder(items)

        if (!priced.ok) {
          return { ok: false as const, error: priced.error }
        }

        return {
          ok: true as const,
          items: priced.items.map((item) => ({
            product: item.productName,
            quantity: item.quantity,
            unitPrice: money(item.unitPrice),
            total: money(item.total),
          })),
          subtotal: money(priced.subtotal),
          gst: money(priced.taxAmount),
          total: money(priced.totalAmount),
        }
      },
    }),

    createSalesOrder: defineTool({
      description:
        "Create a sales order. Confirm the basket with quoteBasket first and read the total back to the person before calling this.",
      inputSchema: z.object({
        customerId: z
          .string()
          .optional()
          .describe("Omit when talking to a customer - their own account is used automatically"),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().positive(),
            unitPrice: z.number().positive().optional(),
          })
        ),
        deliveryDate: z.string().optional().describe("ISO date"),
        notes: z.string().optional(),
        estimatedTotal: z
          .number()
          .describe("Grand total from quoteBasket. Drives the auto-approval threshold - must be accurate."),
      }),
      execute: async ({ customerId, items, deliveryDate, notes, estimatedTotal }) => {
        const targetCustomer = boundCustomerId || customerId

        if (!targetCustomer) {
          return { ok: false as const, error: "No customer specified" }
        }

        const priced = await priceSalesOrder(items)
        if (!priced.ok) {
          return { ok: false as const, error: priced.error }
        }

        if (estimatedTotal < priced.totalAmount - 1) {
          return {
            ok: false as const,
            error: `Security policy violation: estimatedTotal (${estimatedTotal}) is lower than actual total (${priced.totalAmount}). Provide accurate total.`,
          }
        }

        const result = await createSalesOrder({
          customerId: targetCustomer,
          items,
          deliveryDate,
          notes,
          sourceChannel: channel || "agent",
          createdByAgent: true,
        })

        if (!result.ok) {
          return { ok: false as const, error: result.error, code: result.code }
        }

        return {
          ok: true as const,
          orderNumber: result.order.orderNumber,
          orderId: result.order.id,
          total: money(result.order.totalAmount),
          status: result.order.status,
        }
      },
    }),
  }

  if (!isStaff(principal)) {
    return shared
  }

  return {
    ...shared,

    updateOrderStatus: defineTool({
      description: "Move an order to a new status and record why.",
      inputSchema: z.object({
        orderId: z.string(),
        // "confirmed" is gone: it renders as a status but is absent from every
        // fulfilment eligibility set, so an order parked there got no pick
        // list, no reservation and no invoice — invisible to fulfilment
        // forever. "packed" and "invoiced" were missing and are real.
        status: z.enum([
          "draft",
          "pending_approval",
          "approved",
          "picking",
          "packed",
          "dispatched",
          "delivered",
          "invoiced",
          "cancelled",
        ]),
        note: z.string().optional(),
      }),
      execute: async ({ orderId, status, note }) => {
        // Was a bare `salesOrder.update`, which fired none of the side effects
        // a status carries: an agent moving an order to "dispatched" wrote the
        // word and nothing else — stock never left, no invoice was raised, and
        // the reservation stayed held. Same path as the API now.
        const result = await applyOrderStatus(db, orderId, status, {
          userId: principal.kind === "staff" ? principal.userId : null,
          note: note || "Updated by agent",
        })

        if (!result.ok) {
          return { ok: false as const, error: result.error || "Could not change the status" }
        }

        const order = await db.salesOrder.findUnique({
          where: { id: orderId },
          select: { orderNumber: true, status: true },
        })

        return {
          ok: true as const,
          order,
          previous: result.previous,
          // Reported so the agent can say what actually happened rather than
          // just naming the new status.
          effects: result.effects,
        }
      },
    }),

    listQuotes: defineTool({
      description: "List quotes, newest first, optionally by status or customer.",
      inputSchema: z.object({
        status: z.string().optional().describe("draft, sent, accepted, rejected, expired, converted"),
        customerId: z.string().optional(),
        cursor: z.string().optional().describe("ID of the last item from previous page for cursor pagination"),
        page: z.number().int().min(1).optional().describe("Page number (1-based)"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of items to fetch (max 100)"),
      }),
      execute: async ({ status, customerId, cursor, page, limit }) => {
        const _limit = limit ?? 20;
        const quotes = await db.quote.findMany({
          where: { ...(status ? { status } : {}), ...(customerId ? { customerId } : {}) },
          orderBy: { createdAt: "desc" },
          take: _limit,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : (page ? (page - 1) * _limit : 0),
          select: {
            id: true,
            quoteNumber: true,
            status: true,
            totalAmount: true,
            quoteDate: true,
            validUntil: true,
            customer: { select: { id: true, name: true } },
          },
        })

        const items = quotes.map((quote) => ({
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          status: quote.status,
          total: money(quote.totalAmount),
          quoteDate: quote.quoteDate,
          validUntil: quote.validUntil,
          expired: quote.validUntil ? quote.validUntil.getTime() < Date.now() : false,
          customer: quote.customer?.name,
          customerId: quote.customer?.id,
        }));
        return {
          items,
          nextCursor: quotes.length === _limit ? quotes[quotes.length - 1].id : undefined
        };
      },
    }),
  }
}
