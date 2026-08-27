import { db } from "@/lib/db"

/**
 * What a customer actually owes us, including work in progress.
 *
 * `Customer.creditBalance` only moves when an invoice is created — at delivery
 * or later. Every credit check read that field alone, so orders that were
 * placed, approved, picked, packed and dispatched contributed nothing to the
 * exposure they were being checked against. A customer could place unlimited
 * orders against a limit as long as none had been delivered yet.
 *
 * Real exposure is invoiced debt **plus** the value of orders in flight.
 */

/** Orders that represent a real commitment but have not been invoiced yet. */
const OPEN_ORDER_STATUSES = [
  "pending_approval",
  "approved",
  "picking",
  "packed",
  "dispatched",
]

export interface CreditExposure {
  /** Invoiced and unpaid. */
  invoiced: number
  /** Placed but not yet invoiced. */
  openOrders: number
  /** invoiced + openOrders. */
  total: number
  limit: number
  available: number
  status: string
  /** True when the limit is zero or unset, meaning no limit is enforced. */
  unlimited: boolean
}

function round(value: number) {
  return Number(value.toFixed(2))
}

export async function getCreditExposure(customerId: string): Promise<CreditExposure | null> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { creditBalance: true, creditLimit: true, creditStatus: true },
  })

  if (!customer) {
    return null
  }

  // Orders not yet invoiced. Invoiced ones are already in creditBalance, so
  // counting them here would double-count the same money.
  const open = await db.salesOrder.aggregate({
    where: {
      customerId,
      status: { in: OPEN_ORDER_STATUSES },
      invoice: { is: null },
    },
    _sum: { totalAmount: true },
  })

  const invoiced = round(customer.creditBalance || 0)
  const openOrders = round(open._sum.totalAmount || 0)
  const total = round(invoiced + openOrders)
  const limit = customer.creditLimit || 0

  return {
    invoiced,
    openOrders,
    total,
    limit,
    available: limit > 0 ? round(Math.max(limit - total, 0)) : Infinity,
    status: customer.creditStatus,
    unlimited: limit <= 0,
  }
}

export interface CreditCheckResult {
  ok: boolean
  reason?: string
  exposure?: CreditExposure
}

/**
 * Whether an order of `orderTotal` can go ahead.
 *
 * Returns a reason rather than throwing, so callers can surface it to whoever
 * is placing the order.
 */
export async function checkCreditForOrder(
  customerId: string,
  orderTotal: number
): Promise<CreditCheckResult> {
  const exposure = await getCreditExposure(customerId)

  if (!exposure) {
    return { ok: false, reason: "Customer not found" }
  }

  return decideCredit(exposure, orderTotal)
}

/**
 * Whether this order fits, given what the customer already owes.
 *
 * Pure, and separated from the lookup because both ways of being wrong are
 * expensive and neither is visible: refusing a good customer costs the order
 * and the relationship, while letting a bad one through costs the money. The
 * order of the checks is the decision — a stopped account is refused before
 * anything about limits is considered, because a stopped account is not a
 * question about headroom.
 */
export function decideCredit(exposure: CreditExposure, orderTotal: number): CreditCheckResult {
  if (exposure.status === "stopped") {
    return { ok: false, reason: "This account is stopped and cannot place orders.", exposure }
  }

  if (exposure.status === "on_hold") {
    return {
      ok: false,
      reason: "This account is on credit hold until the outstanding balance is settled.",
      exposure,
    }
  }

  if (exposure.unlimited) {
    return { ok: true, exposure }
  }

  const projected = round(exposure.total + Number(orderTotal || 0))

  if (projected > exposure.limit) {
    // Naming the two halves matters: "you have no credit left" reads as a
    // dispute when most of it is orders they have not been invoiced for yet.
    const detail =
      exposure.openOrders > 0
        ? ` (${exposure.invoiced.toFixed(2)} invoiced plus ${exposure.openOrders.toFixed(2)} in orders not yet invoiced)`
        : ""

    return {
      ok: false,
      reason: `Credit limit exceeded. Available: $${exposure.available.toFixed(2)}${detail}. Order total: $${Number(orderTotal).toFixed(2)}.`,
      exposure,
    }
  }

  return { ok: true, exposure }
}
