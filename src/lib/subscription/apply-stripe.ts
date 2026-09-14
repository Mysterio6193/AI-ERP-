import { db } from "@/lib/db"

import { recordEvent, setSubscription } from "./service"
import type { SubscriptionIntent } from "./stripe-events"

/**
 * Writing down what a Stripe event meant.
 *
 * The deciding happens in ./stripe-events.ts, which is pure; this only
 * persists. Every path is idempotent on the Stripe event id, because Stripe
 * redelivers on any non-2xx and a webhook that doubles a customer's history on
 * a retry is worse than one that misses.
 *
 * Nothing here throws for an unknown subscription. Stripe will happily send
 * events for subscriptions created before this install existed, or for a
 * company since deleted; those are acknowledged and dropped, because failing
 * makes Stripe retry for days over something that will never succeed.
 */

export type ApplyOutcome =
  | { applied: true; action: string }
  | { applied: false; reason: string }

export async function applySubscriptionIntent(
  intent: SubscriptionIntent
): Promise<ApplyOutcome> {
  if (intent.kind === "not_subscription") {
    return { applied: false, reason: "not a subscription event" }
  }

  if (intent.kind === "ignored") {
    return { applied: false, reason: intent.reason }
  }

  // One guard for every path: a redelivered event must change nothing.
  const seen = await db.subscriptionEvent.findUnique({
    where: { externalEventId: intent.eventId },
    select: { id: true },
  })

  if (seen) {
    return { applied: false, reason: "already handled" }
  }

  if (intent.kind === "subscription_started") {
    const plan = await db.plan.findUnique({
      where: { code: intent.planCode },
      select: { id: true, code: true, trialDays: true, includedSeats: true },
    })

    if (!plan) {
      console.error(
        `Stripe event ${intent.eventId} names plan "${intent.planCode}", which this install does not have`
      )
      return { applied: false, reason: `unknown plan "${intent.planCode}"` }
    }

    const company = await db.company.findUnique({
      where: { id: intent.companyId },
      select: { id: true },
    })

    if (!company) {
      console.error(`Stripe event ${intent.eventId} names unknown company ${intent.companyId}`)
      return { applied: false, reason: "unknown company" }
    }

    const periodDays = intent.interval === "yearly" ? 365 : 30

    const result = await setSubscription({
      companyId: intent.companyId,
      planId: plan.id,
      status: plan.trialDays > 0 ? "trialing" : "active",
      source: "stripe",
      interval: intent.interval,
      seats: plan.includedSeats ?? 1,
      trialEndsAt:
        plan.trialDays > 0 ? new Date(Date.now() + plan.trialDays * 86_400_000) : null,
      currentPeriodEnd: new Date(
        Date.now() + (plan.trialDays > 0 ? plan.trialDays : periodDays) * 86_400_000
      ),
      stripeCustomerId: intent.stripeCustomerId,
      stripeSubscriptionId: intent.stripeSubscriptionId,
      detail: `stripe checkout ${intent.eventId}`,
    })

    if (!result.ok) {
      return { applied: false, reason: result.error }
    }

    await recordEvent({
      subscriptionId: result.subscription.id,
      type: "created",
      toPlanCode: plan.code,
      toStatus: result.subscription.status,
      detail: "stripe checkout completed",
      externalEventId: intent.eventId,
    })

    return { applied: true, action: `started on ${plan.code}` }
  }

  // The remaining paths all identify the subscription by its Stripe id.
  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: intent.stripeSubscriptionId },
    include: { plan: { select: { code: true } } },
  })

  if (!subscription) {
    // Not an error: Stripe knows about subscriptions this install does not.
    return { applied: false, reason: "no local subscription for that Stripe id" }
  }

  if (intent.kind === "subscription_updated") {
    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: intent.status,
        currentPeriodEnd: intent.currentPeriodEnd,
        cancelAtPeriodEnd: intent.cancelAtPeriodEnd,
      },
    })

    await recordEvent({
      subscriptionId: subscription.id,
      type: intent.status === "past_due" ? "payment_failed" : "renewed",
      fromStatus: subscription.status,
      toStatus: updated.status,
      detail: intent.cancelAtPeriodEnd ? "will not renew" : "updated from Stripe",
      externalEventId: intent.eventId,
    })

    return { applied: true, action: `status ${subscription.status} → ${updated.status}` }
  }

  if (intent.kind === "subscription_cancelled") {
    await db.subscription.update({
      where: { id: subscription.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    })

    await recordEvent({
      subscriptionId: subscription.id,
      type: "cancelled",
      fromStatus: subscription.status,
      toStatus: "cancelled",
      detail: "cancelled at Stripe",
      externalEventId: intent.eventId,
    })

    return { applied: true, action: "cancelled" }
  }

  // payment_failed. The status change itself arrives separately as an update;
  // this only records that a charge was refused, so the grace window is
  // explainable from the audit trail rather than inferred.
  await recordEvent({
    subscriptionId: subscription.id,
    type: "payment_failed",
    fromStatus: subscription.status,
    toStatus: subscription.status,
    detail: "invoice payment failed at Stripe",
    externalEventId: intent.eventId,
  })

  return { applied: true, action: "payment failure recorded" }
}
