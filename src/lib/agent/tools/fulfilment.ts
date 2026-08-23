import { z } from "zod"

import { db } from "@/lib/db"
import { ensurePickListForOrder } from "@/lib/pick-lists"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { customerScope, isStaff } from "./shared"

/**
 * Picking, delivery and driver status.
 *
 * Customers get delivery visibility for their own orders only; everything that
 * touches the warehouse floor or a route is staff-side.
 */

export function buildFulfilmentTools(principal: AgentPrincipal) {
  const scope = customerScope(principal)

  const shared = {
    trackDelivery: defineTool({
      description:
        "Where a delivery is up to - scheduled window, current status, driver, and proof of delivery once complete. Customers can only see their own.",
      inputSchema: z.object({
        orderNumberOrId: z.string().optional(),
        deliveryNumber: z.string().optional(),
      }),
      execute: async ({ orderNumberOrId, deliveryNumber }) => {
        if (!orderNumberOrId && !deliveryNumber) {
          return { found: false as const, error: "Give an order number or a delivery number" }
        }

        let orderId: string | undefined

        if (orderNumberOrId) {
          const order = await db.salesOrder.findFirst({
            where: {
              ...scope,
              OR: [{ id: orderNumberOrId }, { orderNumber: orderNumberOrId }],
            },
            select: { id: true },
          })

          if (!order) {
            return { found: false as const }
          }

          orderId = order.id
        }

        const delivery = await db.delivery.findFirst({
          where: {
            ...scope,
            ...(orderId ? { orderId } : {}),
            ...(deliveryNumber ? { deliveryNumber } : {}),
          },
          orderBy: { scheduledDate: "desc" },
          select: {
            deliveryNumber: true,
            status: true,
            scheduledDate: true,
            scheduledTime: true,
            sequenceNo: true,
            enRouteAt: true,
            arrivedAt: true,
            deliveredAt: true,
            receivedBy: true,
            exceptionReason: true,
            notes: true,
            customer: { select: { name: true } },
            driver: { select: { name: true } },
            route: { select: { routeNumber: true, status: true, totalStops: true, completedStops: true } },
          },
        })

        if (!delivery) {
          return { found: false as const }
        }

        return { found: true as const, ...delivery }
      },
    }),
  }

  if (!isStaff(principal)) {
    return shared
  }

  return {
    ...shared,

    listPickLists: defineTool({
      description: "Pick lists on the warehouse floor, with progress against each.",
      inputSchema: z.object({
        status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ status, limit }) => {
        const lists = await db.pickList.findMany({
          where: status ? { status } : {},
          orderBy: { createdAt: "desc" },
          take: limit ?? 15,
          select: {
            id: true,
            pickNumber: true,
            status: true,
            startedAt: true,
            completedAt: true,
            order: { select: { orderNumber: true, customer: { select: { name: true } } } },
            warehouse: { select: { name: true } },
            user: { select: { name: true } },
            items: { select: { requiredQty: true, pickedQty: true, status: true } },
          },
        })

        return lists.map((list) => {
          const required = list.items.reduce((sum, item) => sum + item.requiredQty, 0)
          const picked = list.items.reduce((sum, item) => sum + item.pickedQty, 0)

          return {
            id: list.id,
            pickNumber: list.pickNumber,
            status: list.status,
            order: list.order?.orderNumber,
            customer: list.order?.customer?.name,
            warehouse: list.warehouse?.name,
            assignedTo: list.user?.name ?? null,
            lines: list.items.length,
            shortLines: list.items.filter((item) => item.status === "short").length,
            progress: required ? Math.round((picked / required) * 100) : 0,
            startedAt: list.startedAt,
            completedAt: list.completedAt,
          }
        })
      },
    }),

    createPickList: defineTool({
      description:
        "Generate the pick list for an order so the warehouse can start picking. Safe to call twice - an existing list is returned rather than duplicated.",
      inputSchema: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        const pickList = await ensurePickListForOrder(db, orderId)

        if (!pickList) {
          return { ok: false as const, error: "Could not create a pick list for that order" }
        }

        return { ok: true as const, pickNumber: pickList.pickNumber, pickListId: pickList.id }
      },
    }),

    listDeliveries: defineTool({
      description:
        "Deliveries by day and status - what is out, what has landed, what failed. Use for 'how are deliveries going' questions.",
      inputSchema: z.object({
        status: z
          .enum(["pending", "en_route", "arrived", "delivered", "failed", "returned"])
          .optional(),
        onDate: z.string().optional().describe("ISO date, defaults to today"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ status, onDate, limit }) => {
        const day = onDate ? new Date(onDate) : new Date()
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate())
        const end = new Date(start.getTime() + 86400000)

        const deliveries = await db.delivery.findMany({
          where: {
            scheduledDate: { gte: start, lt: end },
            ...(status ? { status } : {}),
          },
          orderBy: [{ sequenceNo: "asc" }],
          take: limit ?? 25,
          select: {
            deliveryNumber: true,
            status: true,
            sequenceNo: true,
            scheduledTime: true,
            deliveredAt: true,
            exceptionReason: true,
            customer: { select: { name: true } },
            driver: { select: { name: true } },
            route: { select: { routeNumber: true } },
          },
        })

        return {
          date: start.toDateString(),
          count: deliveries.length,
          failed: deliveries.filter((delivery) => delivery.status === "failed").length,
          delivered: deliveries.filter((delivery) => delivery.status === "delivered").length,
          deliveries,
        }
      },
    }),
  }
}
