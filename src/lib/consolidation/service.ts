import { db } from "@/lib/db"
import { findRate } from "@/lib/currency/rates"
import {
  consolidate,
  contributionShares,
  type EntityFigures,
  type IntercompanyEntry,
  type RateResolver,
} from "@/lib/consolidation/rollup"

/**
 * The group's figures, against the database.
 *
 * The arithmetic is in `rollup.ts`. This file gathers each entity's numbers,
 * works out which sales were internal to the group, and builds the rate
 * resolver the rollup calls.
 *
 * One query per entity would be the obvious shape and is wrong at group scale:
 * ten entities would mean forty round trips. Each figure is one grouped query
 * across every entity instead.
 */

/** Statuses that represent a sale that actually happened. */
const REAL_ORDER_STATUSES = ["confirmed", "picking", "packed", "dispatched", "delivered", "completed"]

export interface ConsolidationOptions {
  from?: Date
  to?: Date
  presentationCurrency?: string
  eliminateIntercompany?: boolean
}

/**
 * Builds a rate resolver over every rate the group can see.
 *
 * Loaded once and closed over, rather than queried per entity: the rollup asks
 * for a rate per entity and per elimination, and a database round trip inside
 * that loop is how a report that should take a moment takes a minute.
 */
async function buildRateResolver(presentation: string): Promise<RateResolver> {
  const rows = await db.exchangeRate.findMany({
    select: { fromCode: true, toCode: true, rate: true, effectiveFrom: true },
    orderBy: { effectiveFrom: "desc" },
    take: 5_000,
  })

  const rates = rows.map((row) => ({
    from: row.fromCode,
    to: row.toCode,
    rate: row.rate,
    effectiveFrom: row.effectiveFrom,
  }))

  const now = new Date()

  return (from, to) => {
    const found = findRate(from, to, now, rates, presentation)
    return found.ok ? found.rate : null
  }
}

/**
 * Each entity's figures, in its own currency.
 *
 * Revenue is taken from orders rather than invoices so an entity that has
 * dispatched but not yet invoiced is not reported as having sold nothing.
 * `baseTotal` is deliberately not used here: it is already translated into
 * that entity's base currency, which is exactly what the rollup expects.
 */
async function gatherEntityFigures(options: ConsolidationOptions): Promise<EntityFigures[]> {
  const companies = await db.company.findMany({
    select: { id: true, name: true, tradingName: true, baseCurrency: true },
    orderBy: { createdAt: "asc" },
  })

  if (!companies.length) return []

  const dateFilter =
    options.from || options.to
      ? { orderDate: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
      : {}

  const [orders, invoices, payables, inventory, cogs] = await Promise.all([
    db.salesOrder.groupBy({
      by: ["companyId"],
      where: { status: { in: REAL_ORDER_STATUSES }, ...dateFilter },
      _sum: { baseTotal: true },
      _count: { _all: true },
    }),
    db.invoice.groupBy({
      by: ["companyId"],
      where: { status: { notIn: ["paid", "cancelled", "void"] } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    db.purchaseOrder.groupBy({
      by: ["companyId"],
      where: { status: { in: ["received", "partial", "ordered"] } },
      _sum: { totalAmount: true },
    }),
    db.inventory.findMany({
      select: {
        quantity: true,
        avgCost: true,
        warehouse: { select: { companyId: true } },
      },
    }),
    // Cost of goods actually sold, from the movement ledger. Stock on hand is
    // a different number entirely: using it as cost of sales gave a group
    // gross profit of minus one and a half million against revenue of forty
    // thousand, which is not a figure anyone can act on.
    db.stockMovement.findMany({
      where: {
        type: "out",
        referenceType: "sales_order",
        ...(options.from || options.to
          ? {
              createdAt: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
      },
      select: { totalCost: true, warehouse: { select: { companyId: true } } },
    }),
  ])

  const sumBy = <T>(rows: T[], key: (row: T) => string | null, value: (row: T) => number) => {
    const map = new Map<string, number>()
    for (const row of rows) {
      const id = key(row)
      if (!id) continue
      map.set(id, (map.get(id) ?? 0) + value(row))
    }
    return map
  }

  const revenue = new Map(orders.map((row) => [row.companyId ?? "", row._sum.baseTotal ?? 0]))
  const orderCounts = new Map(orders.map((row) => [row.companyId ?? "", row._count._all]))
  const receivable = new Map(
    invoices.map((row) => [
      row.companyId ?? "",
      (row._sum.totalAmount ?? 0) - (row._sum.paidAmount ?? 0),
    ])
  )
  const payable = new Map(payables.map((row) => [row.companyId ?? "", row._sum.totalAmount ?? 0]))
  const stock = sumBy(
    inventory,
    (row) => row.warehouse?.companyId ?? null,
    (row) => row.quantity * row.avgCost
  )
  const costOfSales = sumBy(
    cogs,
    (row) => row.warehouse?.companyId ?? null,
    (row) => row.totalCost ?? 0
  )

  return companies.map((company) => ({
    companyId: company.id,
    name: company.tradingName || company.name,
    currency: (company.baseCurrency || "AUD").toUpperCase(),
    revenue: revenue.get(company.id) ?? 0,
    cost: costOfSales.get(company.id) ?? 0,
    receivable: receivable.get(company.id) ?? 0,
    payable: payable.get(company.id) ?? 0,
    inventoryValue: stock.get(company.id) ?? 0,
    orderCount: orderCounts.get(company.id) ?? 0,
  }))
}

/**
 * Sales from one group entity to another.
 *
 * Found through `Customer.groupEntityId`, which someone has set explicitly.
 * Inferring it from a matching name or ABN would be the kind of guess that
 * removes a real customer's revenue from the group accounts when it guesses
 * wrong, and nobody would notice which direction it erred in.
 */
async function gatherIntercompany(options: ConsolidationOptions): Promise<IntercompanyEntry[]> {
  const dateFilter =
    options.from || options.to
      ? { orderDate: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
      : {}

  const orders = await db.salesOrder.findMany({
    where: {
      status: { in: REAL_ORDER_STATUSES },
      customer: { groupEntityId: { not: null } },
      ...dateFilter,
    },
    select: {
      orderNumber: true,
      companyId: true,
      baseTotal: true,
      customer: { select: { groupEntityId: true } },
    },
    take: 5_000,
  })

  const companies = await db.company.findMany({ select: { id: true, baseCurrency: true } })
  const currencyOf = new Map(companies.map((row) => [row.id, (row.baseCurrency || "AUD").toUpperCase()]))

  return orders
    .filter((order) => order.companyId && order.customer.groupEntityId)
    .map((order) => ({
      sellerCompanyId: order.companyId as string,
      buyerCompanyId: order.customer.groupEntityId as string,
      // baseTotal is in the selling entity's own currency, which is the
      // currency the rollup will translate from.
      amount: order.baseTotal,
      currency: currencyOf.get(order.companyId as string) ?? "AUD",
      reference: order.orderNumber,
    }))
}

/**
 * The group, consolidated.
 *
 * Presentation currency defaults to the first entity's, which is the one the
 * business thinks in. Any configured currency can be asked for instead.
 */
export async function consolidatedGroup(options: ConsolidationOptions = {}) {
  const first = await db.company.findFirst({
    orderBy: { createdAt: "asc" },
    select: { baseCurrency: true },
  })

  const presentation = (options.presentationCurrency || first?.baseCurrency || "AUD").toUpperCase()

  const [entities, intercompany, rateFor] = await Promise.all([
    gatherEntityFigures(options),
    gatherIntercompany(options),
    buildRateResolver(presentation),
  ])

  const result = consolidate(entities, presentation, rateFor, intercompany, {
    eliminateIntercompany: options.eliminateIntercompany,
  })

  return {
    ...result,
    shares: contributionShares(result),
    period: { from: options.from ?? null, to: options.to ?? null },
  }
}

/**
 * Customer records that look like they might be group entities.
 *
 * Offered as a suggestion for a person to confirm, never applied. The match is
 * on ABN where both have one, otherwise on an exact name — good enough to
 * surface a candidate, nowhere near good enough to change the accounts on.
 */
export async function suggestGroupEntityLinks() {
  const [companies, customers] = await Promise.all([
    db.company.findMany({ select: { id: true, name: true, tradingName: true, abn: true } }),
    db.customer.findMany({
      where: { groupEntityId: null },
      select: { id: true, name: true, abn: true, companyId: true },
      take: 2_000,
    }),
  ])

  const suggestions: Array<{
    customerId: string
    customerName: string
    companyId: string
    companyName: string
    matchedOn: "abn" | "name"
  }> = []

  for (const customer of customers) {
    for (const company of companies) {
      // A customer record owned by an entity cannot be that same entity.
      if (customer.companyId === company.id) continue

      const byAbn = !!customer.abn && !!company.abn && customer.abn === company.abn
      const byName =
        customer.name.trim().toLowerCase() === (company.tradingName || company.name).trim().toLowerCase()

      if (byAbn || byName) {
        suggestions.push({
          customerId: customer.id,
          customerName: customer.name,
          companyId: company.id,
          companyName: company.tradingName || company.name,
          matchedOn: byAbn ? "abn" : "name",
        })
        break
      }
    }
  }

  return suggestions
}

/** Marks a customer record as being a group entity, or clears the mark. */
export async function linkCustomerToEntity(customerId: string, companyId: string | null) {
  if (companyId) {
    const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true } })
    if (!company) {
      return { ok: false as const, error: "That entity does not exist" }
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { companyId: true },
    })

    if (customer?.companyId === companyId) {
      return {
        ok: false as const,
        error: "An entity's own customer record cannot be marked as that entity",
      }
    }
  }

  await db.customer.update({ where: { id: customerId }, data: { groupEntityId: companyId } })

  return { ok: true as const }
}
