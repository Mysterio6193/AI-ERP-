import { z } from "zod"

import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { findProducts, isStaff, money } from "./shared"

/** Products, stock and pricing. Available to staff and customers alike. */

export function buildCatalogTools(principal: AgentPrincipal) {
  const shared = {
    searchProducts: defineTool({
      description:
        "Search the product catalog by name, SKU, brand or description. Returns price and available stock. Use this to turn what someone typed into a real product id before ordering.",
      inputSchema: z.object({
        query: z.string().describe("What the person asked for, e.g. 'roma tomatoes' or 'olive oil 4L'"),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, limit }) => findProducts(query, limit ?? 8),
    }),

    getStock: defineTool({
      description: "Stock on hand for a product across warehouses, including reserved and reorder level.",
      inputSchema: z.object({ productId: z.string() }),
      execute: async ({ productId }) => {
        const rows = await db.inventory.findMany({
          where: { productId },
          select: {
            quantity: true,
            reserved: true,
            onOrder: true,
            reorderLevel: true,
            warehouse: { select: { name: true } },
          },
        })

        return rows.map((row) => ({
          warehouse: row.warehouse?.name,
          onHand: row.quantity,
          reserved: row.reserved,
          available: row.quantity - row.reserved,
          onOrder: row.onOrder,
          reorderLevel: row.reorderLevel,
          belowReorder: row.quantity <= row.reorderLevel,
        }))
      },
    }),
  }

  if (!isStaff(principal)) {
    return shared
  }

  return {
    ...shared,

    stockOutlook: defineTool({
      description:
        "Products that are out of stock or below reorder level right now, worst first. Use for 'what are we short on' questions.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      execute: async ({ limit }) => {
        const rows = await db.inventory.findMany({
          take: limit ?? 25,
          select: {
            quantity: true,
            reserved: true,
            onOrder: true,
            reorderLevel: true,
            product: { select: { id: true, name: true, sku: true, wholesalePrice: true } },
            warehouse: { select: { name: true } },
          },
        })

        return rows
          .map((row) => ({
            productId: row.product?.id,
            product: row.product?.name,
            sku: row.product?.sku,
            warehouse: row.warehouse?.name,
            available: row.quantity - row.reserved,
            onOrder: row.onOrder,
            reorderLevel: row.reorderLevel,
            price: money(row.product?.wholesalePrice || 0),
          }))
          .filter((row) => row.available <= row.reorderLevel)
          .sort((a, b) => a.available - b.available)
      },
    }),

    adjustInventory: defineTool({
      description:
        "Adjust stock on hand after a count, breakage or write-off. Records a stock movement so the change is traceable.",
      inputSchema: z.object({
        productId: z.string(),
        warehouseId: z.string(),
        quantityDelta: z.number().int().describe("Positive to add, negative to remove"),
        reason: z.string(),
      }),
      execute: async ({ productId, warehouseId, quantityDelta, reason }) => {
        const existing = await db.inventory.findFirst({
          where: { productId, warehouseId },
          select: { id: true, quantity: true },
        })

        if (!existing) {
          return { ok: false as const, error: "No inventory record for that product and warehouse" }
        }

        if (existing.quantity + quantityDelta < 0) {
          return {
            ok: false as const,
            error: `Cannot remove ${Math.abs(quantityDelta)} - only ${existing.quantity} on hand`,
          }
        }

        const updated = await db.inventory.update({
          where: { id: existing.id },
          data: { quantity: { increment: quantityDelta } },
          select: { quantity: true },
        })

        await db.stockMovement.create({
          data: {
            productId,
            warehouseId,
            inventoryId: existing.id,
            type: "adjustment",
            quantity: quantityDelta,
            reason,
            referenceType: "adjustment",
            userId: principal.userId,
          },
        })

        return { ok: true as const, onHand: updated.quantity }
      },
    }),
  }
}
