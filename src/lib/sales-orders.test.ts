import { beforeEach, describe, expect, it, vi } from "vitest"

import { pricingSchema, taxSchema } from "./settings/registry"

/**
 * The fake database. Every lookup priceSalesOrder makes goes through here, so
 * a test declares its world by setting `world` before calling.
 */
const world = {
  products: new Map<string, Record<string, unknown>>(),
  customer: null as Record<string, unknown> | null,
  company: null as Record<string, unknown> | null,
  taxRates: new Map<string, Record<string, unknown>>(),
  priceLists: [] as Array<Record<string, unknown>>,
  priceListItems: [] as Array<Record<string, unknown>>,
}

const queries = { priceLists: 0, priceListItems: 0 }

vi.mock("@/lib/db", () => ({
  db: {
    product: { findUnique: async ({ where }: { where: { id: string } }) => world.products.get(where.id) ?? null },
    customer: { findUnique: async () => world.customer },
    company: { findUnique: async () => world.company },
    taxRate: { findUnique: async ({ where }: { where: { id: string } }) => world.taxRates.get(where.id) ?? null },
    priceList: {
      findMany: async () => {
        queries.priceLists++
        return world.priceLists
      },
    },
    priceListItem: {
      findMany: async () => {
        queries.priceListItems++
        return world.priceListItems
      },
    },
  },
}))

// Real defaults, so "off by default" in these tests means the same thing it
// means in production.
vi.mock("@/lib/settings/service", () => ({
  getSettings: async (namespace: string) =>
    namespace === "tax" ? taxSchema.parse({}) : pricingSchema.parse({}),
}))

const { priceSalesOrder } = await import("./sales-orders")

/**
 * Pricing a basket: where the line price, the line discount and the tax rate
 * all meet. It had no tests.
 *
 * resolveLinePrice and computeLineTax are covered on their own; what is tested
 * here is the part only this function does — applying the discount, ordering
 * discount against tax, and adding the lines up.
 */

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Mozzarella 2kg",
    sku: "MOZ-2KG",
    wholesalePrice: 20,
    retailPrice: 30,
    gstRate: 10,
    gstExempt: false,
    taxRateId: null,
    ...overrides,
  }
}

beforeEach(() => {
  world.products = new Map([["prod-1", product()]])
  world.customer = { customerType: "wholesale", priceListId: null }
  world.company = { gstRate: 10, country: "AU" }
  world.taxRates = new Map()
  world.priceLists = []
  world.priceListItems = []
  queries.priceLists = 0
  queries.priceListItems = 0
})

describe("priceSalesOrder — refusals", () => {
  it("refuses a basket containing a product that does not exist", async () => {
    const result = await priceSalesOrder([{ productId: "ghost", quantity: 1 }])

    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toContain("ghost")
  })

  it("refuses on the missing product even when other lines are fine", async () => {
    // Pricing part of a basket and silently dropping the rest would produce an
    // order for less than the customer asked for.
    const result = await priceSalesOrder([
      { productId: "prod-1", quantity: 1 },
      { productId: "ghost", quantity: 1 },
    ])

    expect(result.ok).toBe(false)
  })
})

describe("priceSalesOrder — line maths", () => {
  it("multiplies by quantity and adds tax", async () => {
    const result = await priceSalesOrder([{ productId: "prod-1", quantity: 5, unitPrice: 100 }])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.subtotal).toBe(500)
    expect(result.taxAmount).toBe(50)
    expect(result.totalAmount).toBe(550)
  })

  it("applies a line discount as a percentage of the line, before tax", async () => {
    // Taxing the pre-discount figure would overcharge GST on money nobody paid.
    const result = await priceSalesOrder([
      { productId: "prod-1", quantity: 10, unitPrice: 100, discount: 10 },
    ])

    if (!result.ok) throw new Error(result.error)

    expect(result.subtotal).toBe(900)
    expect(result.taxAmount).toBe(90)
    expect(result.totalAmount).toBe(990)
  })

  it("ignores a zero discount rather than treating it as a hundred percent off", async () => {
    const result = await priceSalesOrder([
      { productId: "prod-1", quantity: 2, unitPrice: 50, discount: 0 },
    ])

    if (!result.ok) throw new Error(result.error)
    expect(result.subtotal).toBe(100)
  })

  it("honours an explicit unit price over the product's own", async () => {
    const result = await priceSalesOrder([{ productId: "prod-1", quantity: 1, unitPrice: 7.5 }])

    if (!result.ok) throw new Error(result.error)
    expect(result.items[0].unitPrice).toBe(7.5)
  })

  it("falls back to the wholesale price when no price is given", async () => {
    const result = await priceSalesOrder([{ productId: "prod-1", quantity: 3 }])

    if (!result.ok) throw new Error(result.error)
    expect(result.items[0].unitPrice).toBe(20)
    expect(result.subtotal).toBe(60)
  })

  it("adds several lines together", async () => {
    world.products.set("prod-2", product({ id: "prod-2", name: "Cheddar 1kg", sku: "CHE-1KG" }))

    const result = await priceSalesOrder([
      { productId: "prod-1", quantity: 2, unitPrice: 100 },
      { productId: "prod-2", quantity: 3, unitPrice: 50 },
    ])

    if (!result.ok) throw new Error(result.error)

    expect(result.items).toHaveLength(2)
    expect(result.subtotal).toBe(350)
    expect(result.taxAmount).toBe(35)
    expect(result.totalAmount).toBe(385)
  })

  it("carries the product's name and sku onto the line", async () => {
    // The order is read back long after the product may have been renamed.
    const result = await priceSalesOrder([{ productId: "prod-1", quantity: 1 }])

    if (!result.ok) throw new Error(result.error)
    expect(result.items[0]).toMatchObject({ productName: "Mozzarella 2kg", sku: "MOZ-2KG" })
  })
})

describe("priceSalesOrder — tax", () => {
  it("charges nothing on an exempt product", async () => {
    world.products.set("prod-1", product({ gstExempt: true }))

    const result = await priceSalesOrder([{ productId: "prod-1", quantity: 4, unitPrice: 25 }])

    if (!result.ok) throw new Error(result.error)
    expect(result.taxAmount).toBe(0)
    expect(result.totalAmount).toBe(100)
  })

  it("uses a named tax rate over the product's bare percentage", async () => {
    world.products.set("prod-1", product({ taxRateId: "tr-1" }))
    world.taxRates.set("tr-1", { rate: 5, status: "active", taxType: "gst" })

    const result = await priceSalesOrder([{ productId: "prod-1", quantity: 1, unitPrice: 100 }])

    if (!result.ok) throw new Error(result.error)
    expect(result.items[0].taxRate).toBe(5)
    expect(result.taxAmount).toBe(5)
  })

  it("ignores an archived rate rather than continuing to charge it", async () => {
    world.products.set("prod-1", product({ taxRateId: "tr-old" }))
    world.taxRates.set("tr-old", { rate: 5, status: "archived", taxType: "gst" })

    const result = await priceSalesOrder([{ productId: "prod-1", quantity: 1, unitPrice: 100 }])

    if (!result.ok) throw new Error(result.error)
    expect(result.items[0].taxRate).toBe(10)
  })
})

describe("priceSalesOrder — price lists", () => {
  it("does not read the price list tables at all while the feature is off", async () => {
    // Off by default. Two queries per order for a feature nobody enabled is
    // waste, and the tests should notice if that changes.
    await priceSalesOrder([{ productId: "prod-1", quantity: 1 }])

    expect(queries.priceLists).toBe(0)
    expect(queries.priceListItems).toBe(0)
  })

  it("reports where each price came from", async () => {
    const result = await priceSalesOrder([{ productId: "prod-1", quantity: 1 }])

    if (!result.ok) throw new Error(result.error)
    // Source is what makes a disputed price answerable months later.
    expect(result.items[0].priceSource).toBeTruthy()
    expect(result.items[0].priceListItemId).toBeNull()
  })
})
