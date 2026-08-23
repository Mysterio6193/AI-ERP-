import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/** Customer Contract Pricing & Tiered Price Lists. */

export function buildPriceListTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listPriceLists: defineTool({
      description: "List all custom trade price lists and pricing tiers.",
      inputSchema: z.object({}),
      execute: async () => {
        const priceLists = await db.priceList.findMany({
          where: { status: "active" },
          include: {
            _count: { select: { items: true, customers: true } },
          },
        })

        return priceLists.map((p) => ({
          id: p.id,
          name: p.name,
          currency: p.currency,
          customerCount: p._count.customers,
          customPricedItems: p._count.items,
        }))
      },
    }),

    assignCustomerPriceList: defineTool({
      description: "Assign a custom price list or contract pricing tier to a customer.",
      inputSchema: z.object({
        customerId: z.string().describe("Customer ID"),
        priceListId: z.string().describe("Price List ID"),
      }),
      execute: async ({ customerId, priceListId }) => {
        const [customer, priceList] = await Promise.all([
          db.customer.update({
            where: { id: customerId },
            data: { priceListId },
            select: { name: true },
          }),
          db.priceList.findUnique({
            where: { id: priceListId },
            select: { name: true },
          }),
        ])

        return {
          ok: true as const,
          customer: customer.name,
          priceList: priceList?.name,
          message: `Assigned price list "${priceList?.name}" to customer "${customer.name}".`,
        }
      },
    }),
  }
}
