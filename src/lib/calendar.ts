import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * One view of what is happening on a date.
 *
 * The dates that matter to a food distributor are scattered across seven
 * tables — a delivery route here, an order's required date there, a batch
 * expiring somewhere else — and nothing brought them together, so "what is
 * happening on Thursday" meant opening seven screens and holding the answer in
 * your head.
 *
 * Nothing new is stored. These are the dates the business already has, read in
 * one place.
 */

export type CalendarKind =
  | "delivery"
  | "order_due"
  | "purchase_arriving"
  | "production"
  | "invoice_due"
  | "batch_expiry"
  | "task"

export interface CalendarEvent {
  id: string
  kind: CalendarKind
  /** Local date key, YYYY-MM-DD, so grouping never crosses a timezone. */
  date: string
  at: Date
  title: string
  detail?: string | null
  status?: string | null
  /** Where clicking it should go. */
  href?: string | null
  /** Something that will hurt if ignored, rather than merely scheduled. */
  urgent?: boolean
}

/** Local, not UTC — an 8pm delivery must not land on tomorrow's column. */
export function dateKey(value: Date): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, "0")
  const d = String(value.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function event(input: Omit<CalendarEvent, "date"> & { at: Date }): CalendarEvent {
  return { ...input, date: dateKey(input.at) }
}

export interface CalendarRange {
  from: Date
  to: Date
  /** Limits each source, so one noisy table cannot crowd out the rest. */
  perKindLimit?: number
}

export async function calendarEvents(
  db: DbClient,
  range: CalendarRange
): Promise<CalendarEvent[]> {
  const { from, to } = range
  const take = range.perKindLimit ?? 200
  const window = { gte: from, lte: to }

  const [routes, orders, purchases, production, invoices, batches, tasks] = await Promise.all([
    db.deliveryRoute.findMany({
      where: { routeDate: window },
      take,
      select: { id: true, routeNumber: true, routeDate: true, status: true, _count: { select: { deliveries: true } } },
    }),
    db.salesOrder.findMany({
      where: { requiredDate: window, status: { notIn: ["cancelled", "delivered", "invoiced"] } },
      take,
      select: { id: true, orderNumber: true, requiredDate: true, status: true, customer: { select: { name: true } } },
    }),
    db.purchaseOrder.findMany({
      where: { expectedDate: window, status: { notIn: ["cancelled", "received"] } },
      take,
      select: { id: true, poNumber: true, expectedDate: true, status: true, supplier: { select: { name: true } } },
    }),
    db.productionOrder.findMany({
      where: { scheduledFor: window },
      take,
      select: { id: true, orderNumber: true, scheduledFor: true, status: true, plannedQty: true },
    }),
    db.invoice.findMany({
      where: { dueDate: window, status: { in: ["unpaid", "partial"] } },
      take,
      select: { id: true, invoiceNumber: true, dueDate: true, status: true, outstandingAmt: true, customer: { select: { name: true } } },
    }),
    db.inventoryBatch.findMany({
      where: { expiryDate: window, quantity: { gt: 0 }, status: { not: "consumed" } },
      take,
      select: { id: true, batchCode: true, expiryDate: true, quantity: true, productId: true },
    }),
    db.crmTask.findMany({
      where: { dueAt: window, status: { not: "completed" } },
      take,
      select: { id: true, title: true, dueAt: true, status: true, priority: true },
    }),
  ])

  // Batches carry a productId with no relation, so names come separately.
  const batchProducts = batches.length
    ? await db.product.findMany({
        where: { id: { in: batches.map((b) => b.productId) } },
        select: { id: true, name: true },
      })
    : []
  const productName = new Map(batchProducts.map((p) => [p.id, p.name]))

  const events: CalendarEvent[] = [
    ...routes.map((r) =>
      event({
        id: `route:${r.id}`,
        kind: "delivery",
        at: r.routeDate,
        title: `Route ${r.routeNumber}`,
        detail: `${r._count.deliveries} stop${r._count.deliveries === 1 ? "" : "s"}`,
        status: r.status,
        href: `/routes`,
      })
    ),
    ...orders.map((o) =>
      event({
        id: `order:${o.id}`,
        kind: "order_due",
        at: o.requiredDate!,
        title: `${o.orderNumber} due`,
        detail: o.customer?.name,
        status: o.status,
        href: `/orders`,
      })
    ),
    ...purchases.map((p) =>
      event({
        id: `po:${p.id}`,
        kind: "purchase_arriving",
        at: p.expectedDate!,
        title: `${p.poNumber} arriving`,
        detail: p.supplier?.name,
        status: p.status,
        href: `/purchase-orders`,
      })
    ),
    ...production.map((p) =>
      event({
        id: `prod:${p.id}`,
        kind: "production",
        at: p.scheduledFor!,
        title: `Run ${p.orderNumber}`,
        detail: `${p.plannedQty} units planned`,
        status: p.status,
        href: `/production`,
      })
    ),
    ...invoices.map((i) =>
      event({
        id: `inv:${i.id}`,
        kind: "invoice_due",
        at: i.dueDate,
        title: `${i.invoiceNumber} due`,
        detail: `${i.customer?.name ?? ""} · $${i.outstandingAmt.toFixed(2)}`.trim(),
        status: i.status,
        href: `/invoices`,
        // Money already owed, not merely scheduled.
        urgent: i.dueDate < new Date(),
      })
    ),
    ...batches.map((b) =>
      event({
        id: `batch:${b.id}`,
        kind: "batch_expiry",
        at: b.expiryDate!,
        title: `${productName.get(b.productId) ?? "Stock"} expires`,
        detail: `Batch ${b.batchCode} · ${b.quantity} on hand`,
        href: `/inventory`,
        // Stock still on hand at its expiry date is money about to be thrown
        // away, which is the whole reason this view is worth having.
        urgent: true,
      })
    ),
    ...tasks.map((t) =>
      event({
        id: `task:${t.id}`,
        kind: "task",
        at: t.dueAt!,
        title: t.title,
        status: t.status,
        href: `/crm`,
        urgent: t.priority === "high" || t.priority === "urgent",
      })
    ),
  ]

  return events.sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** Grouped by day, for a month grid. */
export function groupByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const grouped: Record<string, CalendarEvent[]> = {}

  for (const item of events) {
    ;(grouped[item.date] ??= []).push(item)
  }

  return grouped
}

/** The month grid, padded to whole weeks starting Monday. */
export function monthGrid(year: number, monthIndex: number): Date[] {
  const first = new Date(year, monthIndex, 1)

  // Monday-first: an Australian working week does not start on Sunday.
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, monthIndex, 1 - offset)

  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }

  // Trim a trailing week that belongs entirely to the next month.
  return days.slice(0, days[35].getMonth() === monthIndex ? 42 : 35)
}
