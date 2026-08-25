/**
 * Who buys from RDM, and who merely cooks with the product.
 *
 * RDM sells to distributors. The venues that actually use the product — the
 * pizzerias, the hotel kitchens — buy it from those distributors, not from RDM.
 * Both belong in the CRM, and treating them the same way gets two things wrong
 * in opposite directions.
 *
 * An end user places no orders here. Measured by RDM's own order book they look
 * permanently lapsed, so every lapse report would lead with venues that were
 * never direct buyers, and a report that is mostly false alarms stops being
 * read — taking the true alarms with it.
 *
 * And the work RDM does with an end user is a different job. With a distributor
 * it is reordering: are they buying, are they paying, are they buying less. With
 * a venue it is demand creation: do they specify the product, and does their
 * distributor stock it. A venue that asks for RDM product and cannot get it from
 * their distributor is a sales problem worth knowing about, and it is invisible
 * in an order book.
 */

export type ChannelRole = "direct" | "distributor" | "end_user"

export const CHANNEL_ROLES: ChannelRole[] = ["direct", "distributor", "end_user"]

/** What each role is called where a person reads it. */
export const CHANNEL_LABEL: Record<ChannelRole, string> = {
  direct: "Buys direct",
  distributor: "Distributor",
  end_user: "End user (buys via a distributor)",
}

export function isChannelRole(value: unknown): value is ChannelRole {
  return typeof value === "string" && (CHANNEL_ROLES as string[]).includes(value)
}

/**
 * Whether an absence of orders from this account means anything.
 *
 * The whole point of the role. An end user with no orders is behaving exactly
 * as expected; a distributor with no orders has stopped buying.
 */
export function ordersExpectedFrom(role: string | null | undefined): boolean {
  return role !== "end_user"
}

/**
 * Whether this account can supply others.
 *
 * Used to populate the "supplied by" picker, and to refuse an arrangement that
 * cannot be true.
 */
export function canSupply(role: string | null | undefined): boolean {
  return role === "distributor"
}

export interface SupplyLinkCheck {
  ok: boolean
  reason?: string
}

/**
 * Whether one account may be recorded as supplying another.
 *
 * Checked rather than assumed, because the field is a self-referencing foreign
 * key and nothing in the database stops a venue being its own supplier.
 */
export function checkSupplyLink(input: {
  customerId: string
  customerRole: string | null | undefined
  supplierId: string | null | undefined
  supplierRole: string | null | undefined
}): SupplyLinkCheck {
  if (!input.supplierId) return { ok: true }

  if (input.supplierId === input.customerId) {
    return { ok: false, reason: "An account cannot be its own supplier." }
  }

  if (!canSupply(input.supplierRole)) {
    return {
      ok: false,
      reason: "Only an account marked as a distributor can supply another. Change its channel role first.",
    }
  }

  if (input.customerRole === "distributor") {
    // Distributors buying from each other is a real arrangement in some trades
    // and is not one RDM has; allowing it here would quietly model a channel
    // nobody has described.
    return {
      ok: false,
      reason: "A distributor is not supplied by another distributor here. Mark this account as an end user first.",
    }
  }

  return { ok: true }
}

export interface ChannelCounts {
  direct: number
  distributor: number
  endUser: number
  /** End users with nobody recorded as supplying them. */
  unlinkedEndUsers: number
}

/**
 * How the channel looks, for a heading somebody reads in a second.
 *
 * `unlinkedEndUsers` is the number worth watching: a venue whose distributor is
 * unknown is a venue nobody can be told where to buy.
 */
export function summariseChannel(
  customers: Array<{ channelRole: string | null; suppliedById: string | null }>
): ChannelCounts {
  const counts: ChannelCounts = { direct: 0, distributor: 0, endUser: 0, unlinkedEndUsers: 0 }

  for (const customer of customers) {
    if (customer.channelRole === "distributor") counts.distributor++
    else if (customer.channelRole === "end_user") {
      counts.endUser++
      if (!customer.suppliedById) counts.unlinkedEndUsers++
    } else counts.direct++
  }

  return counts
}
