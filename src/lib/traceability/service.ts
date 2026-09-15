import { db } from "@/lib/db"
import {
  buildLotGraph,
  recallScope,
  traceBackward,
  traceForward,
  type LotLink,
  type LotShipmentRow,
  type RecallScope,
} from "@/lib/traceability/genealogy"

/**
 * Traceability, against the database.
 *
 * The graph walk lives in `genealogy.ts` and is pure. This file loads the
 * links and the shipment records it needs.
 *
 * Loading strategy is the interesting part. A recall is asked for once and
 * has to be right, so the links are loaded breadth-first — one query per hop,
 * only for the lots actually reached — rather than pulling every consumption
 * in the database and walking that. On a busy site the second approach is a
 * table scan per enquiry; this one touches a few dozen rows.
 */

/** Hops. Deep enough for any real bill of materials, shallow enough to bound. */
const MAX_DEPTH = 12

/** Rows per hop. A lot split across more runs than this is worth saying so. */
const PER_HOP_LIMIT = 500

/**
 * One lot drawn by one consumption.
 *
 * Read from `ProductionConsumptionLot` rather than
 * `ProductionConsumption.batchCode`: a line that consumed 12 units may have
 * taken them from three lots, and the single field holds one. Walking the
 * single field declares the other two clear.
 */
interface ConsumptionLotRow {
  batchCode: string
  quantity: number
  consumption: {
    componentId: string
    component: { name: string } | null
    productionOrder: { batchCode: string | null; completedAt: Date | null; createdAt: Date }
  }
}

function toLink(row: ConsumptionLotRow): LotLink | null {
  // A run with no lot of its own is not yet part of anyone's genealogy.
  if (!row.consumption.productionOrder.batchCode) return null

  return {
    parentLot: row.batchCode,
    childLot: row.consumption.productionOrder.batchCode,
    quantity: row.quantity,
    productId: row.consumption.componentId,
    productName: row.consumption.component?.name,
    occurredAt:
      row.consumption.productionOrder.completedAt ?? row.consumption.productionOrder.createdAt,
  }
}

const CONSUMPTION_SELECT = {
  batchCode: true,
  quantity: true,
  consumption: {
    select: {
      componentId: true,
      component: { select: { name: true } },
      productionOrder: { select: { batchCode: true, completedAt: true, createdAt: true } },
    },
  },
} as const

/**
 * Loads the links reachable from a lot, one hop at a time.
 *
 * `direction` decides which side of the link the frontier matches on: going
 * forward we look for runs that consumed these lots, going backward for the
 * runs that produced them.
 */
async function loadLinks(start: string, direction: "forward" | "backward") {
  const links: LotLink[] = []
  const visited = new Set<string>([start])
  let frontier = [start]

  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const rows = await db.productionConsumptionLot.findMany({
      where:
        direction === "forward"
          ? { batchCode: { in: frontier } }
          : { consumption: { productionOrder: { batchCode: { in: frontier } } } },
      select: CONSUMPTION_SELECT,
      take: PER_HOP_LIMIT,
    })

    const next: string[] = []

    for (const row of rows) {
      const link = toLink(row as ConsumptionLotRow)
      if (!link) continue

      links.push(link)

      const neighbour = direction === "forward" ? link.childLot : link.parentLot
      if (!visited.has(neighbour)) {
        visited.add(neighbour)
        next.push(neighbour)
      }
    }

    frontier = next
  }

  return links
}

/** Everything that went into a lot, to any depth. */
export async function whatWentIntoIt(batchCode: string) {
  const graph = buildLotGraph(await loadLinks(batchCode, "backward"))
  return traceBackward(batchCode, graph, MAX_DEPTH)
}

/** Everything a lot became, to any depth. */
export async function whatItBecame(batchCode: string) {
  const graph = buildLotGraph(await loadLinks(batchCode, "forward"))
  return traceForward(batchCode, graph, MAX_DEPTH)
}

/**
 * Records that a lot left the building, and for whom.
 *
 * Called at dispatch. The one write that makes a recall a query rather than
 * an investigation.
 */
export async function recordLotShipment(input: {
  batchCode: string
  batchId?: string | null
  productId: string
  quantity: number
  orderId: string
  orderItemId?: string | null
  customerId: string
  shippedAt?: Date
}) {
  if (!input.batchCode.trim()) {
    return { ok: false as const, error: "A lot code is required" }
  }

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false as const, error: "Quantity must be greater than zero" }
  }

  const created = await db.lotShipment.create({
    data: {
      batchCode: input.batchCode.trim(),
      batchId: input.batchId ?? null,
      productId: input.productId,
      quantity: Math.round(input.quantity),
      orderId: input.orderId,
      orderItemId: input.orderItemId ?? null,
      customerId: input.customerId,
      shippedAt: input.shippedAt ?? new Date(),
    },
    select: { id: true },
  })

  return { ok: true as const, id: created.id }
}

/**
 * Who has to be called about a lot.
 *
 * Walks forward to every lot made from this one, then looks up the shipments
 * for all of them at once. A customer appears because a dispatch record says
 * this lot reached them — never because they bought the same product in the
 * same week.
 */
export async function planRecall(batchCode: string): Promise<RecallScope> {
  const graph = buildLotGraph(await loadLinks(batchCode, "forward"))
  const forward = traceForward(batchCode, graph, MAX_DEPTH)

  const lots = [batchCode, ...forward.nodes.map((node) => node.lot)]

  const shipments = await db.lotShipment.findMany({
    where: { batchCode: { in: lots } },
    select: {
      batchCode: true,
      productId: true,
      quantity: true,
      shippedAt: true,
      product: { select: { name: true } },
      customer: { select: { id: true, name: true, phone: true, email: true } },
      order: { select: { orderNumber: true } },
    },
    orderBy: { shippedAt: "desc" },
    take: 2_000,
  })

  const rows: LotShipmentRow[] = shipments.map((row) => ({
    lot: row.batchCode,
    productId: row.productId,
    productName: row.product.name,
    quantity: row.quantity,
    customerId: row.customer.id,
    customerName: row.customer.name,
    orderNumber: row.order.orderNumber,
    shippedAt: row.shippedAt,
    contact: { phone: row.customer.phone, email: row.customer.email },
  }))

  return recallScope(batchCode, graph, rows, MAX_DEPTH)
}

/**
 * Everything known about one lot, in both directions.
 *
 * What a person opens when a complaint comes in and they do not yet know
 * whether it is one carton or a recall.
 */
export async function lotDossier(batchCode: string) {
  const [batch, backward, recall] = await Promise.all([
    db.inventoryBatch.findFirst({
      where: { batchCode },
      select: {
        id: true,
        batchCode: true,
        quantity: true,
        reserved: true,
        status: true,
        holdReason: true,
        expiryDate: true,
        receivedAt: true,
        sourceType: true,
        unitCost: true,
        productId: true,
        // InventoryBatch carries productId but reaches the product through
        // the inventory row it belongs to.
        inventory: { select: { product: { select: { id: true, sku: true, name: true } } } },
        supplierId: true,
      },
      orderBy: { receivedAt: "desc" },
    }),
    whatWentIntoIt(batchCode),
    planRecall(batchCode),
  ])

  const producedBy = await db.productionOrder.findMany({
    where: { batchCode },
    select: {
      orderNumber: true,
      status: true,
      completedAt: true,
      producedQty: true,
      rejectedQty: true,
      product: { select: { sku: true, name: true } },
    },
    take: 20,
  })

  return {
    batchCode,
    batch,
    producedBy,
    ingredients: backward,
    recall,
    // Stock of this lot still on hand is what can be stopped before it ships,
    // and it is the first question after "who has it already".
    onHand: batch ? batch.quantity - batch.reserved : 0,
  }
}
