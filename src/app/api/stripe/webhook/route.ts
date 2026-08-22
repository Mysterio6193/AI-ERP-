import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { invoiceForOrder, recordPaymentAtomic } from "@/lib/payments"
import { getStripeClient } from "@/lib/stripe"

/**
 * Stripe webhook.
 *
 * Until this existed, `order/stripe/checkout` and `user/invoices/[id]/payment-link`
 * created Checkout Sessions and nothing listened for the result: the customer
 * paid, no `Payment` row was written, the invoice stayed `unpaid`, their credit
 * balance stayed charged, and they were auto-placed on credit hold for money
 * already received.
 *
 * Both existing flows already set the metadata this needs — `orderId` from
 * checkout, `invoiceId` from a payment link — so nothing upstream changes.
 */

export const dynamic = "force-dynamic"
// Stripe signs the raw body; Next must not parse or re-encode it.
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const stripe = getStripeClient()

  if (!stripe) {
    // Not configured is not an error worth retrying.
    return NextResponse.json({ received: true, skipped: "stripe_not_configured" })
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set - refusing to trust an unverified webhook")
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    )
  }

  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event

  try {
    // Raw text, never request.json() - any reserialisation breaks the signature.
    const payload = await request.text()
    event = stripe.webhooks.constructEvent(payload, signature, secret)
  } catch (error) {
    // A bad signature is an attacker or a misconfiguration, never a retry.
    console.error("Stripe signature verification failed:", error)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    if (event.type !== "checkout.session.completed") {
      // Acknowledge everything else so Stripe stops resending it.
      return NextResponse.json({ received: true, ignored: event.type })
    }

    const session = event.data.object as {
      id: string
      payment_status?: string
      amount_total?: number | null
      currency?: string
      metadata?: Record<string, string> | null
      payment_intent?: string | null
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true, skipped: "not_paid" })
    }

    const metadata = session.metadata || {}
    let invoiceId = metadata.invoiceId || null

    // Checkout carries the order; a payment link carries the invoice directly.
    if (!invoiceId && metadata.orderId) {
      const invoice = await invoiceForOrder(metadata.orderId)
      invoiceId = invoice?.id ?? null

      if (!invoice) {
        // The order was paid before it was invoiced. Recorded rather than
        // dropped, so the money is traceable and someone can reconcile it.
        console.error(
          `Stripe session ${session.id} paid for order ${metadata.orderId}, which has no invoice yet`
        )

        await db.communicationLog.create({
          data: {
            method: "system",
            direction: "inbound",
            recipient: "finance",
            subject: "Stripe payment with no invoice",
            message: `Session ${session.id} paid ${(session.amount_total ?? 0) / 100} for order ${metadata.orderId}, which has no invoice.`,
            status: "received",
            externalId: session.id,
          },
        })

        return NextResponse.json({ received: true, unmatched: true })
      }
    }

    if (!invoiceId) {
      console.error(`Stripe session ${session.id} has no invoiceId or orderId in metadata`)
      return NextResponse.json({ received: true, unmatched: true })
    }

    // Stripe amounts are in the smallest currency unit.
    const amount = (session.amount_total ?? 0) / 100

    const result = await recordPaymentAtomic({
      invoiceId,
      amount,
      method: "credit_card",
      // The session id is the idempotency key; Stripe retries on any non-2xx.
      externalId: session.id,
      notes: `Stripe ${session.payment_intent || session.id}`,
    })

    if (!result.ok) {
      console.error(`Stripe payment for session ${session.id} could not be recorded:`, result.error)
      // 200 on purpose: retrying will not fix a business-rule rejection such as
      // an already-paid invoice, and Stripe would retry for days.
      return NextResponse.json({ received: true, error: result.error })
    }

    return NextResponse.json({
      received: true,
      ...("duplicate" in result ? { duplicate: true } : { paymentId: result.paymentId }),
    })
  } catch (error) {
    console.error("Stripe webhook handling failed:", error)
    // 500 so Stripe retries a genuine transient failure.
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
