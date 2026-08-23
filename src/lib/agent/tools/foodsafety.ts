import { z } from "zod"

import { auditAllergens, checkBomAllergens } from "@/lib/allergens"
import {
  allocateFefo,
  batchesForProduct,
  expiringBatches,
  quarantineBatch,
  releaseBatch,
} from "@/lib/batches"
import { traceBatch } from "@/lib/manufacturing"
import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { findProducts, isStaff, safeDb } from "./shared"

/**
 * Lot control and allergen safety.
 *
 * The two things a food manufacturer cannot get wrong. Quarantining is a write
 * that stops stock shipping, so it is gated; everything else is read.
 */

export function buildFoodSafetyTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    getBatches: defineTool({
      description:
        "The lots of a product currently in stock, with expiry dates and any holds. Use this when asked what stock is on hand of a particular batch, or which stock is oldest.",
      inputSchema: z.object({
        product: z.string().describe("Product name or SKU"),
      }),
      execute: async ({ product }) => {
        const matches = await findProducts(product, 3)

        if (!matches.length) {
          return { found: false as const, error: `No product matching "${product}"` }
        }

        const batches = await batchesForProduct(matches[0].id)

        return {
          found: true as const,
          product: matches[0].name,
          batches: batches.map((batch) => ({
            batchCode: batch.batchCode,
            quantity: batch.quantity,
            available: batch.quantity - batch.reserved,
            expiryDate: batch.expiryDate,
            status: batch.status,
            hold: batch.holdReason,
          })),
        }
      },
    }),

    expiringStock: defineTool({
      description:
        "Stock approaching or past its expiry date, worst first, with the value at risk. Use this to answer what needs selling or discounting.",
      inputSchema: z.object({
        withinDays: z.number().int().min(1).max(365).optional(),
      }),
      execute: async ({ withinDays }) => {
        const batches = await expiringBatches(withinDays ?? 21)

        return {
          count: batches.length,
          totalValueAtRisk: Number(
            batches.reduce((sum, batch) => sum + batch.valueAtRisk, 0).toFixed(2)
          ),
          batches,
        }
      },
    }),

    checkStockAvailability: defineTool({
      description:
        "Whether an order quantity can actually be filled from sellable lots, picking earliest expiry first. Reports anything blocked by a hold and any shortfall, so you never promise stock that cannot ship.",
      inputSchema: z.object({
        product: z.string(),
        quantity: z.number().positive(),
        warehouseId: z.string().optional(),
      }),
      execute: async ({ product, quantity, warehouseId }) => {
        const matches = await findProducts(product, 3)

        if (!matches.length) {
          return { ok: false as const, error: `No product matching "${product}"` }
        }

        const warehouse =
          warehouseId ||
          (await db.warehouse.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id

        if (!warehouse) {
          return { ok: false as const, error: "No warehouse to check" }
        }

        const result = await allocateFefo({
          productId: matches[0].id,
          warehouseId: warehouse,
          quantity,
        })

        return {
          ok: result.ok,
          product: matches[0].name,
          requested: quantity,
          canFill: quantity - result.unallocated,
          shortfall: result.unallocated,
          wouldPick: result.allocations.map((line) => ({
            batchCode: line.batchCode,
            quantity: line.quantity,
            expiryDate: line.expiryDate,
          })),
          blocked: result.blocked,
        }
      },
    }),

    checkAllergens: defineTool({
      description:
        "Compare a recipe's ingredients against what the finished product declares. Run this before a production run of anything carrying a free-from claim. A failure here means the label is wrong, which is a recall.",
      inputSchema: z.object({
        recipe: z.string().describe("Recipe name or id"),
      }),
      execute: async ({ recipe }) => {
        const bom = await db.billOfMaterial.findFirst({
          where: { OR: [{ id: recipe }, { name: { contains: recipe, mode: "insensitive" } }] },
          select: { id: true },
        })

        if (!bom) {
          return { ok: false as const, error: `No recipe matching "${recipe}"` }
        }

        return checkBomAllergens(bom.id)
      },
    }),

    auditAllergenDeclarations: defineTool({
      description:
        "Check every active recipe for undeclared allergens or contradicted free-from claims. Use when asked whether the labels are right across the site.",
      inputSchema: z.object({}),
      execute: async () => safeDb(async () => auditAllergens()),
    }),

    quarantineStock: defineTool({
      description:
        "Put every remaining unit of a batch on hold so it cannot be picked or shipped. Use immediately when a supplier notifies a recall or a quality problem is found. This stops stock going out, so it needs a human decision.",
      inputSchema: z.object({
        batchCode: z.string(),
        reason: z.string().describe("Why, in a few words. It appears on the hold."),
      }),
      execute: async ({ batchCode, reason }) => safeDb(async () => quarantineBatch(batchCode, reason)),
    }),

    releaseStock: defineTool({
      description: "Take a batch off hold once it has been cleared.",
      inputSchema: z.object({ batchCode: z.string() }),
      execute: async ({ batchCode }) => safeDb(async () => releaseBatch(batchCode)),
    }),

    traceBatch: defineTool({
      description:
        "Perform forward and backward lot traceability for food safety or recall. Shows what raw ingredients went into a finished batch, or which customers and sales orders received product made from a supplier lot.",
      inputSchema: z.object({
        batchCode: z.string().describe("The lot code / batch code to trace"),
      }),
      execute: async ({ batchCode }) => safeDb(async () => traceBatch(batchCode)),
    }),
  }
}
