import type { Prisma, PrismaClient } from "@prisma/client"

import { ensureDeliveryForOrder } from "@/lib/delivery-routes"
import { commitStockForOrder, ensureInvoiceForOrder } from "@/lib/order-fulfillment"
import { ensurePickListForOrder } from "@/lib/pick-lists"
import { releaseReservationsForOrder, reserveStockForOrder } from "@/lib/reservations"
import { getSettings } from "@/lib/settings/service"
import { logCustomerActivity } from "@/lib/customer-timeline"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Moving an order through its lifecycle.
 *
 * The status change was never the point — the side effects are. Dispatch takes
 * stock off the shelf, delivery raises the invoice, approval reserves the
 * goods, cancellation gives them back. The order PUT handler does all of that;
 * the agent's `updateOrderStatus` did a bare `salesOrder.update`, so an agent
 * moving an order to "dispatched" wrote a word and nothing else: stock never
 * left, no invoice existed, and the reservation stayed held forever.
 *
 * One implementation, used by both, so there is no second definition of what a
 * status means.
 */

export const ORDER_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "picking",
  "packed",
  "dispatched",
  "delivered",
  "invoiced",
  "cancelled",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * Which moves make physical sense.
 *
 * Derived from what the side effects assume rather than from a diagram: an
 * order cannot be delivered before it is dispatched, because dispatch is what
 * takes the stock off the shelf. Cancellation is reachable from anything that
 * has not shipped — once goods are on a truck, the answer is a return, not a
 * cancellation.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["pending_approval", "approved", "cancelled"],
  pending_approval: ["approved", "draft", "cancelled"],
  approved: ["picking", "packed", "dispatched", "cancelled"],
  picking: ["packed", "dispatched", "cancelled"],
  packed: ["dispatched", "cancelled"],
  dispatched: ["delivered", "invoiced"],
  delivered: ["invoiced"],
  invoiced: [],
  cancelled: [],
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

export interface TransitionCheck {
  allowed: boolean
  reason?: string
}

/**
 * Whether a move is legal. Pure.
 *
 * Staying put is always allowed — a re-sent status is a retry, not an illegal
 * move, and every side effect below is idempotent.
 */
export function checkTransition(from: string, to: string): TransitionCheck {
  if (from === to) {
    return { allowed: true }
  }

  if (!isOrderStatus(to)) {
    return { allowed: false, reason: `"${to}" is not an order status.` }
  }

  if (!isOrderStatus(from)) {
    // An order already sitting in an unknown status is stuck otherwise, and
    // refusing to move it would make that permanent.
    return { allowed: true }
  }

  if (!ORDER_TRANSITIONS[from].includes(to)) {
    const options = ORDER_TRANSITIONS[from]
    return {
      allowed: false,
      reason: options.length
        ? `An order cannot go from ${from} to ${to}. From ${from} it can go to: ${options.join(", ")}.`
        : `${from} is a final status; an order cannot move on from it.`,
    }
  }

  return { allowed: true }
}

export interface ApplyStatusResult {
  ok: boolean
  status: string
  previous: string
  error?: string
  /** What the move actually did, so a caller can report it. */
  effects: string[]
}

/**
 * Apply a status change and everything that goes with it.
 *
 * Whether an illegal move is refused or merely recorded comes from the
 * `ops.enforceOrderTransitions` setting, which an explicit `enforce` option
 * overrides. It defaults to logging, because a transition map derived from
 * reading code will be wrong somewhere, and turning it into hard refusals on
 * day one would break real flows before anyone had seen what it rejects.
 */
export async function applyOrderStatus(
  db: DbClient,
  orderId: string,
  next: string,
  options?: { userId?: string | null; note?: string; enforce?: boolean }
): Promise<ApplyStatusResult> {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true, companyId: true },
  })

  if (!order) {
    return { ok: false, status: next, previous: "", error: "Order not found", effects: [] }
  }

  const check = checkTransition(order.status, next)

  // The caller's explicit choice wins; otherwise the business setting decides.
  // Without this the flag was a function argument nobody could reach, so the
  // safety it provides could never actually be switched on by anyone
  // operating the system.
  const enforce =
    options?.enforce ??
    (await getSettings("ops", { companyId: order.companyId })).enforceOrderTransitions

  if (!check.allowed) {
    if (enforce) {
      return { ok: false, status: order.status, previous: order.status, error: check.reason, effects: [] }
    }

    // Logged rather than refused, so the moves a real business actually makes
    // become visible before anything starts rejecting them.
    console.warn(
      `[ORDER STATUS] ${order.orderNumber}: ${check.reason} Allowed anyway — transition enforcement is off.`
    )

    await db.auditLog
      .create({
        data: {
          entityType: "sales_order_transition",
          entityId: orderId,
          action: "illegal_transition",
          userId: options?.userId || null,
          oldValues: JSON.stringify({ status: order.status }),
          newValues: JSON.stringify({ status: next, reason: check.reason }),
        },
      })
      .catch(() => undefined)
  }

  const effects: string[] = []

  await db.salesOrder.update({
    where: { id: orderId },
    data: {
      status: next,
      statusLogs: {
        create: {
          status: next,
          userId: options?.userId || null,
          notes: options?.note || `Status changed from ${order.status} to ${next}`,
        },
      },
    },
  })

  // Goods leave the building at dispatch, so stock comes off there. Also fires
  // for delivered and invoiced because an order can jump straight to those;
  // commitStockForOrder is idempotent, so the first one wins.
  if (["dispatched", "delivered", "invoiced"].includes(next)) {
    const committed = await commitStockForOrder(db, orderId, { userId: options?.userId })
    if (committed.ok && !committed.skipped) effects.push("stock committed")
  }

  if (["invoiced", "delivered"].includes(next)) {
    const invoice = await ensureInvoiceForOrder(db, orderId)
    if (invoice) effects.push("invoice raised")
  }

  if (["approved", "picking", "packed", "dispatched", "delivered", "invoiced"].includes(next)) {
    await ensurePickListForOrder(db, orderId)
    const reserved = await reserveStockForOrder(db, orderId)
    if (!reserved.skipped) effects.push("stock reserved")
  }

  if (["packed", "dispatched", "delivered"].includes(next)) {
    await ensureDeliveryForOrder(db, orderId)
    effects.push("delivery scheduled")
  }

  if (next === "cancelled") {
    const cancelled = await db.salesOrder.findUnique({
      where: { id: orderId },
      select: { customerId: true, orderNumber: true, totalAmount: true },
    })

    await logCustomerActivity(db, {
      customerId: cancelled?.customerId,
      event: "order_cancelled",
      detail: cancelled ? `${cancelled.orderNumber} — $${cancelled.totalAmount.toFixed(2)}` : null,
      userId: options?.userId,
      orderId,
    })

    await db.pickList.updateMany({ where: { orderId }, data: { status: "cancelled" } })
    await db.delivery.updateMany({ where: { orderId }, data: { status: "failed" } })
    await releaseReservationsForOrder(db, orderId)
    effects.push("reservations released")
  }

  return { ok: true, status: next, previous: order.status, effects }
}
