import { z } from "zod"

import { db } from "@/lib/db"
import {
  createBooking,
  draftBooking,
  markBookingSent,
  renderBooking,
  resolveCarrierForAddress,
} from "@/lib/freight"
import { sendCommunicationMessage } from "@/lib/communications"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { findOrder, isStaff } from "./shared"

/**
 * Third-party freight.
 *
 * Delivery is subcontracted and the carrier depends on the destination, so the
 * agent's job is: work out who covers the address, fill that carrier's own
 * booking form from the order, show it to a human, and only then send it.
 *
 * Drafting is free - it writes a row and contacts nobody. Sending is gated at
 * the policy layer because it commits the business to a third party and the
 * carrier acts on it immediately.
 */

export function buildFreightTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listCarriers: defineTool({
      description:
        "The carriers set up for third-party delivery and the areas each one covers. Use this to answer 'who delivers to X' before drafting anything.",
      inputSchema: z.object({
        includeDisabled: z.boolean().optional(),
      }),
      execute: async ({ includeDisabled }) => {
        const carriers = await db.carrier.findMany({
          where: includeDisabled ? {} : { enabled: true },
          include: { zones: { orderBy: { priority: "asc" } } },
          orderBy: { name: "asc" },
        })

        return carriers.map((carrier) => ({
          id: carrier.id,
          name: carrier.name,
          bookingMethod: carrier.bookingMethod,
          bookingEmail: carrier.bookingEmail,
          cutoffTime: carrier.cutoffTime,
          enabled: carrier.enabled,
          zones: carrier.zones.map((zone) => ({
            id: zone.id,
            name: zone.name,
            covers: `${zone.matchType} ${zone.matchValue}`,
            priority: zone.priority,
            leadTimeDays: zone.leadTimeDays,
          })),
        }))
      },
    }),

    resolveCarrier: defineTool({
      description:
        "Work out which carrier covers a destination. The most specific service area wins. Returns nothing when no area covers the address - say so rather than picking a carrier.",
      inputSchema: z.object({
        postcode: z.string().optional(),
        state: z.string().optional(),
        city: z.string().optional(),
        weightKg: z.number().optional(),
      }),
      execute: async ({ postcode, state, city, weightKg }) => {
        const match = await resolveCarrierForAddress({ postcode, state, city, weightKg })

        if (!match) {
          return {
            found: false as const,
            message: `No carrier covers ${city || ""} ${postcode || state || ""}`.trim(),
          }
        }

        return { found: true as const, ...match }
      },
    }),

    draftFreightBooking: defineTool({
      description:
        "Fill a carrier's booking form from an order and save it as a draft. Picks the carrier from the delivery address unless one is named. Contacts nobody - always run this and read back the details and any missing fields before sending.",
      inputSchema: z.object({
        orderNumber: z.string().describe("Order number or id"),
        carrierId: z.string().optional().describe("Force a specific carrier instead of area routing"),
      }),
      execute: async ({ orderNumber, carrierId }) => {
        const order = await findOrder(principal, orderNumber)
        if (!order) {
          return { ok: false as const, error: `No order found matching ${orderNumber}` }
        }

        const drafted = await draftBooking({ orderId: order.id, carrierId })
        if (!drafted.ok || !drafted.carrier || !drafted.payload) {
          return { ok: false as const, error: drafted.error }
        }

        const created = await createBooking({
          orderId: order.id,
          carrierId: drafted.carrier.carrierId,
          zoneId: drafted.carrier.zoneId || undefined,
          payload: drafted.payload,
          quotedPrice: drafted.carrier.estimatedPrice,
          createdByAgent: true,
          companyId: drafted.context?._raw.companyId ?? null,
        })

        if (!created.ok) {
          return { ok: false as const, error: created.error }
        }

        return {
          ok: true as const,
          bookingId: created.booking.id,
          bookingNumber: created.booking.bookingNumber,
          carrier: drafted.carrier.carrier,
          routedBy: drafted.carrier.matchedOn,
          leadTimeDays: drafted.carrier.leadTimeDays,
          estimatedPrice: drafted.carrier.estimatedPrice,
          // Surfaced so the model reports gaps instead of sending a blank field.
          missingRequired: drafted.missing,
          subject: created.rendered.subject,
          body: created.rendered.body,
        }
      },
    }),

    reviewFreightBooking: defineTool({
      description:
        "Read back a drafted booking exactly as it will be sent to the carrier. Show this to a human before asking to send.",
      inputSchema: z.object({ bookingNumber: z.string() }),
      execute: async ({ bookingNumber }) => {
        const booking = await db.freightBooking.findFirst({
          where: { OR: [{ id: bookingNumber }, { bookingNumber }] },
          include: { carrier: true },
        })

        if (!booking) {
          return { found: false as const }
        }

        return {
          found: true as const,
          bookingNumber: booking.bookingNumber,
          status: booking.status,
          carrier: booking.carrier.name,
          to: booking.carrier.bookingEmail,
          subject: booking.renderedSubject,
          body: booking.renderedBody,
          sentAt: booking.sentAt,
          quotedPrice: booking.quotedPrice,
        }
      },
    }),

    sendFreightBooking: defineTool({
      description:
        "Send a drafted booking to the carrier. This commits the business to a third party and they act on it immediately, so it always needs human approval.",
      inputSchema: z.object({ bookingNumber: z.string() }),
      execute: async ({ bookingNumber }) => {
        const booking = await db.freightBooking.findFirst({
          where: { OR: [{ id: bookingNumber }, { bookingNumber }] },
          include: { carrier: true },
        })

        if (!booking) {
          return { ok: false as const, error: "Booking not found" }
        }

        if (booking.status === "sent" || booking.status === "confirmed") {
          return { ok: false as const, error: `Already ${booking.status} - not sending twice` }
        }

        if (booking.carrier.bookingMethod !== "email") {
          return {
            ok: false as const,
            error: `${booking.carrier.name} takes bookings by ${booking.carrier.bookingMethod}. The filled form is ready to lodge at ${booking.carrier.portalUrl || "their portal"}.`,
          }
        }

        const to = booking.carrier.bookingEmail
        if (!to) {
          return { ok: false as const, error: `${booking.carrier.name} has no booking email set` }
        }

        await sendCommunicationMessage({
          to,
          method: "email",
          subject: booking.renderedSubject || `Booking ${booking.bookingNumber}`,
          message: booking.renderedBody || "",
          documentId: booking.id,
          documentNumber: booking.bookingNumber,
          metadata: { kind: "freight_booking", carrierId: booking.carrierId },
        })

        await markBookingSent({ bookingId: booking.id, sentTo: to })

        return { ok: true as const, bookingNumber: booking.bookingNumber, sentTo: to }
      },
    }),

    listFreightBookings: defineTool({
      description: "Recent freight bookings and their status.",
      inputSchema: z.object({
        status: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ status, limit }) => {
        const bookings = await db.freightBooking.findMany({
          where: status ? { status } : {},
          include: { carrier: true },
          orderBy: { createdAt: "desc" },
          take: limit ?? 20,
        })

        return bookings.map((booking) => ({
          bookingNumber: booking.bookingNumber,
          carrier: booking.carrier.name,
          status: booking.status,
          sentAt: booking.sentAt,
          consignmentNote: booking.consignmentNote,
          quotedPrice: booking.quotedPrice,
          createdByAgent: booking.createdByAgent,
        }))
      },
    }),
  }
}
