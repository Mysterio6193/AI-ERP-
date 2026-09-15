/**
 * What events exist, and which of them are actually raised.
 *
 * A list of names alone repeats the defect this whole feature was built to
 * fix: `trigger: "event"` was offered in the UI, stored, and never fired, so
 * an agent sat looking configured and did nothing. Offering twelve event types
 * when three are wired would let someone build a rule that can never fire and
 * never find out why.
 *
 * So each entry says whether it is `live` — something in the codebase raises
 * it — and the UI says so plainly. `planned` entries stay listed rather than
 * hidden, because the answer to "can I trigger on an overdue invoice yet" is
 * more useful than the question disappearing.
 *
 * The payload paths are the other half. A filter on a path that does not exist
 * is false, never true, so a typo produces an agent that quietly never wakes.
 * Offering the real paths is the difference between a rule that works and one
 * nobody can debug.
 */

export interface EventPath {
  path: string
  /** Shapes which operators and input the UI offers. */
  kind: "number" | "string" | "boolean"
  label: string
}

export interface EventTypeDescriptor {
  type: string
  label: string
  description: string
  /** True when something in the codebase actually raises it. */
  live: boolean
  /** Where it is raised from, so the claim is checkable. */
  raisedBy?: string
  paths: EventPath[]
  /** A sensible default for the per-subject cooldown. */
  suggestedCooldownKeyPath?: string
}

export const EVENT_CATALOGUE: EventTypeDescriptor[] = [
  {
    type: "order.created",
    label: "Order created",
    description: "A sales order was placed, through any channel.",
    live: true,
    raisedBy: "createSalesOrder",
    suggestedCooldownKeyPath: "order.id",
    paths: [
      { path: "order.total", kind: "number", label: "Order total (order currency)" },
      { path: "order.baseTotal", kind: "number", label: "Order total (entity currency)" },
      { path: "order.currency", kind: "string", label: "Currency" },
      { path: "order.status", kind: "string", label: "Status" },
      { path: "order.lineCount", kind: "number", label: "Number of lines" },
      { path: "order.number", kind: "string", label: "Order number" },
      { path: "customer.name", kind: "string", label: "Customer name" },
      { path: "customer.id", kind: "string", label: "Customer id" },
    ],
  },
  {
    type: "order.dispatched",
    label: "Order dispatched",
    description: "Stock physically left for a customer. Carries any short picks.",
    live: true,
    raisedBy: "commitStockForOrder",
    suggestedCooldownKeyPath: "order.id",
    paths: [
      { path: "shortfallCount", kind: "number", label: "Lines short-picked" },
      { path: "order.number", kind: "string", label: "Order number" },
      { path: "order.id", kind: "string", label: "Order id" },
    ],
  },
  {
    type: "lot.quarantined",
    label: "Lot put on hold",
    description: "A batch was quarantined. The recall scope is a query away and the stock is still stoppable.",
    live: true,
    raisedBy: "quarantineBatch",
    suggestedCooldownKeyPath: "lot.code",
    paths: [
      { path: "lot.code", kind: "string", label: "Lot code" },
      { path: "lot.reason", kind: "string", label: "Hold reason" },
      { path: "lot.units", kind: "number", label: "Units held" },
      { path: "lot.batches", kind: "number", label: "Batches affected" },
    ],
  },
  {
    type: "production.completed",
    label: "Production run completed",
    description: "A run finished. Carries the yield against plan.",
    live: true,
    raisedBy: "completeProductionOrder",
    suggestedCooldownKeyPath: "run.id",
    paths: [
      { path: "run.yieldPercent", kind: "number", label: "Yield against plan (%)" },
      { path: "run.producedQty", kind: "number", label: "Produced" },
      { path: "run.rejectedQty", kind: "number", label: "Rejected" },
      { path: "run.unitCost", kind: "number", label: "Unit cost" },
      { path: "run.number", kind: "string", label: "Run number" },
      { path: "product.sku", kind: "string", label: "Product SKU" },
      { path: "lot.code", kind: "string", label: "Output lot code" },
    ],
  },
  {
    type: "order.cancelled",
    label: "Order cancelled",
    description: "A sales order was cancelled after being placed.",
    live: false,
    paths: [
      { path: "order.total", kind: "number", label: "Order total" },
      { path: "order.number", kind: "string", label: "Order number" },
    ],
  },
  {
    type: "stock.low",
    label: "Stock below reorder level",
    description: "An item dropped under its reorder point.",
    live: false,
    paths: [
      { path: "product.sku", kind: "string", label: "Product SKU" },
      { path: "stock.onHand", kind: "number", label: "On hand" },
      { path: "stock.reorderLevel", kind: "number", label: "Reorder level" },
    ],
  },
  {
    type: "lot.expiring",
    label: "Lot approaching expiry",
    description: "Needs a scheduled sweep rather than a call site, so it is not raised yet.",
    live: false,
    paths: [
      { path: "lot.code", kind: "string", label: "Lot code" },
      { path: "lot.daysToExpiry", kind: "number", label: "Days to expiry" },
    ],
  },
  {
    type: "purchase.received",
    label: "Purchase received",
    description: "Goods arrived against a purchase order.",
    live: false,
    paths: [
      { path: "purchase.number", kind: "string", label: "PO number" },
      { path: "purchase.total", kind: "number", label: "PO total" },
      { path: "supplier.name", kind: "string", label: "Supplier" },
    ],
  },
  {
    type: "invoice.overdue",
    label: "Invoice overdue",
    description: "Needs a scheduled sweep rather than a call site, so it is not raised yet.",
    live: false,
    paths: [
      { path: "invoice.number", kind: "string", label: "Invoice number" },
      { path: "invoice.outstanding", kind: "number", label: "Outstanding" },
      { path: "invoice.daysOverdue", kind: "number", label: "Days overdue" },
    ],
  },
  {
    type: "payment.received",
    label: "Payment received",
    description: "A customer payment was recorded.",
    live: false,
    paths: [
      { path: "payment.amount", kind: "number", label: "Amount" },
      { path: "customer.name", kind: "string", label: "Customer" },
    ],
  },
  {
    type: "bin.overfilled",
    label: "Bin over capacity",
    description: "Stock was put into a bin past its ceiling.",
    live: false,
    paths: [
      { path: "bin.code", kind: "string", label: "Bin code" },
      { path: "bin.used", kind: "number", label: "Units in bin" },
      { path: "bin.maxUnits", kind: "number", label: "Bin ceiling" },
    ],
  },
  {
    type: "rate.stale",
    label: "Exchange rate stale",
    description: "Needs a scheduled sweep rather than a call site, so it is not raised yet.",
    live: false,
    paths: [
      { path: "pair", kind: "string", label: "Currency pair" },
      { path: "ageDays", kind: "number", label: "Rate age in days" },
    ],
  },
]

export const KNOWN_EVENT_TYPES = EVENT_CATALOGUE.map((entry) => entry.type)

export const LIVE_EVENT_TYPES = EVENT_CATALOGUE.filter((entry) => entry.live).map(
  (entry) => entry.type
)

export function describeEventType(type: string) {
  return EVENT_CATALOGUE.find((entry) => entry.type === type) ?? null
}

/** Operators that make sense for a path of this kind. */
export function operatorsFor(kind: EventPath["kind"]) {
  if (kind === "number") {
    return ["gt", "gte", "lt", "lte", "eq", "ne", "exists"] as const
  }

  if (kind === "boolean") {
    return ["eq", "exists"] as const
  }

  return ["eq", "ne", "contains", "in", "exists"] as const
}
