import { z } from "zod"

import { convertToBase, describeQuantity, unitsForProduct } from "@/lib/units"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { findProducts } from "./shared"

/**
 * Packing levels.
 *
 * Customers order in their own language — a restaurant says boxes, a
 * distributor says pallets — and the agent has to price and pick from the same
 * stock either way. Available to customers too, since "how much is a pallet"
 * is a question they ask.
 */

export function buildUnitTools(_principal: AgentPrincipal) {
  return {
    getProductUnits: defineTool({
      description:
        "How a product can be ordered — each, carton, box, pallet — with the price of each and how many base units it holds. Check this before quoting when someone names a pack size, so you quote the right thing.",
      inputSchema: z.object({
        product: z.string().describe("Product name or SKU"),
      }),
      execute: async ({ product }) => {
        const matches = await findProducts(product, 3)

        if (!matches.length) {
          return { found: false as const, error: `No product matching "${product}"` }
        }

        const units = await unitsForProduct(matches[0].id)

        return {
          found: true as const,
          product: matches[0].name,
          sku: matches[0].sku,
          units: units.map((unit) => ({
            code: unit.code,
            name: unit.name,
            holdsBaseUnits: unit.factor,
            price: unit.price,
            // Flagged so the agent does not assume a pallet is a straight
            // multiple when it has been priced deliberately.
            pricedSeparately: unit.explicitPrice,
          })),
        }
      },
    }),

    convertQuantity: defineTool({
      description:
        "Turn an order in the customer's units into base units and a line price. Use this whenever someone orders in pallets, boxes or anything other than the base unit. Report any rounding rather than quietly changing what they asked for.",
      inputSchema: z.object({
        product: z.string(),
        quantity: z.number().positive(),
        unit: z.string().describe("Unit code or name, e.g. PALLET"),
      }),
      execute: async ({ product, quantity, unit }) => {
        const matches = await findProducts(product, 3)

        if (!matches.length) {
          return { ok: false as const, error: `No product matching "${product}"` }
        }

        const result = await convertToBase({
          productId: matches[0].id,
          quantity,
          unitCode: unit,
        })

        if (!result.ok) {
          return { ok: false as const, error: result.error }
        }

        return {
          ok: true as const,
          product: matches[0].name,
          ordered: `${quantity} x ${result.unit.name}`,
          baseQuantity: result.baseQuantity,
          unitPrice: result.unitPrice,
          lineTotal: result.lineTotal,
          rounded: result.rounded ?? null,
          readsAs: await describeQuantity(matches[0].id, result.baseQuantity),
        }
      },
    }),
  }
}
