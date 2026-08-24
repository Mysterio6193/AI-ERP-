import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * A customer's history, written by the business rather than by hand.
 *
 * `Activity` was only ever created from CRM actions and CRM agent tools, so a
 * customer's timeline showed what someone had remembered to type and nothing
 * else. The things that actually describe a relationship — orders placed,
 * money paid, a credit hold, a delivery that failed — left no trace, which
 * means opening a customer before a call told you nothing you could not have
 * guessed.
 *
 * Deliberately selective. A row per event is a timeline; a row per state
 * change is a log, and nobody reads a log.
 */

export type TimelineEvent =
  | "order_placed"
  | "order_cancelled"
  | "payment_received"
  | "invoice_raised"
  | "credit_hold"
  | "credit_released"
  | "delivery_failed"

/** What each event is called when a person reads it back. */
const SUBJECT: Record<TimelineEvent, string> = {
  order_placed: "Order placed",
  order_cancelled: "Order cancelled",
  payment_received: "Payment received",
  invoice_raised: "Invoice raised",
  credit_hold: "Put on credit hold",
  credit_released: "Credit hold lifted",
  delivery_failed: "Delivery failed",
}

/**
 * Activity.type is a small set the CRM UI already understands, so business
 * events map onto it rather than inventing kinds the interface cannot render.
 */
const ACTIVITY_TYPE: Record<TimelineEvent, string> = {
  order_placed: "order",
  order_cancelled: "order",
  payment_received: "payment",
  invoice_raised: "invoice",
  credit_hold: "note",
  credit_released: "note",
  delivery_failed: "note",
}

export interface TimelineInput {
  customerId: string | null | undefined
  event: TimelineEvent
  /** The line under the heading. Keep it to what a person needs. */
  detail?: string | null
  userId?: string | null
  /** Set so the entry links back to what caused it. */
  orderId?: string | null
}

/**
 * Record one business event against a customer.
 *
 * Never throws. A timeline entry is worth having and never worth failing an
 * order for — if this breaks, the order should still go through and the gap
 * should be visible in the logs rather than in a customer's checkout.
 */
export async function logCustomerActivity(db: DbClient, input: TimelineInput) {
  if (!input.customerId) {
    return { ok: false as const, reason: "No customer to attribute this to" }
  }

  try {
    const activity = await db.activity.create({
      data: {
        type: ACTIVITY_TYPE[input.event],
        subject: SUBJECT[input.event],
        body: input.detail || null,
        customerId: input.customerId,
        userId: input.userId || null,
        // Agent- and system-written entries are marked, so a person reading
        // the timeline can tell what was automatic and what someone did.
        createdByAgent: true,
      },
      select: { id: true },
    })

    return { ok: true as const, activityId: activity.id }
  } catch (error) {
    console.error(`Could not log ${input.event} for customer ${input.customerId}:`, error)
    return { ok: false as const, reason: "Write failed" }
  }
}

/**
 * The customer's history, newest first.
 *
 * Merges what the business recorded with what people typed, because a
 * salesperson wants one story rather than two lists.
 */
export async function customerTimeline(
  db: DbClient,
  customerId: string,
  limit = 50
) {
  return db.activity.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      subject: true,
      body: true,
      createdAt: true,
      createdByAgent: true,
      user: { select: { id: true, name: true } },
    },
  })
}
