import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/** Manufacturing, Recipes & Production Orders. Staff only. */

export function buildManufacturingTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listBoms: defineTool({
      description:
        "List all Bill of Materials (BOM) recipes for manufactured or sub-assembled food products.",
      inputSchema: z.object({
        productId: z.string().optional().describe("Filter by output product ID"),
      }),
      execute: async ({ productId }) => {
        const boms = await db.billOfMaterial.findMany({
          where: {
            status: "active",
            ...(productId ? { productId } : {}),
          },
          include: {
            product: { select: { id: true, name: true, sku: true } },
            lines: {
              include: { component: { select: { id: true, name: true, sku: true, costPrice: true } } },
            },
          },
        })

        return boms.map((bom) => ({
          id: bom.id,
          name: bom.name,
          product: bom.product.name,
          sku: bom.product.sku,
          yieldQty: bom.yieldQty,
          yieldUnit: bom.yieldUnit,
          componentsCount: bom.lines.length,
          components: bom.lines.map((l) => ({
            component: l.component.name,
            quantity: l.quantity,
            unit: l.unit,
            wastePct: l.wastePercent,
          })),
        }))
      },
    }),

    createProductionOrder: defineTool({
      description:
        "Schedule a new production run / recipe batch in the ERP.",
      inputSchema: z.object({
        productId: z.string().describe("Product ID of the finished good to produce"),
        plannedQty: z.number().positive().describe("Quantity of finished goods to produce"),
        scheduledFor: z.string().optional().describe("ISO date for when the batch is scheduled"),
        batchCode: z.string().optional().describe("Lot code to assign to the batch"),
        notes: z.string().optional(),
      }),
      execute: async ({ productId, plannedQty, scheduledFor, batchCode, notes }) => {
        const product = await db.product.findUnique({
          where: { id: productId },
          include: { billsOfMaterial: { where: { status: "active" }, take: 1 } },
        })

        if (!product) {
          return { ok: false as const, error: "Product not found" }
        }

        const bom = product.billsOfMaterial[0]
        const orderNumber = `PRD-${Date.now().toString().slice(-6)}`

        const productionOrder = await db.productionOrder.create({
          data: {
            orderNumber,
            productId,
            bomId: bom?.id || null,
            plannedQty,
            batchCode: batchCode || `LOT-${Date.now().toString().slice(-6)}`,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
            status: "planned",
            notes: notes || null,
            createdById: principal.userId,
            createdByAgent: true,
          },
          select: {
            id: true,
            orderNumber: true,
            plannedQty: true,
            batchCode: true,
            status: true,
            scheduledFor: true,
          },
        })

        return {
          ok: true as const,
          productionOrder,
          message: `Created Production Order ${productionOrder.orderNumber} for ${plannedQty}x ${product.name} (Batch: ${productionOrder.batchCode}).`,
        }
      },
    }),

    listProductionOrders: defineTool({
      description:
        "List production runs and recipe batches, filtered by status (planned, in_progress, completed, cancelled).",
      inputSchema: z.object({
        status: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(25).optional().default(10),
      }),
      execute: async ({ status, limit = 10 }) => {
        const orders = await db.productionOrder.findMany({
          where: { ...(status ? { status } : {}) },
          orderBy: { scheduledFor: "desc" },
          take: limit,
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        })

        return orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          product: o.product.name,
          sku: o.product.sku,
          plannedQty: o.plannedQty,
          producedQty: o.producedQty,
          status: o.status,
          batchCode: o.batchCode,
          scheduledFor: o.scheduledFor,
        }))
      },
    }),

    updateProductionOrder: defineTool({
      description: "Update a production order (e.g. change status to in_progress, update notes, or targetQty).",
      inputSchema: z.object({
        productionOrderId: z.string(),
        status: z.enum(["planned", "released", "in_progress", "completed", "cancelled"]).optional(),
        plannedQty: z.number().positive().optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ productionOrderId, status, plannedQty, notes }) => {
        const order = await db.productionOrder.findUnique({
          where: { id: productionOrderId },
        })
        if (!order) return { ok: false as const, error: "Production order not found" }

        const updated = await db.productionOrder.update({
          where: { id: productionOrderId },
          data: {
            ...(status && { status }),
            ...(plannedQty && { plannedQty }),
            ...(notes && { notes }),
          },
        })
        return { ok: true as const, productionOrder: updated }
      },
    }),

    completeProductionOrder: defineTool({
      description: "Mark a production order as completed and record the actual produced quantity.",
      inputSchema: z.object({
        productionOrderId: z.string(),
        producedQty: z.number().nonnegative(),
        rejectedQty: z.number().nonnegative().optional().default(0),
      }),
      execute: async ({ productionOrderId, producedQty, rejectedQty }) => {
        const order = await db.productionOrder.findUnique({
          where: { id: productionOrderId },
        })
        if (!order) return { ok: false as const, error: "Production order not found" }

        const updated = await db.productionOrder.update({
          where: { id: productionOrderId },
          data: {
            status: "completed",
            producedQty,
            rejectedQty,
          },
        })
        return { ok: true as const, productionOrder: updated }
      },
    }),

    cancelProductionOrder: defineTool({
      description: "Cancel a production order and record a reason.",
      inputSchema: z.object({
        productionOrderId: z.string(),
        reason: z.string(),
      }),
      execute: async ({ productionOrderId, reason }) => {
        const order = await db.productionOrder.findUnique({
          where: { id: productionOrderId },
        })
        if (!order) return { ok: false as const, error: "Production order not found" }

        const updated = await db.productionOrder.update({
          where: { id: productionOrderId },
          data: {
            status: "cancelled",
            notes: reason,
          },
        })
        return { ok: true as const, productionOrder: updated }
      },
    }),
  }
}

