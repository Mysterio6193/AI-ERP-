import { describe, expect, it } from "vitest"

import { interpretStripeEvent, mapStripeStatus, type StripeEventLike } from "./stripe-events"

function event(type: string, object: Record<string, unknown>, id = "evt_1"): StripeEventLike {
  return { id, type, data: { object } }
}

describe("interpretStripeEvent", () => {
  it("tells a subscription checkout apart from an invoice payment", () => {
    // Both arrive as checkout.session.completed. Only `mode` separates them,
    // and routing a subscription into the invoice path would send it hunting
    // for an order that does not exist.
    const invoicePayment = interpretStripeEvent(
      event("checkout.session.completed", { mode: "payment", metadata: { invoiceId: "inv_1" } })
    )
    expect(invoicePayment.kind).toBe("not_subscription")

    const subscription = interpretStripeEvent(
      event("checkout.session.completed", {
        mode: "subscription",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { companyId: "co_1", planCode: "professional", interval: "yearly" },
      })
    )
    expect(subscription.kind).toBe("subscription_started")
    if (subscription.kind !== "subscription_started") return
    expect(subscription.companyId).toBe("co_1")
    expect(subscription.planCode).toBe("professional")
    expect(subscription.interval).toBe("yearly")
    expect(subscription.stripeSubscriptionId).toBe("sub_1")
  })

  it("refuses a subscription checkout that cannot say who bought what", () => {
    const verdict = interpretStripeEvent(
      event("checkout.session.completed", { mode: "subscription", metadata: {} })
    )

    // Attaching it to a guessed company would be worse than failing loudly.
    expect(verdict.kind).toBe("ignored")
  })

  it("defaults an unstated interval to monthly rather than throwing", () => {
    const verdict = interpretStripeEvent(
      event("checkout.session.completed", {
        mode: "subscription",
        metadata: { companyId: "co_1", planCode: "starter" },
      })
    )

    expect(verdict.kind).toBe("subscription_started")
    if (verdict.kind !== "subscription_started") return
    expect(verdict.interval).toBe("monthly")
  })

  it("reads a status change with its period end", () => {
    const at = 1_800_000_000
    const verdict = interpretStripeEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        status: "past_due",
        current_period_end: at,
        cancel_at_period_end: true,
      })
    )

    expect(verdict.kind).toBe("subscription_updated")
    if (verdict.kind !== "subscription_updated") return
    expect(verdict.status).toBe("past_due")
    expect(verdict.cancelAtPeriodEnd).toBe(true)
    // Stripe sends seconds; a raw pass-through would land in 1970.
    expect(verdict.currentPeriodEnd?.getTime()).toBe(at * 1000)
  })

  it("ignores a failed invoice that is not a subscription's", () => {
    expect(
      interpretStripeEvent(event("invoice.payment_failed", { subscription: null })).kind
    ).toBe("not_subscription")

    expect(
      interpretStripeEvent(event("invoice.payment_failed", { subscription: "sub_9" })).kind
    ).toBe("payment_failed")
  })

  it("passes through event types it has no opinion on", () => {
    expect(interpretStripeEvent(event("payout.paid", {})).kind).toBe("not_subscription")
  })

  it("carries the event id so a redelivery can be recognised", () => {
    const verdict = interpretStripeEvent(
      event("customer.subscription.deleted", { id: "sub_1" }, "evt_abc")
    )

    expect(verdict.kind).toBe("subscription_cancelled")
    if (verdict.kind !== "subscription_cancelled") return
    expect(verdict.eventId).toBe("evt_abc")
  })
})

describe("mapStripeStatus", () => {
  it("collapses the several ways Stripe says 'not paid' into one", () => {
    for (const status of ["past_due", "incomplete", "unpaid"]) {
      expect(mapStripeStatus(status)).toBe("past_due")
    }
  })

  it("maps the states that mean something different", () => {
    expect(mapStripeStatus("trialing")).toBe("trialing")
    expect(mapStripeStatus("active")).toBe("active")
    expect(mapStripeStatus("canceled")).toBe("cancelled")
    expect(mapStripeStatus("incomplete_expired")).toBe("cancelled")
  })

  it("falls back to expired for anything unrecognised", () => {
    expect(mapStripeStatus("something_new_stripe_added")).toBe("expired")
  })
})
