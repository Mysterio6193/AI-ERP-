import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"

/** Helpers shared by every tool domain. */

export function money(value: number) {
  return Number(value.toFixed(2))
}

export function days(from: Date, to = new Date()) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000)
}

/**
 * Customer-scoped tools must never be able to read another account. Returning a
 * `where` fragment - rather than checking an id inside the tool - means the
 * restriction is applied by the query itself and cannot be prompted away.
 */
export function customerScope(principal: AgentPrincipal) {
  return principal.kind === "customer" ? { customerId: principal.customerId } : {}
}

export function isStaff(principal: AgentPrincipal) {
  return principal.kind === "staff"
}

/**
 * Fuzzy product lookup over name, SKU, brand and description.
 *
 * Deliberately SQL rather than embeddings: at this catalog size trigram-style
 * matching is more accurate and far faster. Swap the body when the catalog
 * outgrows it - the tool signature stays the same.
 */
export async function findProducts(query: string, limit = 8) {
  const terms = query.trim().split(/\s+/).filter(Boolean)

  const products = await db.product.findMany({
    where: {
      status: "active",
      AND: terms.map((term) => ({
        OR: [
          { name: { contains: term } },
          { sku: { contains: term } },
          { brand: { contains: term } },
          { description: { contains: term } },
        ],
      })),
    },
    take: limit,
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      packUnit: true,
      baseUnit: true,
      wholesalePrice: true,
      costPrice: true,
      gstRate: true,
      inventory: { select: { quantity: true, reserved: true } },
    },
  })

  return products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    unit: product.packUnit || product.baseUnit,
    price: money(product.wholesalePrice),
    gstRate: product.gstRate,
    available: product.inventory.reduce((sum, row) => sum + (row.quantity - row.reserved), 0),
  }))
}

/** Resolves an order by number or id, honouring customer scope. */
export async function findOrder(principal: AgentPrincipal, orderNumberOrId: string) {
  return db.salesOrder.findFirst({
    where: {
      ...customerScope(principal),
      OR: [{ id: orderNumberOrId }, { orderNumber: orderNumberOrId }],
    },
    select: { id: true, orderNumber: true, status: true, customerId: true },
  })
}
