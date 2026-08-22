import { db } from "@/lib/db"

/**
 * CRM analytics shared by the agent tools and the CRM screens.
 *
 * Kept in one place deliberately: if the agent says an account is lapsing and
 * the dashboard disagrees, nobody trusts either. Both read from here.
 */

export const PIPELINE_STAGES = [
  "prospect",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const

export function daysBetween(from: Date, to = new Date()) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000)
}

function round(value: number) {
  return Number(value.toFixed(2))
}

export interface OrderPoint {
  orderDate: Date
  totalAmount: number
}

export interface Cadence {
  typicalGapDays: number
  daysSinceLastOrder: number
  lastOrderDate: Date
  overdueBy: number
  orderCount: number
  averageOrderValue: number
}

/**
 * Ordering rhythm derived from an account's own history.
 *
 * A trade account settles into a cadence, and the useful signal is deviation
 * from *its own* rhythm rather than an absolute threshold: a café that orders
 * weekly and has been silent for three weeks is in trouble, a restaurant that
 * orders monthly is not. Median rather than mean, so a one-off bulk order does
 * not drag the baseline around.
 */
export function analyseCadence(orders: OrderPoint[]): Cadence | null {
  if (orders.length < 3) {
    return null
  }

  const sorted = [...orders].sort((a, b) => a.orderDate.getTime() - b.orderDate.getTime())
  const gaps: number[] = []

  for (let index = 1; index < sorted.length; index += 1) {
    const gap = daysBetween(sorted[index - 1].orderDate, sorted[index].orderDate)
    if (gap > 0) {
      gaps.push(gap)
    }
  }

  if (!gaps.length) {
    return null
  }

  const ordered = [...gaps].sort((a, b) => a - b)
  const median = ordered[Math.floor(ordered.length / 2)]
  const lastOrder = sorted[sorted.length - 1].orderDate
  const sinceLast = daysBetween(lastOrder)

  return {
    typicalGapDays: median,
    daysSinceLastOrder: sinceLast,
    lastOrderDate: lastOrder,
    // Two full cycles of silence is where this stops being noise.
    overdueBy: Math.max(0, sinceLast - median * 2),
    orderCount: sorted.length,
    averageOrderValue: round(
      sorted.reduce((sum, order) => sum + order.totalAmount, 0) / sorted.length
    ),
  }
}

export interface LapsedAccount {
  customerId: string
  customer: string
  contact: string | null
  phone: string | null
  email: string | null
  salesRepId: string | null
  usualGapDays: number
  daysSinceLastOrder: number
  overdueByDays: number
  averageOrderValue: number
  monthlyValueAtRisk: number
}

export async function findLapsedAccounts(options?: {
  minOrderHistory?: number
  limit?: number
  salesRepId?: string
}): Promise<LapsedAccount[]> {
  const customers = await db.customer.findMany({
    where: {
      status: "active",
      ...(options?.salesRepId ? { salesRepId: options.salesRepId } : {}),
    },
    select: {
      id: true,
      name: true,
      contactPerson: true,
      phone: true,
      email: true,
      salesRepId: true,
      orders: {
        where: { status: { not: "cancelled" } },
        orderBy: { orderDate: "desc" },
        take: 40,
        select: { orderDate: true, totalAmount: true },
      },
    },
  })

  const threshold = options?.minOrderHistory ?? 3

  const lapsed = customers
    .map((customer) => {
      if (customer.orders.length < threshold) {
        return null
      }

      const cadence = analyseCadence(customer.orders)
      if (!cadence || cadence.overdueBy <= 0) {
        return null
      }

      return {
        customerId: customer.id,
        customer: customer.name,
        contact: customer.contactPerson,
        phone: customer.phone,
        email: customer.email,
        salesRepId: customer.salesRepId,
        usualGapDays: cadence.typicalGapDays,
        daysSinceLastOrder: cadence.daysSinceLastOrder,
        overdueByDays: cadence.overdueBy,
        averageOrderValue: cadence.averageOrderValue,
        // What the silence costs per month at their usual rate.
        monthlyValueAtRisk: round((cadence.averageOrderValue * 30) / cadence.typicalGapDays),
      } satisfies LapsedAccount
    })
    .filter(Boolean) as LapsedAccount[]

  return lapsed
    .sort((a, b) => b.monthlyValueAtRisk - a.monthlyValueAtRisk)
    .slice(0, options?.limit ?? 15)
}

export async function summarisePipeline(options?: { ownerId?: string; includeClosed?: boolean }) {
  const opportunities = await db.opportunity.findMany({
    where: {
      ...(options?.ownerId ? { ownerId: options.ownerId } : {}),
      ...(options?.includeClosed ? {} : { stage: { notIn: ["won", "lost"] } }),
    },
    select: {
      id: true,
      name: true,
      stage: true,
      value: true,
      probability: true,
      expectedCloseDate: true,
      customer: { select: { id: true, name: true } },
      owner: { select: { name: true } },
    },
  })

  const byStage = PIPELINE_STAGES.map((stage) => {
    const inStage = opportunities.filter((row) => row.stage === stage)

    return {
      stage,
      count: inStage.length,
      value: round(inStage.reduce((sum, row) => sum + row.value, 0)),
      weighted: round(inStage.reduce((sum, row) => sum + (row.value * row.probability) / 100, 0)),
      opportunities: inStage
        .sort((a, b) => b.value - a.value)
        .map((row) => ({
          id: row.id,
          name: row.name,
          customer: row.customer?.name ?? null,
          customerId: row.customer?.id ?? null,
          value: round(row.value),
          probability: row.probability,
          expectedCloseDate: row.expectedCloseDate,
          owner: row.owner?.name ?? null,
        })),
    }
  })

  return {
    totalCount: opportunities.length,
    totalValue: round(opportunities.reduce((sum, row) => sum + row.value, 0)),
    weightedValue: round(
      opportunities.reduce((sum, row) => sum + (row.value * row.probability) / 100, 0)
    ),
    byStage,
  }
}

export type FocusReason = "task_overdue" | "case_open" | "account_lapsing" | "invoice_overdue"

export interface FocusItem {
  reason: FocusReason
  priority: number
  title: string
  detail: string
  /** Id of the case / task / invoice this points at, so the row can be acted on. */
  entityId: string | null
  customerId: string | null
  customer: string | null
  href: string | null
  value: number | null
}

/**
 * "Who needs attention and why", assembled from the four signals that actually
 * cost money: promised follow-ups that slipped, unhappy customers, accounts
 * going quiet, and money owed. Ordered so the top of the list is the thing
 * worth doing first.
 */
export async function getFocusList(userId?: string, limit = 20): Promise<FocusItem[]> {
  const now = new Date()

  const [tasks, cases, lapsed, invoices] = await Promise.all([
    db.crmTask.findMany({
      where: {
        status: "open",
        dueAt: { lt: now },
        ...(userId ? { assignedToId: userId } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: 15,
      select: { id: true, title: true, dueAt: true, customerId: true, priority: true },
    }),
    db.case.findMany({
      where: { status: { in: ["open", "in_progress"] }, ...(userId ? { assignedToId: userId } : {}) },
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      take: 15,
      select: {
        id: true,
        caseNumber: true,
        subject: true,
        severity: true,
        createdAt: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    findLapsedAccounts({ limit: 10, ...(userId ? { salesRepId: userId } : {}) }),
    db.invoice.findMany({
      where: { status: { not: "paid" }, dueDate: { lt: now } },
      orderBy: { dueDate: "asc" },
      take: 15,
      select: {
        id: true,
        invoiceNumber: true,
        outstandingAmt: true,
        dueDate: true,
        customer: { select: { id: true, name: true } },
      },
    }),
  ])

  const customerIds = tasks.map((task) => task.customerId).filter(Boolean) as string[]
  const names = customerIds.length
    ? await db.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true },
      })
    : []
  const nameById = new Map(names.map((entry) => [entry.id, entry.name]))

  const items: FocusItem[] = [
    ...cases.map((record) => ({
      reason: "case_open" as const,
      priority: record.severity === "high" ? 100 : 60,
      entityId: record.id,
      title: record.subject,
      detail: `${record.caseNumber} · open ${daysBetween(record.createdAt)} days · ${record.severity} severity`,
      customerId: record.customer?.id ?? null,
      customer: record.customer?.name ?? null,
      href: "/crm",
      value: null,
    })),
    ...tasks.map((task) => ({
      reason: "task_overdue" as const,
      priority: task.priority === "high" ? 90 : 55,
      entityId: task.id,
      title: task.title,
      detail: task.dueAt ? `Due ${daysBetween(task.dueAt)} days ago` : "Overdue",
      customerId: task.customerId,
      customer: task.customerId ? nameById.get(task.customerId) ?? null : null,
      href: "/crm",
      value: null,
    })),
    ...lapsed.map((account) => ({
      reason: "account_lapsing" as const,
      priority: 70 + Math.min(account.overdueByDays, 25),
      entityId: account.customerId,
      title: `${account.customer} has gone quiet`,
      detail: `Usually orders every ${account.usualGapDays} days · silent ${account.daysSinceLastOrder} days`,
      customerId: account.customerId,
      customer: account.customer,
      href: "/customers",
      value: account.monthlyValueAtRisk,
    })),
    ...invoices.map((invoice) => ({
      reason: "invoice_overdue" as const,
      priority: 50 + Math.min(daysBetween(invoice.dueDate) / 2, 40),
      entityId: invoice.id,
      title: `${invoice.invoiceNumber} overdue`,
      detail: `${daysBetween(invoice.dueDate)} days past due`,
      customerId: invoice.customer?.id ?? null,
      customer: invoice.customer?.name ?? null,
      href: "/invoices",
      value: round(invoice.outstandingAmt),
    })),
  ]

  return items.sort((a, b) => b.priority - a.priority).slice(0, limit)
}
