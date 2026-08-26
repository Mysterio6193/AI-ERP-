import type { ProviderDefinition } from "./providers"

/**
 * Where a connection lives, which depends on whose it is.
 *
 * A mailbox is one person's: the query is by user, and two colleagues each have
 * their own row. A payment gateway is the business's: the query is by company,
 * everybody shares one row, and the person who set it up leaving must not take
 * the company's ability to bill with them.
 *
 * Kept as a pair of pure functions so the rule is stated once and the routes
 * cannot quietly disagree about it.
 */

export interface ConnectionOwner {
  userId: string
  companyId: string | null
}

export function connectionWhere(provider: ProviderDefinition, owner: ConnectionOwner) {
  if (provider.scope === "company") {
    return { provider: provider.id, scope: "company", companyId: owner.companyId }
  }

  return { provider: provider.id, scope: "user", userId: owner.userId }
}

/**
 * Whether this person may connect or disconnect it.
 *
 * Anyone can connect their own mailbox. Only an admin should be able to change
 * the gateway the whole company bills through, because disconnecting it stops
 * every invoice being payable.
 */
export function canManage(provider: ProviderDefinition, role: string): boolean {
  if (provider.scope === "company") return role === "admin"
  return true
}

/** Said on the card, so nobody wonders whether disconnecting affects colleagues. */
export function describeScope(provider: ProviderDefinition): string {
  return provider.scope === "company"
    ? "Shared by everyone at this company"
    : "Connected to your account only"
}
