import { randomBytes } from "node:crypto"

import { db } from "@/lib/db"

import {
  resolveCustomerByPhone,
  resolveCustomerPrincipal,
  resolveStaffPrincipal,
  type AgentPrincipal,
} from "../context"

/**
 * Channel identity.
 *
 * A Telegram chat id or a WhatsApp phone number means nothing on its own. This
 * maps it to a real User or Customer once, and every later message inherits that
 * principal - which is what the tool layer scopes itself against.
 *
 * Staff link deliberately, with a short-lived code generated in the app.
 * Customers are matched automatically on the phone number they message from.
 */

const LINK_CODE_TTL_MINUTES = 15

export interface ResolvedIdentity {
  identityId: string
  principal: AgentPrincipal
}

export type IdentityLookup =
  | { status: "linked"; identity: ResolvedIdentity }
  | { status: "unlinked"; identityId: string | null }
  | { status: "blocked" }

export function generateLinkCode() {
  return randomBytes(3).toString("hex").toUpperCase()
}

/** Issues a code a staff member types into the bot to bind their chat to their account. */
export async function createLinkCode(userId: string, channel = "telegram") {
  const code = generateLinkCode()

  await db.channelIdentity.deleteMany({
    where: { channel, userId, status: "pending" },
  })

  await db.channelIdentity.create({
    data: {
      channel,
      externalId: `pending:${code}`,
      userId,
      linkCode: code,
      linkExpiresAt: new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60 * 1000),
      status: "pending",
    },
  })

  return { code, expiresInMinutes: LINK_CODE_TTL_MINUTES }
}

export async function consumeLinkCode(input: {
  channel: string
  externalId: string
  code: string
  displayName?: string
}): Promise<IdentityLookup> {
  const pending = await db.channelIdentity.findFirst({
    where: {
      channel: input.channel,
      linkCode: input.code.trim().toUpperCase(),
      status: "pending",
    },
  })

  if (!pending || !pending.userId) {
    return { status: "unlinked", identityId: null }
  }

  if (pending.linkExpiresAt && pending.linkExpiresAt.getTime() < Date.now()) {
    await db.channelIdentity.delete({ where: { id: pending.id } })
    return { status: "unlinked", identityId: null }
  }

  const principal = await resolveStaffPrincipal(pending.userId)
  if (!principal) {
    return { status: "blocked" }
  }

  // Reuse any row already sitting on this chat id, then retire the pending one.
  const existing = await db.channelIdentity.findUnique({
    where: { channel_externalId: { channel: input.channel, externalId: input.externalId } },
  })

  const identity = existing
    ? await db.channelIdentity.update({
        where: { id: existing.id },
        data: {
          userId: pending.userId,
          customerId: null,
          displayName: input.displayName || existing.displayName,
          status: "active",
          verifiedAt: new Date(),
          linkCode: null,
          linkExpiresAt: null,
        },
      })
    : await db.channelIdentity.update({
        where: { id: pending.id },
        data: {
          externalId: input.externalId,
          displayName: input.displayName,
          status: "active",
          verifiedAt: new Date(),
          linkCode: null,
          linkExpiresAt: null,
        },
      })

  if (existing) {
    await db.channelIdentity.delete({ where: { id: pending.id } })
  }

  return { status: "linked", identity: { identityId: identity.id, principal } }
}

export async function lookupIdentity(input: {
  channel: string
  externalId: string
  displayName?: string
  /** For phone-based channels, auto-match the number against customer records. */
  phone?: string
}): Promise<IdentityLookup> {
  const existing = await db.channelIdentity.findUnique({
    where: { channel_externalId: { channel: input.channel, externalId: input.externalId } },
  })

  if (existing?.status === "blocked") {
    return { status: "blocked" }
  }

  if (existing?.status === "active") {
    if (existing.userId) {
      const principal = await resolveStaffPrincipal(existing.userId)
      return principal
        ? { status: "linked", identity: { identityId: existing.id, principal } }
        : { status: "blocked" }
    }

    if (existing.customerId) {
      const principal = await resolveCustomerPrincipal(existing.customerId)
      return principal
        ? { status: "linked", identity: { identityId: existing.id, principal } }
        : { status: "blocked" }
    }
  }

  // Phone channels: a known number is enough to identify a trade customer.
  if (input.phone) {
    const customer = await resolveCustomerByPhone(input.phone)

    if (customer) {
      const identity = await db.channelIdentity.upsert({
        where: { channel_externalId: { channel: input.channel, externalId: input.externalId } },
        create: {
          channel: input.channel,
          externalId: input.externalId,
          displayName: input.displayName,
          customerId: customer.id,
          status: "active",
          verifiedAt: new Date(),
        },
        update: {
          customerId: customer.id,
          status: "active",
          verifiedAt: new Date(),
        },
      })

      const principal = await resolveCustomerPrincipal(customer.id)
      if (principal) {
        return { status: "linked", identity: { identityId: identity.id, principal } }
      }
    }
  }

  return { status: "unlinked", identityId: existing?.id ?? null }
}
