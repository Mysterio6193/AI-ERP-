import type { SubscriptionStatus } from "./entitlements"

/**
 * Turning a Stripe event into an intent.
 *
 * Pure on purpose. Webhook handling is the part of billing that is hardest to
 * exercise for real — it needs Stripe to send something — so the decision of
 * "what does this event mean" is separated from the act of writing it down.
 * Every branch below is then testable from a fixture with no network and no
 * Stripe account.
 *
 * The important one is the first: a subscription checkout and an invoice
 * payment arrive as the *same* event type, `checkout.session.completed`, and
 * are told apart only by `mode`. Letting a subscription fall through to the
 * invoice path would have it hunt for an order that does not exist.
 */

export type SubscriptionIntent =
  | {
      kind: "subscription_started"
      companyId: string
      planCode: string
      stripeCustomerId: string | null
      stripeSubscriptionId: string | null
      interval: "monthly" | "yearly"
      eventId: string
    }
  | {
      kind: "subscription_updated"
      stripeSubscriptionId: string
      status: SubscriptionStatus
      currentPeriodEnd: Date | null
      cancelAtPeriodEnd: boolean
      eventId: string
    }
  | {
      kind: "subscription_cancelled"
      stripeSubscriptionId: string
      eventId: string
    }
  | {
      kind: "payment_failed"
      stripeSubscriptionId: string
      eventId: string
    }
  /** Not ours — the caller should fall through to its other handlers. */
  | { kind: "not_subscription" }
  /** Ours, but nothing to do. Acknowledge so Stripe stops resending. */
  | { kind: "ignored"; reason: string }

export interface StripeEventLike {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

/**
 * Stripe's subscription statuses are not ours.
 *
 * `incomplete` and `unpaid` both mean "we have not been paid", which is what
 * past_due already covers; mapping them to their own states would multiply the
 * cases every screen has to understand for no behavioural difference.
 */
export function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing"
    case "active":
      return "active"
    case "past_due":
    case "incomplete":
    case "unpaid":
      return "past_due"
    case "canceled":
    case "incomplete_expired":
      return "cancelled"
    default:
      return "expired"
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

/** Stripe sends seconds; everything here works in Date. */
function fromUnix(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null
}

export function interpretStripeEvent(event: StripeEventLike): SubscriptionIntent {
  const object = event.data.object

  if (event.type === "checkout.session.completed") {
    // The discriminator. An invoice payment is mode "payment"; only mode
    // "subscription" belongs to us.
    if (object.mode !== "subscription") {
      return { kind: "not_subscription" }
    }

    const metadata = (object.metadata ?? {}) as Record<string, string>

    if (!metadata.companyId || !metadata.planCode) {
      // Without both we cannot say who bought what. Surfaced rather than
      // guessed — a subscription attached to the wrong company is worse than
      // one that failed loudly.
      return {
        kind: "ignored",
        reason: "subscription checkout has no companyId/planCode metadata",
      }
    }

    return {
      kind: "subscription_started",
      companyId: metadata.companyId,
      planCode: metadata.planCode,
      stripeCustomerId: asString(object.customer),
      stripeSubscriptionId: asString(object.subscription),
      interval: metadata.interval === "yearly" ? "yearly" : "monthly",
      eventId: event.id,
    }
  }

  if (event.type === "customer.subscription.updated") {
    const id = asString(object.id)
    if (!id) return { kind: "ignored", reason: "subscription update with no id" }

    return {
      kind: "subscription_updated",
      stripeSubscriptionId: id,
      status: mapStripeStatus(String(object.status ?? "")),
      currentPeriodEnd: fromUnix(object.current_period_end),
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
      eventId: event.id,
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const id = asString(object.id)
    if (!id) return { kind: "ignored", reason: "subscription delete with no id" }

    return { kind: "subscription_cancelled", stripeSubscriptionId: id, eventId: event.id }
  }

  if (event.type === "invoice.payment_failed") {
    const id = asString(object.subscription)
    // An invoice can fail without belonging to a subscription — a one-off
    // charge — and that is not this handler's problem.
    if (!id) return { kind: "not_subscription" }

    return { kind: "payment_failed", stripeSubscriptionId: id, eventId: event.id }
  }

  return { kind: "not_subscription" }
}
