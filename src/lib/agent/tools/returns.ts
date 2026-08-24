import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/** Returns, RMAs & Credit Notes. */

export function buildReturnTools(principal: AgentPrincipal) {
  return {
    listReturns: defineTool({
      description: "List product returns and RMA requests, filtered by status or customer.",
      inputSchema: z.object({
        status: z.enum(["requested", "approved", "received", "completed", "rejected"]).optional(),
        customerId: z.string().optional(),
        cursor: z.string().optional().describe("ID of the last item from previous page for cursor pagination"),
        page: z.number().int().min(1).optional().describe("Page number (1-based)"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of items to fetch (max 100)").default(10),
      }),
      execute: async ({ status, customerId, cursor, page, limit = 10 }) => {
        const _limit = limit ?? 20;
        const boundCustomer = principal.kind === "customer" ? principal.customerId : customerId

        const returns = await db.return.findMany({
          where: {
            ...(status ? { status } : {}),
            ...(boundCustomer ? { customerId: boundCustomer } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: _limit,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : page ? (page - 1) * _limit : 0,
          include: {
            customer: { select: { name: true } },
            order: { select: { orderNumber: true } },
            items: { include: { product: { select: { name: true, sku: true } } } },
          },
        })

        const items = returns.map((r) => ({
id: r.id,
          returnNumber: r.returnNumber,
          customer: r.customer.name,
          orderNumber: r.order?.orderNumber ?? null,
          status: r.status,
          refundAmount: money(r.refundAmount),
          reason: r.reason,
          items: r.items.map((i) => ({
            product: i.product.name,
            sku: i.product.sku,
            quantity: i.quantity,
            condition: i.condition,
          })),
        }));
        return {
          items,
          nextCursor: returns.length === _limit ? returns[returns.length - 1].id : undefined
        }
      },
    }),

    createCustomerReturn: defineTool({
      description:
        "Raise a return request (RMA) for damaged, expired, or incorrect goods from a sales order.",
      inputSchema: z.object({
        orderNumberOrId: z.string().describe("Sales order number or ID"),
        reason: z.string().describe("Reason for return (e.g. 'damaged in transit', 'expired stock')"),
        action: z.enum(["credit", "replace", "refund"]).optional().default("credit"),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().positive(),
            reason: z.string().optional(),
            condition: z.enum(["damaged", "expired", "unopened", "wrong_item"]).optional().default("damaged"),
          })
        ),
      }),
      execute: async ({ orderNumberOrId, reason, action, items }) => {
        const order = await db.salesOrder.findFirst({
          where: { OR: [{ id: orderNumberOrId }, { orderNumber: orderNumberOrId }] },
          select: { id: true, customerId: true, orderNumber: true },
        })

        if (!order) {
          return { ok: false as const, error: "Order not found" }
        }

        if (principal.kind === "customer" && order.customerId !== principal.customerId) {
          return { ok: false as const, error: "Unauthorized access to order" }
        }

        const returnNumber = `RET-${Date.now().toString().slice(-6)}`
        const ret = await db.return.create({
          data: {
            returnNumber,
            orderId: order.id,
            customerId: order.customerId,
            reason,
            // Return has no `action` column; the requested action rides in
            // notes until the model carries one.
            notes: action ? `Requested action: ${action}` : null,
            status: "pending",
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                condition: item.condition,
              })),
            },
          },
          select: { id: true, returnNumber: true, status: true },
        })

        return {
          ok: true as const,
          returnId: ret.id,
          returnNumber: ret.returnNumber,
          message: `Raised return request ${ret.returnNumber} for order ${order.orderNumber}.`,
        }
      },
    }),

    approveReturn: defineTool({
      description: "Approve a return request.",
      inputSchema: z.object({
        returnId: z.string(),
        internalNotes: z.string().optional(),
      }),
      execute: async ({ returnId, internalNotes }) => {
        const ret = await db.return.findUnique({ where: { id: returnId } })
        if (!ret) return { ok: false as const, error: "Return not found" }

        const updated = await db.return.update({
          where: { id: returnId },
          data: {
            status: "approved",
            ...(internalNotes && { internalNotes }),
          },
        })
        return { ok: true as const, returnRequest: updated }
      },
    }),

    rejectReturn: defineTool({
      description: "Reject a return request.",
      inputSchema: z.object({
        returnId: z.string(),
        reason: z.string(),
      }),
      execute: async ({ returnId, reason }) => {
        const ret = await db.return.findUnique({ where: { id: returnId } })
        if (!ret) return { ok: false as const, error: "Return not found" }

        const updated = await db.return.update({
          where: { id: returnId },
          data: {
            status: "rejected",
            internalNotes: reason,
          },
        })
        return { ok: true as const, returnRequest: updated }
      },
    }),

    completeReturn: defineTool({
      description: "Mark a return as completed/received and process refund.",
      inputSchema: z.object({
        returnId: z.string(),
        refundAmount: z.number().nonnegative(),
        restockItems: z.boolean().optional().default(false),
      }),
      execute: async ({ returnId, refundAmount, restockItems }) => {
        const ret = await db.return.findUnique({
          where: { id: returnId },
          include: { items: true },
        })
        if (!ret) return { ok: false as const, error: "Return not found" }

        const updated = await db.return.update({
          where: { id: returnId },
          data: {
            status: "completed",
            refundAmount,
            totalAmount: refundAmount,
          },
        })

        return { ok: true as const, returnRequest: updated, restocked: restockItems }
      },
    }),
  }
}
