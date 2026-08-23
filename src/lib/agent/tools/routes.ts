import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/** Fleet Delivery Routes & Dispatch Logistics. Staff only. */

export function buildRouteTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listDeliveryRoutes: defineTool({
      description:
        "List delivery runs and driver routes for today/upcoming dates with assigned stops, drivers, and completion status.",
      inputSchema: z.object({
        date: z.string().optional().describe("ISO date (default today)"),
        status: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional(),
        cursor: z.string().optional().describe("ID of the last item from previous page for cursor pagination"),
        page: z.number().int().min(1).optional().describe("Page number (1-based)"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of items to fetch (max 100)")
      }),
      execute: async ({ date, status, cursor, page, limit }) => {
        const _limit = limit ?? 20;
        const targetDate = date ? new Date(date) : new Date()
        const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
        const dayEnd = new Date(dayStart.getTime() + 86400000)

        const routes = await db.deliveryRoute.findMany({
          where: {
            routeDate: { gte: dayStart, lt: dayEnd },
            ...(status ? { status } : {}),
          },
          include: {
            driver: { select: { name: true, phone: true } },
            deliveries: {
              include: {
                customer: { select: { name: true, phone: true } },
              },
            },
          },
        })

        const items = routes.map((r) => ({
id: r.id,
          routeNumber: r.routeNumber,
          name: r.name,
          routeDate: r.routeDate,
          status: r.status,
          driver: r.driver?.name || "Unassigned",
          vehicle: r.vehicle || "N/A",
          stopCount: r.deliveries.length,
          stops: r.deliveries.map((d) => ({
            deliveryId: d.id,
            sequence: d.sequenceNo,
            orderId: d.orderId,
            customer: d.customer.name,
            phone: d.customer.phone || "N/A",
            status: d.status,
          })),
        }));
        return {
          items,
          nextCursor: routes.length === _limit ? routes[routes.length - 1].id : undefined
        }
      },
    }),

    createDeliveryRoute: defineTool({
      description: "Create a new driver delivery route / run.",
      inputSchema: z.object({
        name: z.string().describe("Route name, e.g. 'Melbourne CBD Morning Run' or 'North Suburbs Fleet A'"),
        date: z.string().optional().describe("ISO delivery date (defaults to today)"),
        vehicle: z.string().optional().describe("Vehicle registration plate or ID"),
        driverUserId: z.string().optional().describe("Assigned driver user ID"),
      }),
      execute: async ({ name, date, vehicle, driverUserId }) => {
        const routeNumber = `RTE-${Date.now().toString().slice(-6)}`
        const route = await db.deliveryRoute.create({
          data: {
            routeNumber,
            name,
            routeDate: date ? new Date(date) : new Date(),
            vehicle: vehicle || null,
            driverId: driverUserId || null,
            status: "planned",
          },
          select: { id: true, routeNumber: true, name: true, routeDate: true, status: true },
        })

        return {
          ok: true as const,
          route,
          message: `Created delivery route ${route.routeNumber} ("${route.name}").`,
        }
      },
    }),
  }
}
