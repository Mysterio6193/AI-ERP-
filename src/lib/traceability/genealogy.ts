/**
 * Lot genealogy: what went into a lot, and where that lot ended up.
 *
 * The existing trace answers one hop in each direction and then guesses. For
 * "who received this", it names every customer who bought the product after
 * the earliest affected run — which is both too many (someone who bought the
 * previous lot) and too few (someone who bought a product two steps
 * downstream, where our lot was an ingredient of an ingredient).
 *
 * A recall is the one query where being approximately right is worthless. Too
 * wide and the business throws away good stock and calls customers who were
 * never at risk; too narrow and affected product stays on a shelf.
 *
 * So this walks the actual links, to any depth, in both directions.
 *
 * Pure, and separated from the database, because the part that is easy to get
 * wrong is the graph walk — depth limits, diamonds where the same lot is
 * reached by two paths, and cycles, which should not exist and do, because
 * rework feeds a lot back into a later batch of itself.
 */

/** One consumption: `childLot` was made using `parentLot`. */
export interface LotLink {
  parentLot: string
  childLot: string
  /** How much of the parent went in, for apportioning a partial recall. */
  quantity: number
  productId: string
  productName?: string
  occurredAt?: Date | null
}

export interface LotGraph {
  /** parentLot -> links where it is the parent (what it became). */
  forward: Map<string, LotLink[]>
  /** childLot -> links where it is the child (what went into it). */
  backward: Map<string, LotLink[]>
}

export function buildLotGraph(links: LotLink[]): LotGraph {
  const forward = new Map<string, LotLink[]>()
  const backward = new Map<string, LotLink[]>()

  for (const link of links) {
    // A lot that consumed itself is a data error, not a genealogy. Dropping it
    // here keeps every caller from having to think about it.
    if (link.parentLot === link.childLot) continue

    const out = forward.get(link.parentLot)
    if (out) out.push(link)
    else forward.set(link.parentLot, [link])

    const back = backward.get(link.childLot)
    if (back) back.push(link)
    else backward.set(link.childLot, [link])
  }

  return { forward, backward }
}

export interface TraceNode {
  lot: string
  /** Hops from the lot asked about. The starting lot is 0. */
  depth: number
  productId: string
  productName: string | null
  quantity: number
  occurredAt: Date | null
  /** The lot one hop closer to the start, so a path can be reconstructed. */
  via: string
}

export interface TraceResult {
  lot: string
  nodes: TraceNode[]
  /** True when the walk stopped at maxDepth rather than running out of links. */
  truncated: boolean
  /** Lots reached by more than one path. Present in a diamond, and in rework. */
  revisited: string[]
}

const DEFAULT_MAX_DEPTH = 12

/**
 * Walks the graph breadth-first from one lot.
 *
 * Breadth-first rather than depth-first so `depth` is the true shortest number
 * of hops. Depth-first would reach a lot down a long path first and label it
 * with that path's length, which reads as "five steps removed" for something
 * one step away.
 *
 * Each lot appears once, at its shallowest depth. A lot reached twice is
 * recorded in `revisited` rather than expanded twice: a diamond would
 * otherwise double the apparent quantity, and a cycle would not terminate.
 */
function walk(
  start: string,
  edges: Map<string, LotLink[]>,
  nextOf: (link: LotLink) => string,
  maxDepth: number
): TraceResult {
  const seen = new Set<string>([start])
  const revisited = new Set<string>()
  const nodes: TraceNode[] = []

  let frontier: string[] = [start]
  let depth = 0
  let truncated = false

  while (frontier.length) {
    if (depth >= maxDepth) {
      // Only a real truncation if there was something left to expand.
      truncated = frontier.some((lot) => (edges.get(lot)?.length ?? 0) > 0)
      break
    }

    const next: string[] = []

    for (const lot of frontier) {
      for (const link of edges.get(lot) ?? []) {
        const neighbour = nextOf(link)

        if (seen.has(neighbour)) {
          revisited.add(neighbour)
          continue
        }

        seen.add(neighbour)
        next.push(neighbour)

        nodes.push({
          lot: neighbour,
          depth: depth + 1,
          productId: link.productId,
          productName: link.productName ?? null,
          quantity: link.quantity,
          occurredAt: link.occurredAt ?? null,
          via: lot,
        })
      }
    }

    frontier = next
    depth += 1
  }

  return { lot: start, nodes, truncated, revisited: [...revisited] }
}

/** What went into this lot, and into those, to any depth. */
export function traceBackward(lot: string, graph: LotGraph, maxDepth = DEFAULT_MAX_DEPTH) {
  return walk(lot, graph.backward, (link) => link.parentLot, maxDepth)
}

/** What this lot became, and what those became, to any depth. */
export function traceForward(lot: string, graph: LotGraph, maxDepth = DEFAULT_MAX_DEPTH) {
  return walk(lot, graph.forward, (link) => link.childLot, maxDepth)
}

export interface LotShipmentRow {
  lot: string
  productId: string
  productName?: string | null
  quantity: number
  customerId: string
  customerName: string
  orderNumber: string
  shippedAt?: Date | null
  contact?: { phone?: string | null; email?: string | null }
}

export interface RecallCustomer {
  customerId: string
  customerName: string
  phone: string | null
  email: string | null
  quantity: number
  orders: string[]
  /** Which lots reached them — the one recalled, or one made from it. */
  lots: string[]
  /** Hops from the recalled lot. Zero means they received it directly. */
  nearestDepth: number
}

export interface RecallScope {
  lot: string
  /** Every lot implicated: the one recalled and everything made from it. */
  affectedLots: Array<{ lot: string; depth: number }>
  customers: RecallCustomer[]
  totalQuantity: number
  truncated: boolean
}

/**
 * Who has to be called.
 *
 * Takes the forward walk and the shipment records and produces the list a
 * person actually works from: customer, how much, which orders, and how far
 * removed the product they got is from the lot that failed.
 *
 * Nothing is inferred from dates here. A customer appears because a shipment
 * record says this lot went to them, not because they bought the same product
 * in the same week.
 */
export function recallScope(
  lot: string,
  graph: LotGraph,
  shipments: LotShipmentRow[],
  maxDepth = DEFAULT_MAX_DEPTH
): RecallScope {
  const forward = traceForward(lot, graph, maxDepth)

  const depthOf = new Map<string, number>([[lot, 0]])
  for (const node of forward.nodes) {
    const existing = depthOf.get(node.lot)
    if (existing === undefined || node.depth < existing) {
      depthOf.set(node.lot, node.depth)
    }
  }

  const byCustomer = new Map<string, RecallCustomer>()
  let totalQuantity = 0

  for (const shipment of shipments) {
    const depth = depthOf.get(shipment.lot)
    if (depth === undefined) continue

    totalQuantity += shipment.quantity

    const existing = byCustomer.get(shipment.customerId)

    if (!existing) {
      byCustomer.set(shipment.customerId, {
        customerId: shipment.customerId,
        customerName: shipment.customerName,
        phone: shipment.contact?.phone ?? null,
        email: shipment.contact?.email ?? null,
        quantity: shipment.quantity,
        orders: [shipment.orderNumber],
        lots: [shipment.lot],
        nearestDepth: depth,
      })
      continue
    }

    existing.quantity += shipment.quantity
    if (!existing.orders.includes(shipment.orderNumber)) existing.orders.push(shipment.orderNumber)
    if (!existing.lots.includes(shipment.lot)) existing.lots.push(shipment.lot)
    existing.nearestDepth = Math.min(existing.nearestDepth, depth)

    // A contact detail recorded on one order and not another is worth keeping;
    // the list is only useful if there is a way to reach the customer.
    existing.phone ??= shipment.contact?.phone ?? null
    existing.email ??= shipment.contact?.email ?? null
  }

  return {
    lot,
    affectedLots: [...depthOf.entries()]
      .map(([affected, depth]) => ({ lot: affected, depth }))
      .sort((a, b) => a.depth - b.depth || a.lot.localeCompare(b.lot)),
    customers: [...byCustomer.values()].sort(
      // Directly affected first, then by exposure: that is the order someone
      // works the list in when there are more calls than hours.
      (a, b) => a.nearestDepth - b.nearestDepth || b.quantity - a.quantity
    ),
    totalQuantity,
    truncated: forward.truncated,
  }
}
