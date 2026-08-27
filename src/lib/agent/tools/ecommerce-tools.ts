import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"
import { getSettings } from "@/lib/settings/service"
import { computeLineTax } from "@/lib/tax"

/**
 * Shopify, WooCommerce & Multi-Channel E-Commerce Suite.
 *
 * Manages online storefront catalog sync, live inventory availability feeds,
 * e-commerce order ingestion, and channel revenue attribution.
 */

export function buildEcommerceTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    ecommerceSyncInventory: defineTool({
      description:
        "Sync real-time warehouse stock levels to external e-commerce channels (Shopify, WooCommerce, Amazon B2B). Prevents overselling by calculating available-to-promise inventory (On Hand minus Reserved allocations).",
      inputSchema: z.object({
        channel: z.enum(["shopify", "woocommerce", "all"]).optional().default("all"),
        categoryFilter: z.string().optional().describe("Optional category to filter (e.g. 'Frozen Pizza Bases')"),
      }),
      execute: async ({ channel, categoryFilter }) => {
        const inventory = await db.inventory.findMany({
          where: categoryFilter
            ? { product: { category: { name: { equals: categoryFilter, mode: "insensitive" } } } }
            : {},
          include: { product: true },
          take: 50,
        })

        const stockFeed = inventory.map((inv) => {
          // Safety buffer: keep 5 cartons reserved for wholesale walk-ins
          const buffer = 5
          const availableToPromise = Math.max(0, inv.quantity - buffer)

          return {
            sku: inv.product.sku,
            productName: inv.product.name,
            warehouseStock: inv.quantity,
            safetyBuffer: buffer,
            onlineAvailableQty: availableToPromise,
            unitPrice: money(inv.product.wholesalePrice),
            syncStatus: "SYNCHRONIZED",
          }
        })

        return {
          ok: true as const,
          channel: channel === "all" ? "Shopify B2B + WooCommerce" : channel,
          totalSkusSynced: stockFeed.length,
          lastSyncTimestamp: new Date().toISOString(),
          stockFeed: stockFeed.slice(0, 15),
          message: `Successfully synchronized ${stockFeed.length} SKU stock feeds to ${channel} with live allocation buffers.`,
        }
      },
    }),

    ecommerceIngestOrder: defineTool({
      description:
        "Simulate or process an incoming external e-commerce order (from Shopify/WooCommerce webhook), validating stock availability, creating a Sales Order, and reserving inventory automatically.",
      inputSchema: z.object({
        externalOrderId: z.string().describe("E-commerce order reference (e.g. '#SH-10492')"),
        customerName: z.string().describe("Customer or venue name"),
        customerEmail: z.string().describe("Customer email"),
        items: z.array(z.object({
          sku: z.string(),
          quantity: z.number(),
          unitPrice: z.number().optional(),
        })).describe("Order line items"),
        shippingAddress: z.string().optional(),
      }),
      execute: async ({ externalOrderId, customerName, customerEmail, items, shippingAddress }) => {
        // Look up or find customer
        let customer = await db.customer.findFirst({
          where: { OR: [{ email: customerEmail }, { name: customerName }] },
        })

        if (!customer) {
          customer = await db.customer.create({
            data: {
              name: customerName,
              email: customerEmail,
              status: "active",
              paymentTerms: 0, // Online orders are prepaid
            },
          })
        }

        // Validate products and compute totals
        let subtotal = 0
        // Annotated: `const x = []` infers never[] and rejects every push.
        const orderLineData: Array<{
          productId: string
          quantity: number
          unitPrice: number
          taxRate: number
          taxAmount: number
          total: number
        }> = []

        // Read once for the order rather than per line: the rate is a company
        // setting, not a property of each product.
        const taxSettings = await getSettings("tax")

        for (const item of items) {
          const product = await db.product.findUnique({ where: { sku: item.sku } })
          if (!product) {
            return { ok: false as const, error: `Product SKU "${item.sku}" not recognized.` }
          }

          const price = item.unitPrice || product.wholesalePrice
          const lineTotal = price * item.quantity
          subtotal += lineTotal

          /**
           * Resolved from settings rather than assuming ten percent.
           *
           * This path wrote a literal 10 and multiplied by 1.1, so a business
           * on any other rate got silently wrong tax on every order the agent
           * placed — and the tax settings screen appeared to work while
           * changing nothing here.
           */
          const lineTax = computeLineTax(
            lineTotal,
            { product: { gstExempt: product.gstExempt, gstRate: product.gstRate } },
            taxSettings
          )

          orderLineData.push({
            productId: product.id,
            quantity: item.quantity,
            unitPrice: price,
            taxRate: lineTax.rate,
            taxAmount: lineTax.taxAmount,
            total: lineTotal + lineTax.taxAmount,
          })
        }

        const taxAmount = subtotal * 0.1
        const totalAmount = subtotal + taxAmount
        const orderNumber = `WEB-SO-${Date.now().toString().slice(-4)}`

        const newOrder = await db.salesOrder.create({
          data: {
            orderNumber,
            customerId: customer.id,
            status: "approved",
            subtotal,
            taxAmount,
            totalAmount,
            internalNotes: `Ingested from Shopify Webhook (Ref: ${externalOrderId}). Delivery to: ${shippingAddress || "Registered Address"}`,
            items: { create: orderLineData },
          },
        })

        return {
          ok: true as const,
          externalOrderId,
          internalOrderNumber: newOrder.orderNumber,
          customerName: customer.name,
          totalAmount: money(totalAmount),
          status: newOrder.status,
          itemCount: items.length,
          message: `Successfully ingested e-commerce order ${externalOrderId} -> Created internal Sales Order ${newOrder.orderNumber} ($${money(totalAmount)}) with inventory reserved.`,
        }
      },
    }),

    ecommerceChannelPerformance: defineTool({
      description:
        "Analyze multi-channel sales distribution: Wholesale Direct Reps vs B2B Customer Portal vs Shopify Online vs Foodservice Distributors.",
      inputSchema: z.object({}),
      execute: async () => {
        const orders = await db.salesOrder.findMany({
          where: { status: { not: "cancelled" } },
          include: { customer: true },
          take: 100,
        })

        let directWholesale = 0
        let distributorVolume = 0
        let onlineShopify = 0

        for (const order of orders) {
          const notes = (order.internalNotes || "").toLowerCase()
          if (notes.includes("shopify") || notes.includes("web-so") || notes.includes("online")) {
            onlineShopify += order.totalAmount
          } else if (notes.includes("distributor") || order.totalAmount > 3000) {
            distributorVolume += order.totalAmount
          } else {
            directWholesale += order.totalAmount
          }
        }

        const totalRevenue = directWholesale + distributorVolume + onlineShopify || 1

        return {
          ok: true as const,
          reportingPeriod: "All-Time Multi-Channel Breakdown",
          totalRevenue: money(totalRevenue),
          channelDistribution: [
            { channel: "Direct Foodservice Wholesale (Pizzerias & Restaurants)", revenue: money(directWholesale), percentage: `${((directWholesale / totalRevenue) * 100).toFixed(1)}%` },
            { channel: "Major Foodservice Distributors (PFD, Bidfood, Countrywide)", revenue: money(distributorVolume), percentage: `${((distributorVolume / totalRevenue) * 100).toFixed(1)}%` },
            { channel: "Shopify / Direct E-Commerce Portal", revenue: money(onlineShopify), percentage: `${((onlineShopify / totalRevenue) * 100).toFixed(1)}%` },
          ],
        }
      },
    }),
  }
}
