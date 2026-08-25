import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Working out who supplies what, from what was actually bought.
 *
 * `ProductSupplier` carries the cost, lead time and minimum order quantity that
 * replenishment planning depends on, and most products have no link at all —
 * so the plan can say what to order and not who from. Every purchase order ever
 * raised is evidence of a real supply relationship, and that evidence is
 * already in the database.
 *
 * Derived, never invented. A link is only created where a purchase order
 * genuinely exists; a product nobody has bought stays unlinked, because
 * guessing a supplier is how an order goes to the wrong company.
 */

export interface DerivedLink {
  productId: string
  supplierId: string
  /** Most recent price paid, which is the best estimate available. */
  costPrice: number
  purchaseCount: number
  lastOrderedAt: Date
}

export interface BackfillResult {
  candidates: number
  created: number
  skippedExisting: number
  links: Array<{ product: string; supplier: string; costPrice: number; from: number }>
}

/**
 * Every product-supplier pair that appears in purchase order history.
 *
 * The latest unit cost wins rather than an average: an average across a year
 * of price rises describes a price nobody can buy at today.
 */
export async function derivableLinks(db: DbClient): Promise<DerivedLink[]> {
  const items = await db.purchaseOrderItem.findMany({
    select: {
      productId: true,
      unitCost: true,
      purchaseOrder: { select: { supplierId: true, orderDate: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const byPair = new Map<string, DerivedLink>()

  for (const item of items) {
    const supplierId = item.purchaseOrder.supplierId
    if (!item.productId || !supplierId) continue

    const key = `${item.productId}|${supplierId}`
    const existing = byPair.get(key)
    const orderedAt = item.purchaseOrder.orderDate

    if (!existing) {
      byPair.set(key, {
        productId: item.productId,
        supplierId,
        costPrice: item.unitCost,
        purchaseCount: 1,
        lastOrderedAt: orderedAt,
      })
      continue
    }

    existing.purchaseCount += 1

    if (orderedAt >= existing.lastOrderedAt) {
      existing.lastOrderedAt = orderedAt
      existing.costPrice = item.unitCost
    }
  }

  return [...byPair.values()]
}

/**
 * Create the links that purchase history supports.
 *
 * Never overwrites an existing link: someone may have set a negotiated cost or
 * a real lead time by hand, and history should not quietly undo that.
 */
export async function backfillSupplierLinks(
  db: DbClient,
  options?: { dryRun?: boolean; defaultLeadTimeDays?: number }
): Promise<BackfillResult> {
  const derived = await derivableLinks(db)

  const existing = await db.productSupplier.findMany({
    select: { productId: true, supplierId: true },
  })
  const known = new Set(existing.map((e) => `${e.productId}|${e.supplierId}`))

  const missing = derived.filter((d) => !known.has(`${d.productId}|${d.supplierId}`))

  const [products, suppliers] = await Promise.all([
    db.product.findMany({
      where: { id: { in: missing.map((m) => m.productId) } },
      select: { id: true, name: true },
    }),
    db.supplier.findMany({
      where: { id: { in: missing.map((m) => m.supplierId) } },
      select: { id: true, name: true, paymentTerms: true },
    }),
  ])

  const productName = new Map(products.map((p) => [p.id, p.name]))
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]))

  const links = missing.map((m) => ({
    product: productName.get(m.productId) ?? m.productId,
    supplier: supplierName.get(m.supplierId) ?? m.supplierId,
    costPrice: m.costPrice,
    from: m.purchaseCount,
  }))

  if (options?.dryRun) {
    return { candidates: derived.length, created: 0, skippedExisting: known.size, links }
  }

  for (const link of missing) {
    // Whether this is the preferred supplier is a commercial decision, so a
    // derived link never claims to be one.
    await db.productSupplier.create({
      data: {
        productId: link.productId,
        supplierId: link.supplierId,
        costPrice: link.costPrice,
        leadTime: options?.defaultLeadTimeDays ?? 7,
        minOrderQty: 1,
        isPreferred: false,
      },
    })
  }

  return {
    candidates: derived.length,
    created: missing.length,
    skippedExisting: derived.length - missing.length,
    links,
  }
}

/**
 * Products that replenishment cannot fully plan for.
 *
 * Without a link there is no lead time, no minimum and no cost — so the plan
 * can say what to order and not who from, at what price, or how far ahead. Made
 * visible rather than left as a quiet "no supplier" in the output.
 */
export async function productsWithoutSupplier(db: DbClient) {
  return db.product.findMany({
    where: { suppliers: { none: {} }, status: "active" },
    select: { id: true, sku: true, name: true },
    orderBy: { name: "asc" },
  })
}
