import { z } from "zod"

import { db } from "@/lib/db"
import { CHANNEL_LABEL, canSupply, checkSupplyLink, isChannelRole, summariseChannel } from "@/lib/channel"

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
