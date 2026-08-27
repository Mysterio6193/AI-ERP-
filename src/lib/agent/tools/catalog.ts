import { z } from "zod"

import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { findProducts, isStaff, money } from "./shared"
import { availableQuantity } from "@/lib/reservations"
import { getSettings } from "@/lib/settings/service"
import { resolveDefaultTaxRate } from "@/lib/tax"

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
          available: availableQuantity(row),
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
            available: availableQuantity(row),
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

    createProduct: defineTool({
      description:
        "Create a new product or inventory SKU in SupplySure OS. Use this when a user asks to add or register a new product, item, raw material, or good.",
      inputSchema: z.object({
        sku: z.string().describe("Unique SKU, e.g. 'SMT-25KG' or 'OLV-4L'"),
        name: z.string().describe("Product name, e.g. 'San Marzano Tomatoes 2.5kg'"),
        description: z.string().optional(),
        baseUnit: z.string().optional().default("each").describe("Base unit: carton, box, each, kg, litre"),
        costPrice: z.number().nonnegative().optional().default(0),
        wholesalePrice: z.number().nonnegative().optional().default(0),
        retailPrice: z.number().nonnegative().optional(),
        minMargin: z.number().optional().default(20),
        gstExempt: z.boolean().optional().default(false),
        shelfLifeDays: z.number().int().positive().optional(),
        storageTemp: z.enum(["ambient", "chilled", "frozen"]).optional(),
        brand: z.string().optional(),
      }),
      execute: async (input) => {
        /**
         * Without this the product took the schema's own default of 10%, which
         * is right for Australia and wrong everywhere else — and it propagates,
         * because purchase orders read the rate off the product.
         */
        const defaultRate = await resolveDefaultTaxRate(db, await getSettings("tax"))

        const product = await db.product.create({
          data: {
            sku: input.sku.trim().toUpperCase(),
            name: input.name.trim(),
            description: input.description || null,
            baseUnit: input.baseUnit || "each",
            costPrice: input.costPrice || 0,
            wholesalePrice: input.wholesalePrice || 0,
            retailPrice: input.retailPrice || null,
            minMargin: input.minMargin ?? 20,
            gstExempt: input.gstExempt ?? false,
            gstRate: input.gstExempt ? 0 : (defaultRate ?? 0),
            shelfLifeDays: input.shelfLifeDays || null,
            storageTemp: input.storageTemp || null,
            brand: input.brand || null,
            status: "active",
          },
          select: {
            id: true,
            sku: true,
            name: true,
            wholesalePrice: true,
            costPrice: true,
            baseUnit: true,
          },
        })

        return {
          ok: true as const,
          product,
          message: `Created product "${product.name}" (SKU: ${product.sku}).`,
        }
      },
    }),

    updateProduct: defineTool({
      description: "Update an existing product's pricing, description, storage temp, or status.",
      inputSchema: z.object({
        productId: z.string(),
        name: z.string().optional(),
        costPrice: z.number().nonnegative().optional(),
        wholesalePrice: z.number().nonnegative().optional(),
        retailPrice: z.number().nonnegative().optional(),
        minMargin: z.number().optional(),
        status: z.enum(["active", "inactive", "discontinued"]).optional(),
      }),
      execute: async ({ productId, ...patch }) => {
        const product = await db.product.update({
          where: { id: productId },
          data: patch,
          select: {
            id: true,
            sku: true,
            name: true,
            wholesalePrice: true,
            costPrice: true,
            status: true,
          },
        })

        return {
          ok: true as const,
          product,
          message: `Updated product "${product.name}".`,
        }
      },
    }),
  }
}
