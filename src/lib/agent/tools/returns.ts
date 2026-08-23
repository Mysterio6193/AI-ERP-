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
        limit: z.number().int().min(1).max(25).optional().default(10),
      }),
      execute: async ({ status, customerId, limit = 10 }) => {
        const boundCustomer = principal.kind === "customer" ? principal.customerId : customerId

        const returns = await db.return.findMany({
          where: {
            ...(status ? { status } : {}),
            ...(boundCustomer ? { customerId: boundCustomer } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            customer: { select: { name: true } },
            order: { select: { orderNumber: true } },
            items: { include: { product: { select: { name: true, sku: true } } } },
          },
        })

        return returns.map((r) => ({
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
        }))
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
                reason: item.reason || reason,
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
  }
}
