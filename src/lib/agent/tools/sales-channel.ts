import { z } from "zod"

import { db } from "@/lib/db"
import { CHANNEL_LABEL, canSupply, checkSupplyLink, isChannelRole, summariseChannel } from "@/lib/channel"
import { USAGE_STATUS_LABEL, describeConfidence, summarisePullThrough, type UsageRow } from "@/lib/end-user-usage"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * The questions a two-tier channel makes people ask.
 *
 * RDM sells to distributors and the venues cook with the product, so the useful
 * questions are not the ones a single-tier CRM answers. "Which venues does PFD
 * serve" decides who to talk to when a distributor drops a line. "Who supplies
 * Bella Napoli" is what a rep needs the moment a venue asks where to buy. And a
 * venue with no distributor recorded is a lead nobody can complete — they want
 * the product and there is no answer to where they get it.
 */

function refuse(reason: string) {
  return { ok: false as const, error: reason }
}

export function buildSalesChannelTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) return {}

  return {
    setChannelRole: defineTool({
      description:
        "Record whether an account buys direct, is a distributor, or is an end user that buys RDM product through a distributor. End users are not expected to place orders, so this also stops them appearing in lapsed-account reports.",
      inputSchema: z.object({
        customerId: z.string().describe("The customer to classify"),
        role: z
          .enum(["direct", "distributor", "end_user"])
          .describe("direct = buys from us, distributor = resells to venues, end_user = a venue buying via a distributor"),
      }),
      execute: async ({ customerId, role }) => {
        if (!isChannelRole(role)) return refuse(`"${role}" is not a channel role.`)

        const customer = await db.customer.findUnique({
          where: { id: customerId },
          select: { name: true, suppliedById: true, _count: { select: { supplies: true } } },
        })

        if (!customer) return refuse("No customer with that id.")

        /**
         * Demoting a distributor that still supplies venues would leave those
         * venues pointing at an account that is no longer allowed to supply —
         * a link that reads as valid and is not.
         */
        if (role !== "distributor" && customer._count.supplies > 0) {
          return refuse(
            `${customer.name} is recorded as supplying ${customer._count.supplies} venue(s). ` +
              `Move those to another distributor before changing its role.`
          )
        }

        await db.customer.update({
          where: { id: customerId },
          data: {
            channelRole: role,
            // A distributor cannot itself be supplied by one.
            ...(role === "distributor" ? { suppliedById: null } : {}),
          },
        })

        return { ok: true as const, customer: customer.name, role, meaning: CHANNEL_LABEL[role] }
      },
    }),

    setSupplyingDistributor: defineTool({
      description:
        "Record which distributor supplies a venue, so anyone can answer 'where do they buy it' without asking around. Pass no distributor to clear it.",
      inputSchema: z.object({
        customerId: z.string().describe("The end user (venue)"),
        distributorId: z.string().optional().describe("The distributor that supplies them; omit to clear"),
      }),
      execute: async ({ customerId, distributorId }) => {
        const [customer, distributor] = await Promise.all([
          db.customer.findUnique({ where: { id: customerId }, select: { name: true, channelRole: true } }),
          distributorId
            ? db.customer.findUnique({ where: { id: distributorId }, select: { name: true, channelRole: true } })
            : Promise.resolve(null),
        ])

        if (!customer) return refuse("No customer with that id.")
        if (distributorId && !distributor) return refuse("No distributor with that id.")

        const verdict = checkSupplyLink({
          customerId,
          customerRole: customer.channelRole,
          supplierId: distributorId,
          supplierRole: distributor?.channelRole,
        })

        if (!verdict.ok) return refuse(verdict.reason as string)

        await db.customer.update({ where: { id: customerId }, data: { suppliedById: distributorId ?? null } })

        return {
          ok: true as const,
          customer: customer.name,
          suppliedBy: distributor?.name ?? null,
          message: distributor
            ? `${customer.name} buys through ${distributor.name}.`
            : `Cleared who supplies ${customer.name}.`,
        }
      },
    }),

    listVenuesForDistributor: defineTool({
      description:
        "List the venues a distributor supplies with RDM product. Use this when a distributor stops ordering a line, to see which venues are affected.",
      inputSchema: z.object({
        distributorId: z.string().describe("The distributor"),
      }),
      execute: async ({ distributorId }) => {
        const distributor = await db.customer.findUnique({
          where: { id: distributorId },
          select: { name: true, channelRole: true },
        })

        if (!distributor) return refuse("No customer with that id.")

        if (!canSupply(distributor.channelRole)) {
          return refuse(`${distributor.name} is not marked as a distributor, so nothing is recorded as supplied by it.`)
        }

        const venues = await db.customer.findMany({
          where: { suppliedById: distributorId },
          // Customer carries no address; it lives on CustomerLocation.
          select: { id: true, name: true, contactPerson: true, phone: true },
          orderBy: { name: "asc" },
        })

        return {
          ok: true as const,
          distributor: distributor.name,
          count: venues.length,
          venues,
        }
      },
    }),

    recordEndUserUsage: defineTool({
      description:
        "Record what a venue actually uses, when they buy it through a distributor rather than from us. Use this after a rep visit or when a distributor reports it. Re-recording the same venue and product corrects the figure rather than adding a second one.",
      inputSchema: z.object({
        customerId: z.string().describe("The venue"),
        productId: z.string().describe("The product they use"),
        estimatedQty: z.number().optional().describe("Roughly how much, per period"),
        period: z.enum(["week", "month"]).optional().describe("Per week or per month; defaults to week"),
        unit: z.string().optional().describe("Boxes, pallets, kg - whatever they said"),
        viaDistributorId: z.string().optional().describe("Which distributor they buy it through"),
        status: z
          .enum(["using", "trialling", "lapsed", "lost_to_competitor"])
          .optional()
          .describe("Defaults to using"),
        competitorProduct: z.string().optional().describe("What they switched to, if lost"),
        notes: z.string().optional(),
      }),
      execute: async (input) => {
        const [customer, product] = await Promise.all([
          db.customer.findUnique({ where: { id: input.customerId }, select: { name: true, channelRole: true } }),
          db.product.findUnique({ where: { id: input.productId }, select: { name: true, baseUnit: true } }),
        ])

        if (!customer) return refuse("No customer with that id.")
        if (!product) return refuse("No product with that id.")

        /**
         * Recorded against a direct buyer this would duplicate the order book
         * and disagree with it, so it is refused with the reason rather than
         * quietly written somewhere nobody looks.
         */
        if (customer.channelRole !== "end_user") {
          return refuse(
            `${customer.name} buys from us directly, so their usage is already in the order history. ` +
              `This is for venues that buy through a distributor — mark them as an end user first.`
          )
        }

        const usage = await db.endUserProduct.upsert({
          where: { customerId_productId: { customerId: input.customerId, productId: input.productId } },
          create: {
            customerId: input.customerId,
            productId: input.productId,
            estimatedQty: input.estimatedQty ?? null,
            period: input.period ?? "week",
            unit: input.unit ?? product.baseUnit ?? null,
            viaDistributorId: input.viaDistributorId ?? null,
            status: input.status ?? "using",
            competitorProduct: input.competitorProduct ?? null,
            notes: input.notes ?? null,
            // Recording it is confirming it; that is what makes the row ageable.
            lastConfirmedAt: new Date(),
            confirmedById: principal.userId ?? null,
            source: "rep_visit",
          },
          update: {
            ...(input.estimatedQty !== undefined ? { estimatedQty: input.estimatedQty } : {}),
            ...(input.period ? { period: input.period } : {}),
            ...(input.unit ? { unit: input.unit } : {}),
            ...(input.viaDistributorId ? { viaDistributorId: input.viaDistributorId } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.competitorProduct !== undefined ? { competitorProduct: input.competitorProduct } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            lastConfirmedAt: new Date(),
            confirmedById: principal.userId ?? null,
          },
          select: { id: true, status: true, estimatedQty: true, period: true, unit: true },
        })

        return {
          ok: true as const,
          customer: customer.name,
          product: product.name,
          status: USAGE_STATUS_LABEL[usage.status as keyof typeof USAGE_STATUS_LABEL] ?? usage.status,
          recorded:
            usage.estimatedQty !== null
              ? `about ${usage.estimatedQty} ${usage.unit ?? ""} a ${usage.period}`.replace(/\s+/g, " ").trim()
              : "no quantity given",
        }
      },
    }),

    productPullThrough: defineTool({
      description:
        "What venues say they use, summarised per product. Answers what the order book cannot: whether real demand is holding up when a distributor's orders fall, and which distributors a product reaches venues through.",
      inputSchema: z.object({
        productId: z.string().optional().describe("Limit to one product"),
      }),
      execute: async ({ productId }) => {
        const rows = await db.endUserProduct.findMany({
          where: productId ? { productId } : {},
          select: {
            customerId: true,
            productId: true,
            estimatedQty: true,
            period: true,
            unit: true,
            status: true,
            viaDistributorId: true,
            lastConfirmedAt: true,
            customer: { select: { name: true } },
            product: { select: { name: true } },
            viaDistributor: { select: { name: true } },
          },
        })

        if (rows.length === 0) {
          return {
            ok: true as const,
            products: [],
            message:
              "Nothing recorded yet. Usage is added from rep visits with recordEndUserUsage — venues buying through a distributor never appear in the order book.",
          }
        }

        const usage: UsageRow[] = rows.map((row) => ({
          customerId: row.customerId,
          customerName: row.customer?.name ?? "Unknown",
          productId: row.productId,
          productName: row.product?.name ?? "Unknown",
          estimatedQty: row.estimatedQty,
          period: row.period,
          unit: row.unit,
          status: row.status,
          viaDistributorId: row.viaDistributorId,
          viaDistributorName: row.viaDistributor?.name ?? null,
          lastConfirmedAt: row.lastConfirmedAt,
        }))

        return { ok: true as const, products: summarisePullThrough(usage) }
      },
    }),

    venueUsage: defineTool({
      description:
        "What one venue uses, with how recently each figure was confirmed. Read this before visiting or ringing them.",
      inputSchema: z.object({ customerId: z.string() }),
      execute: async ({ customerId }) => {
        const customer = await db.customer.findUnique({
          where: { id: customerId },
          select: { name: true, channelRole: true, suppliedBy: { select: { name: true } } },
        })

        if (!customer) return refuse("No customer with that id.")

        const rows = await db.endUserProduct.findMany({
          where: { customerId },
          orderBy: { status: "asc" },
          select: {
            estimatedQty: true, period: true, unit: true, status: true,
            competitorProduct: true, notes: true, lastConfirmedAt: true,
            product: { select: { id: true, name: true, sku: true } },
            viaDistributor: { select: { name: true } },
          },
        })

        return {
          ok: true as const,
          customer: customer.name,
          buysThrough: customer.suppliedBy?.name ?? null,
          uses: rows.map((row) => ({
            product: row.product?.name,
            sku: row.product?.sku,
            status: USAGE_STATUS_LABEL[row.status as keyof typeof USAGE_STATUS_LABEL] ?? row.status,
            quantity:
              row.estimatedQty !== null
                ? `about ${row.estimatedQty} ${row.unit ?? ""} a ${row.period}`.replace(/\s+/g, " ").trim()
                : null,
            via: row.viaDistributor?.name ?? null,
            switchedTo: row.competitorProduct,
            // Said on every figure, so nobody quotes a rumour as a fact.
            confidence: describeConfidence(row.lastConfirmedAt),
            notes: row.notes,
          })),
        }
      },
    }),

    channelOverview: defineTool({
      description:
        "Summarise the sales channel: how many distributors, how many end-user venues, and how many venues have no distributor recorded against them.",
      inputSchema: z.object({}),
      execute: async () => {
        const customers = await db.customer.findMany({
          where: { status: "active" },
          select: { channelRole: true, suppliedById: true },
        })

        const counts = summariseChannel(customers)

        const unlinked = counts.unlinkedEndUsers
          ? await db.customer.findMany({
              where: { status: "active", channelRole: "end_user", suppliedById: null },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
              take: 20,
            })
          : []

        return {
          ok: true as const,
          ...counts,
          /**
           * The list matters more than the number: a venue with no distributor
           * recorded cannot be told where to buy, which is the one thing they
           * rang up to find out.
           */
          venuesWithNoDistributor: unlinked,
        }
      },
    }),
  }
}
