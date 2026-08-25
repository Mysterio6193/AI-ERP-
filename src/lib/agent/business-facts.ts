import { db } from "@/lib/db"
import { remember } from "@/lib/agent/memory"

/**
 * What the business looks like, learned from what it actually does.
 *
 * There are 96 skills and zero memories: the agent knows how to do things and
 * nothing about *this* business. It cannot tell you that one customer orders
 * every Tuesday, that another always pays late, or which product carries the
 * group. Every one of those facts is already implied by the data and none of
 * it was ever written down, so each conversation starts from nothing.
 *
 * Observations, not predictions. Each one states what happened, over what
 * period, so a reader can judge whether it is still true — a fact with no
 * basis is a rumour, and a stale rumour in a prompt is worse than silence.
 */

/** Enough history to mean something, short enough to still be true. */
export const LEARNING_WINDOW_DAYS = 90

/** Below this an "average" is describing coincidence. */
const MIN_ORDERS_FOR_PATTERN = 3

/** The memory categories this layer writes. */
export type FactCategory = "relationship" | "fact"

export interface LearnedFact {
  /** Stable, so learning again corrects rather than duplicates. */
  key: string
  content: string
  category: FactCategory
  /** What it is about, for reporting — the memory row stores `category`. */
  topic: "customer" | "product" | "finance"
  importance: number
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/**
 * Facts about who buys, how much, and how reliably.
 *
 * Ordering rhythm is worth more than raw revenue: knowing a customer orders
 * roughly weekly is what makes "they have not ordered in three weeks" a
 * question worth asking.
 */
export async function learnCustomerFacts(windowDays = LEARNING_WINDOW_DAYS): Promise<LearnedFact[]> {
  const since = new Date(Date.now() - windowDays * 86400000)

  const orders = await db.salesOrder.findMany({
    where: { orderDate: { gte: since }, status: { not: "cancelled" } },
    select: { customerId: true, totalAmount: true, orderDate: true, customer: { select: { name: true } } },
  })

  const byCustomer = new Map<string, { name: string; total: number; dates: Date[] }>()

  for (const order of orders) {
    if (!order.customerId) continue

    const entry = byCustomer.get(order.customerId) ?? {
      name: order.customer?.name ?? "Unknown",
      total: 0,
      dates: [],
    }

    entry.total += order.totalAmount
    entry.dates.push(order.orderDate)
    byCustomer.set(order.customerId, entry)
  }

  const facts: LearnedFact[] = []
  const ranked = [...byCustomer.entries()].sort((a, b) => b[1].total - a[1].total)

  const groupTotal = ranked.reduce((sum, [, c]) => sum + c.total, 0)

  for (const [customerId, customer] of ranked.slice(0, 8)) {
    if (customer.dates.length < MIN_ORDERS_FOR_PATTERN) continue

    const sorted = [...customer.dates].sort((a, b) => a.getTime() - b.getTime())

    // Mean gap between orders. Lumpy ordering makes this approximate, which is
    // why the wording says "roughly".
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000)
    }
    const meanGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0

    const share = groupTotal > 0 ? (customer.total / groupTotal) * 100 : 0
    const dayCounts = new Map<number, number>()
    for (const date of sorted) {
      dayCounts.set(date.getDay(), (dayCounts.get(date.getDay()) ?? 0) + 1)
    }
    const [favouriteDay, dayHits] = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]

    const rhythm =
      meanGap > 0
        ? `orders roughly every ${Math.round(meanGap)} day${Math.round(meanGap) === 1 ? "" : "s"}`
        : "ordering rhythm unclear"

    const dayNote =
      favouriteDay !== null && dayHits >= Math.max(2, Math.ceil(sorted.length / 2))
        ? `, usually on a ${WEEKDAYS[favouriteDay]}`
        : ""

    facts.push({
      key: `customer-pattern:${customerId}`,
      category: "relationship",
      topic: "customer",
      importance: share >= 15 ? 5 : 3,
      content:
        `${customer.name}: ${sorted.length} orders totalling ${money(customer.total)} in the last ${windowDays} days ` +
        `(${share.toFixed(0)}% of group revenue). ${rhythm}${dayNote}. ` +
        `Last ordered ${sorted[sorted.length - 1].toISOString().slice(0, 10)}.`,
    })
  }

  return facts
}

/**
 * Which products carry the business.
 *
 * Measured by revenue rather than units: a pallet of cheap flour moving faster
 * than a premium base does not make it the more important line.
 */
export async function learnProductFacts(windowDays = LEARNING_WINDOW_DAYS): Promise<LearnedFact[]> {
  const since = new Date(Date.now() - windowDays * 86400000)

  const lines = await db.salesOrderItem.findMany({
    where: { order: { orderDate: { gte: since }, status: { not: "cancelled" } } },
    select: { productId: true, quantity: true, total: true, product: { select: { name: true, sku: true } } },
  })

  const byProduct = new Map<string, { name: string; sku: string; units: number; revenue: number; lines: number }>()

  for (const line of lines) {
    const entry = byProduct.get(line.productId) ?? {
      name: line.product?.name ?? "Unknown",
      sku: line.product?.sku ?? "",
      units: 0,
      revenue: 0,
      lines: 0,
    }

    entry.units += line.quantity
    entry.revenue += line.total
    entry.lines += 1
    byProduct.set(line.productId, entry)
  }

  const ranked = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue)
  const totalRevenue = ranked.reduce((sum, [, p]) => sum + p.revenue, 0)

  return ranked.slice(0, 6).map(([productId, product]) => ({
    key: `product-demand:${productId}`,
    category: "fact",
    topic: "product",
    importance: 3,
    content:
      `${product.name} (${product.sku}): ${product.units} unit${product.units === 1 ? "" : "s"} ` +
      `across ${product.lines} order line${product.lines === 1 ? "" : "s"} ` +
      `in the last ${windowDays} days, ${money(product.revenue)} ` +
      `(${totalRevenue > 0 ? ((product.revenue / totalRevenue) * 100).toFixed(0) : 0}% of revenue).`,
  }))
}

/**
 * Who pays, and who does not.
 *
 * The most useful thing to know before ringing someone, and the fact most
 * likely to be held in one person's head rather than written down.
 */
export async function learnPaymentFacts(windowDays = LEARNING_WINDOW_DAYS): Promise<LearnedFact[]> {
  const since = new Date(Date.now() - windowDays * 86400000)

  const invoices = await db.invoice.findMany({
    where: { createdAt: { gte: since } },
    select: {
      customerId: true, dueDate: true, status: true, outstandingAmt: true, totalAmount: true,
      customer: { select: { name: true } },
    },
  })

  const byCustomer = new Map<string, { name: string; count: number; overdue: number; owed: number }>()
  const now = new Date()

  for (const invoice of invoices) {
    if (!invoice.customerId) continue

    const entry = byCustomer.get(invoice.customerId) ?? {
      name: invoice.customer?.name ?? "Unknown",
      count: 0,
      overdue: 0,
      owed: 0,
    }

    entry.count += 1

    const unpaid = invoice.status === "unpaid" || invoice.status === "partial"
    if (unpaid && invoice.dueDate < now) {
      entry.overdue += 1
      entry.owed += invoice.outstandingAmt
    }

    byCustomer.set(invoice.customerId, entry)
  }

  const facts: LearnedFact[] = []

  for (const [customerId, customer] of byCustomer) {
    if (customer.count < 2) continue

    // Only worth recording when there is a pattern either way: "one late
    // invoice" is an event, not a characteristic.
    const lateRate = (customer.overdue / customer.count) * 100

    if (customer.overdue === 0 && customer.count >= 3) {
      facts.push({
        key: `payment-behaviour:${customerId}`,
        category: "relationship",
        topic: "finance",
        importance: 2,
        content: `${customer.name} has paid all ${customer.count} invoices in the last ${windowDays} days on time.`,
      })
      continue
    }

    if (lateRate >= 50) {
      facts.push({
        key: `payment-behaviour:${customerId}`,
        category: "relationship",
        topic: "finance",
        importance: 5,
        content:
          `${customer.name} is late on ${customer.overdue} of ${customer.count} invoices ` +
          `in the last ${windowDays} days, ${money(customer.owed)} currently overdue. Check the account before promising delivery.`,
      })
    }
  }

  return facts
}

export interface LearningResult {
  learned: number
  facts: LearnedFact[]
  windowDays: number
}

/**
 * Look at the business and write down what is true.
 *
 * Every fact carries a stable key, so running this weekly corrects what has
 * changed instead of stacking near-duplicates that all get injected into the
 * prompt together.
 */
export async function learnBusinessFacts(options?: {
  windowDays?: number
  companyId?: string | null
  dryRun?: boolean
}): Promise<LearningResult> {
  const windowDays = options?.windowDays ?? LEARNING_WINDOW_DAYS

  const facts = [
    ...(await learnCustomerFacts(windowDays)),
    ...(await learnProductFacts(windowDays)),
    ...(await learnPaymentFacts(windowDays)),
  ]

  if (options?.dryRun) {
    return { learned: 0, facts, windowDays }
  }

  let learned = 0

  for (const fact of facts) {
    const result = await remember({
      // Company scope: these describe the business, not one person's
      // preferences, and every staff member benefits from the same picture.
      scope: "company",
      companyId: options?.companyId ?? null,
      key: fact.key,
      content: fact.content,
      category: fact.category,
      importance: fact.importance,
      source: "observed",
    })

    if (result.ok) learned += 1
  }

  return { learned, facts, windowDays }
}
