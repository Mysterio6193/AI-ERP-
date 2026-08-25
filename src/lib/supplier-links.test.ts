import { describe, expect, it } from "vitest"

import { derivableLinks } from "./supplier-links"

/**
 * Most products had no supplier link, so replenishment could say what to order
 * and not who from. Purchase history is evidence of a real supply relationship
 * and it was already in the database — but only where an order actually
 * exists, because guessing a supplier is how an order goes to the wrong company.
 */

function client(items: Array<{ productId: string; unitCost: number; supplierId: string; orderDate: Date }>) {
  return {
    purchaseOrderItem: {
      findMany: async () =>
        items.map((i) => ({
          productId: i.productId,
          unitCost: i.unitCost,
          purchaseOrder: { supplierId: i.supplierId, orderDate: i.orderDate },
        })),
    },
  } as never
}

const day = (n: number) => new Date(2026, 6, n)

describe("derivableLinks", () => {
  it("finds a pair from a single purchase", async () => {
    const links = await derivableLinks(client([{ productId: "p1", supplierId: "s1", unitCost: 10, orderDate: day(1) }]))

    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ productId: "p1", supplierId: "s1", costPrice: 10, purchaseCount: 1 })
  })

  it("takes the most recent price, not an average", async () => {
    // An average across a year of price rises describes a price nobody can buy
    // at today.
    const links = await derivableLinks(client([
      { productId: "p1", supplierId: "s1", unitCost: 10, orderDate: day(1) },
      { productId: "p1", supplierId: "s1", unitCost: 14, orderDate: day(20) },
    ]))

    expect(links[0].costPrice).toBe(14)
    expect(links[0].purchaseCount).toBe(2)
  })

  it("is not fooled by rows arriving out of date order", async () => {
    const links = await derivableLinks(client([
      { productId: "p1", supplierId: "s1", unitCost: 14, orderDate: day(20) },
      { productId: "p1", supplierId: "s1", unitCost: 10, orderDate: day(1) },
    ]))

    expect(links[0].costPrice).toBe(14)
  })

  it("keeps two suppliers of the same product separate", async () => {
    // A product bought from two suppliers has two real relationships.
    const links = await derivableLinks(client([
      { productId: "p1", supplierId: "s1", unitCost: 10, orderDate: day(1) },
      { productId: "p1", supplierId: "s2", unitCost: 9, orderDate: day(2) },
    ]))

    expect(links).toHaveLength(2)
  })

  it("ignores a line with no supplier rather than inventing one", async () => {
    const links = await derivableLinks(client([
      { productId: "p1", supplierId: "", unitCost: 10, orderDate: day(1) },
    ]))

    expect(links).toHaveLength(0)
  })

  it("returns nothing when there is no purchase history", async () => {
    expect(await derivableLinks(client([]))).toHaveLength(0)
  })
})
