import { analyseCadence, daysBetween } from "@/lib/crm"
import { db } from "@/lib/db"

/**
 * Audience definitions.
 *
 * The agent writes the definition from a plain-English brief; this code decides
 * who is actually in it. That split matters: a model choosing recipients on
 * each run gives a different list every time and cannot be audited, whereas a
 * stored definition evaluated by code is repeatable, explainable, and provable
 * after the fact - which is what you need when someone asks why they received
 * a message.
 *
 * Evaluated in TypeScript over pre-aggregated rows rather than as dynamic SQL:
 * the customer count here is in the thousands at most, and the readability and
 * safety are worth far more than the milliseconds.
 */

export type Comparison = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in"

export interface FieldCondition {
  kind: "field"
  field:
    | "customerType"
    | "industry"
    | "creditStatus"
    | "status"
    | "salesRepId"
    | "paymentTerms"
  op: Comparison
  value: string | number | string[]
}

export interface MetricCondition {
  kind: "metric"
  metric:
    | "daysSinceLastOrder"
    | "orderCount"
    | "totalSpend"
    | "averageOrderValue"
    | "outstandingAmount"
    | "daysAsCustomer"
  op: Comparison
  value: number
}

export interface ProductCondition {
  kind: "product"
  /** bought = has ordered it; never_bought = has not, ever */
  mode: "bought" | "never_bought"
  productId?: string
  sku?: string
  nameContains?: string
  withinDays?: number
}

/** Geography lives on CustomerLocation, so it is matched across an account's sites. */
export interface LocationCondition {
  kind: "location"
  field: "state" | "city" | "postcode"
  op: Comparison
  value: string | string[]
}

export interface FlagCondition {
  kind: "flag"
  flag: "isLapsing" | "hasOverdueInvoice" | "isOnCreditHold"
  value: boolean
}

export type SegmentCondition =
  | FieldCondition
  | MetricCondition
  | ProductCondition
  | LocationCondition
  | FlagCondition

export interface SegmentDefinition {
  /** Every condition must hold. */
  all?: SegmentCondition[]
  /** At least one must hold. */
  any?: SegmentCondition[]
  /** None may hold. */
  none?: SegmentCondition[]
}

export interface SegmentMember {
  customerId: string
  customer: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  daysSinceLastOrder: number | null
  orderCount: number
  totalSpend: number
  averageOrderValue: number
  outstandingAmount: number
  isLapsing: boolean
  /** Plain-English reasons this account matched, for the audit trail. */
  matchedOn: string[]
}

interface CustomerRow {
  id: string
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  industry: string | null
  customerType: string
  creditStatus: string
  status: string
  salesRepId: string | null
  paymentTerms: number
  createdAt: Date
  orders: Array<{
    orderDate: Date
    totalAmount: number
    items: Array<{ productId: string; product: { sku: string; name: string } | null }>
  }>
  invoices: Array<{ outstandingAmt: number; dueDate: Date; status: string }>
  locations: Array<{ state: string; city: string; postcode: string }>
}

function compare(actual: unknown, op: Comparison, expected: unknown): boolean {
  switch (op) {
    case "eq":
      return actual === expected
    case "neq":
      return actual !== expected
    case "gt":
      return Number(actual) > Number(expected)
    case "gte":
      return Number(actual) >= Number(expected)
    case "lt":
      return Number(actual) < Number(expected)
    case "lte":
      return Number(actual) <= Number(expected)
    case "in":
      return Array.isArray(expected) && expected.includes(actual as string)
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual as string)
    default:
      return false
  }
}

function describe(condition: SegmentCondition): string {
  switch (condition.kind) {
    case "field":
      return `${condition.field} ${condition.op} ${JSON.stringify(condition.value)}`
    case "metric":
      return `${condition.metric} ${condition.op} ${condition.value}`
    case "product":
      return `${condition.mode === "bought" ? "bought" : "never bought"} ${
        condition.sku || condition.nameContains || condition.productId
      }${condition.withinDays ? ` within ${condition.withinDays} days` : ""}`
    case "location":
      return `has a site where ${condition.field} ${condition.op} ${JSON.stringify(condition.value)}`
    case "flag":
      return `${condition.flag} = ${condition.value}`
  }
}

interface Aggregates {
  daysSinceLastOrder: number | null
  orderCount: number
  totalSpend: number
  averageOrderValue: number
  outstandingAmount: number
  daysAsCustomer: number
  isLapsing: boolean
  hasOverdueInvoice: boolean
  isOnCreditHold: boolean
}

function aggregate(customer: CustomerRow): Aggregates {
  const orderCount = customer.orders.length
  const totalSpend = customer.orders.reduce((sum, order) => sum + order.totalAmount, 0)
  const lastOrder = customer.orders
    .map((order) => order.orderDate)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  const cadence = analyseCadence(customer.orders)
  const now = new Date()

  return {
    daysSinceLastOrder: lastOrder ? daysBetween(lastOrder) : null,
    orderCount,
    totalSpend: Number(totalSpend.toFixed(2)),
    averageOrderValue: orderCount ? Number((totalSpend / orderCount).toFixed(2)) : 0,
    outstandingAmount: Number(
      customer.invoices.reduce((sum, invoice) => sum + invoice.outstandingAmt, 0).toFixed(2)
    ),
    daysAsCustomer: daysBetween(customer.createdAt),
    isLapsing: Boolean(cadence && cadence.overdueBy > 0),
    hasOverdueInvoice: customer.invoices.some(
      (invoice) => invoice.status !== "paid" && invoice.dueDate.getTime() < now.getTime()
    ),
    isOnCreditHold: customer.creditStatus !== "active",
  }
}

function matchesProduct(customer: CustomerRow, condition: ProductCondition): boolean {
  const cutoff = condition.withinDays
    ? new Date(Date.now() - condition.withinDays * 86400000)
    : null

  const bought = customer.orders.some((order) => {
    if (cutoff && order.orderDate < cutoff) {
      return false
    }

    return order.items.some((item) => {
      if (condition.productId) {
        return item.productId === condition.productId
      }
      if (condition.sku) {
        return item.product?.sku === condition.sku
      }
      if (condition.nameContains) {
        return item.product?.name?.toLowerCase().includes(condition.nameContains.toLowerCase())
      }
      return false
    })
  })

  return condition.mode === "bought" ? bought : !bought
}

function evaluate(
  customer: CustomerRow,
  aggregates: Aggregates,
  condition: SegmentCondition
): boolean {
  switch (condition.kind) {
    case "field":
      return compare(
        (customer as unknown as Record<string, unknown>)[condition.field],
        condition.op,
        condition.value
      )
    case "metric": {
      const actual = aggregates[condition.metric]
      // An account that has never ordered has no "days since last order".
      if (actual === null) {
        return false
      }
      return compare(actual, condition.op, condition.value)
    }
    case "product":
      return matchesProduct(customer, condition)
    case "location":
      // An account matches if any of its sites does.
      return customer.locations.some((location) =>
        compare(location[condition.field], condition.op, condition.value)
      )
    case "flag":
      return aggregates[condition.flag] === condition.value
  }
}

export async function evaluateSegment(
  definition: SegmentDefinition,
  options?: { limit?: number }
): Promise<SegmentMember[]> {
  const customers = (await db.customer.findMany({
    where: { status: { not: "blocked" } },
    select: {
      id: true,
      name: true,
      contactPerson: true,
      email: true,
      phone: true,
      industry: true,
      customerType: true,
      creditStatus: true,
      status: true,
      salesRepId: true,
      paymentTerms: true,
      createdAt: true,
      orders: {
        where: { status: { not: "cancelled" } },
        select: {
          orderDate: true,
          totalAmount: true,
          items: { select: { productId: true, product: { select: { sku: true, name: true } } } },
        },
      },
      invoices: { select: { outstandingAmt: true, dueDate: true, status: true } },
      locations: { select: { state: true, city: true, postcode: true } },
    },
  })) as unknown as CustomerRow[]

  const members: SegmentMember[] = []

  for (const customer of customers) {
    const aggregates = aggregate(customer)
    const matchedOn: string[] = []

    const all = definition.all ?? []
    const any = definition.any ?? []
    const none = definition.none ?? []

    const allPass = all.every((condition) => {
      const passed = evaluate(customer, aggregates, condition)
      if (passed) {
        matchedOn.push(describe(condition))
      }
      return passed
    })

    if (!allPass) {
      continue
    }

    if (any.length) {
      const anyMatch = any.filter((condition) => evaluate(customer, aggregates, condition))
      if (!anyMatch.length) {
        continue
      }
      matchedOn.push(...anyMatch.map(describe))
    }

    if (none.some((condition) => evaluate(customer, aggregates, condition))) {
      continue
    }

    members.push({
      customerId: customer.id,
      customer: customer.name,
      contactPerson: customer.contactPerson,
      email: customer.email,
      phone: customer.phone,
      daysSinceLastOrder: aggregates.daysSinceLastOrder,
      orderCount: aggregates.orderCount,
      totalSpend: aggregates.totalSpend,
      averageOrderValue: aggregates.averageOrderValue,
      outstandingAmount: aggregates.outstandingAmount,
      isLapsing: aggregates.isLapsing,
      matchedOn,
    })
  }

  return members
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, options?.limit ?? members.length)
}

/** Guards against a malformed definition selecting the entire customer base. */
export function validateDefinition(definition: unknown): {
  ok: boolean
  error?: string
  definition?: SegmentDefinition
} {
  if (!definition || typeof definition !== "object") {
    return { ok: false, error: "Definition must be an object" }
  }

  const candidate = definition as SegmentDefinition
  const total =
    (candidate.all?.length ?? 0) + (candidate.any?.length ?? 0) + (candidate.none?.length ?? 0)

  if (total === 0) {
    return {
      ok: false,
      error: "A segment needs at least one condition - an empty definition would select everyone",
    }
  }

  return { ok: true, definition: candidate }
}
