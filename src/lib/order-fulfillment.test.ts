import { beforeEach, describe, expect, it, vi } from "vitest"

const postInvoiceRaised = vi.fn(async () => ({ ok: true }))
const fulfilReservationsForOrder = vi.fn(async () => ({ ok: true }))
type Allocation = {
  ok: boolean
  allocations: Array<{ batchCode: string }>
  unallocated: number
  blocked: Array<{ batchCode: string; reason: string }>
}
const allocateFefo = vi.fn(
  async (..._args: unknown[]): Promise<Allocation> => ({
    ok: true,
    allocations: [],
    unallocated: 0,
    blocked: [],
  })
)
const consumeBatches = vi.fn(async (..._args: unknown[]) => undefined)

vi.mock("@/lib/ledger", () => ({ postInvoiceRaised: () => postInvoiceRaised() }))
vi.mock("@/lib/reservations", () => ({
  fulfilReservationsForOrder: () => fulfilReservationsForOrder(),
}))
vi.mock("@/lib/batches", () => ({
  allocateFefo: (...a: unknown[]) => allocateFefo(...(a as [])),
  consumeBatches: (...a: unknown[]) => consumeBatches(...(a as [])),
}))
vi.mock("@/lib/numbering", () => ({
  nextDocumentNumber: async () => "INV-2026-01234",
}))
vi.mock("@/lib/settings/service", () => ({ getSettings: async () => ({}) }))
vi.mock("@/lib/invoicing", () => ({
  computeDueDate: ({ paymentTerms }: { paymentTerms: number }) =>
    new Date(`2026-01-${String(1 + (paymentTerms || 0)).padStart(2, "0")}T00:00:00Z`),
}))
vi.mock("@/lib/db", () => ({ db: {} }))

const { commitStockForOrder, ensureInvoiceForOrder } = await import("./order-fulfillment")

/**
 * Dispatch is the moment stock leaves and the customer starts owing money, and
 * neither half had tests.
 *
 * The behaviour that matters is what happens when reality does not match the
 * record: not enough stock to cover the line, an order dispatched twice, a
 * customer whose credit limit is crossed by the invoice being raised.
 */

function makeClient(options: {
  order?: Record<string, unknown> | null
  alreadyCommitted?: boolean
  existingInvoice?: Record<string, unknown> | null
  inventory?: { id: string; avgCost: number } | null
} = {}) {
  const writes = {
    movements: [] as Array<Record<string, unknown>>,
    inventoryUpdates: [] as Array<Record<string, unknown>>,
    itemUpdates: [] as Array<Record<string, unknown>>,
    invoices: [] as Array<Record<string, unknown>>,
    customerUpdates: [] as Array<Record<string, unknown>>,
    creditTransactions: [] as Array<Record<string, unknown>>,
  }

  const client = {
    salesOrder: { findUnique: async () => options.order ?? null },
    stockMovement: {
      findFirst: async () => (options.alreadyCommitted ? { id: "sm-1" } : null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.movements.push(data)
        return data
      },
    },
    warehouse: { findFirst: async () => ({ id: "wh-default" }) },
    inventory: {
      findFirst: async () =>
        options.inventory === undefined ? { id: "inv-row", avgCost: 4 } : options.inventory,
      update: async ({ data, where }: { data: Record<string, unknown>; where: unknown }) => {
        writes.inventoryUpdates.push({ ...data, where })
        return data
      },
    },
    salesOrderItem: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.itemUpdates.push(data)
        return data
      },
    },
    invoice: {
      findUnique: async () => options.existingInvoice ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.invoices.push(data)
        return { id: "inv-new", ...data }
      },
    },
    customer: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.customerUpdates.push(data)
        return data
      },
    },
    creditTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.creditTransactions.push(data)
        return data
      },
    },
  }

  return { client: client as never, writes }
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "so-1",
    orderNumber: "SO-2026-0001",
    warehouseId: "wh-1",
    items: [
      {
        id: "line-1",
        productId: "prod-1",
        quantity: 5,
        shippedQty: 0,
        warehouseId: "wh-1",
        product: { name: "Mozzarella 2kg" },
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  postInvoiceRaised.mockClear()
  fulfilReservationsForOrder.mockClear()
  consumeBatches.mockClear()
  allocateFefo.mockReset()
  allocateFefo.mockResolvedValue({ ok: true, allocations: [], unallocated: 0, blocked: [] })
})

describe("commitStockForOrder", () => {
  it("refuses an order that does not exist", async () => {
    const { client } = makeClient({ order: null })
    expect(await commitStockForOrder(client, "nope")).toMatchObject({ ok: false })
  })

  it("does nothing the second time, so a re-sent status cannot double-decrement", async () => {
    // dispatched, delivered and invoiced all trigger this, and an order can
    // move through all three.
    const { client, writes } = makeClient({ order: order(), alreadyCommitted: true })

    const result = await commitStockForOrder(client, "so-1")

    expect(result).toMatchObject({ ok: true, skipped: true })
    expect(writes.movements).toHaveLength(0)
    expect(writes.inventoryUpdates).toHaveLength(0)
  })

  it("takes the stock off and writes the movement as negative", async () => {
    // Summing the movement ledger must reproduce on-hand, so an outbound
    // movement is stored negative.
    const { client, writes } = makeClient({ order: order() })

    await commitStockForOrder(client, "so-1")

    expect(writes.inventoryUpdates[0]).toMatchObject({ quantity: { decrement: 5 } })
    expect(writes.movements[0]).toMatchObject({
      type: "out",
      quantity: -5,
      reference: "SO-2026-0001",
      referenceType: "sales_order",
    })
  })

  it("values the movement at average cost", async () => {
    const { client, writes } = makeClient({ order: order() })

    await commitStockForOrder(client, "so-1")

    expect(writes.movements[0]).toMatchObject({ unitCost: 4, totalCost: 20 })
  })

  it("records the line as shipped", async () => {
    const { client, writes } = makeClient({ order: order() })

    await commitStockForOrder(client, "so-1")

    expect(writes.itemUpdates[0]).toMatchObject({ shippedQty: 5 })
  })

  it("reports a shortfall instead of throwing, because the goods have already gone", async () => {
    // Refusing here would leave the order dispatched with stock untouched,
    // which is worse than an order that went out short and says so.
    allocateFefo.mockResolvedValue({
      ok: false,
      allocations: [],
      unallocated: 2,
      blocked: [{ batchCode: "B-77", reason: "expired" }],
    })

    const { client, writes } = makeClient({ order: order() })
    const result = await commitStockForOrder(client, "so-1")

    expect(result).toMatchObject({ ok: true })
    expect((result as { shortfalls: unknown[] }).shortfalls).toEqual([
      { product: "Mozzarella 2kg", requested: 5, short: 2, blocked: ["B-77 (expired)"] },
    ])
    // The stock still comes off: the customer has the goods either way.
    expect(writes.inventoryUpdates).toHaveLength(1)
  })

  it("lifts the reservation, so availability is not reduced twice", async () => {
    // quantity has just dropped; leaving reserved in place would subtract the
    // same units again from every availability figure.
    const { client } = makeClient({ order: order() })

    await commitStockForOrder(client, "so-1")

    expect(fulfilReservationsForOrder).toHaveBeenCalledTimes(1)
  })

  it("skips a line with no quantity rather than writing an empty movement", async () => {
    const { client, writes } = makeClient({
      order: order({
        items: [
          { id: "l1", productId: "p1", quantity: 0, shippedQty: 0, warehouseId: "wh-1", product: { name: "Zero" } },
        ],
      }),
    })

    await commitStockForOrder(client, "so-1")

    expect(writes.movements).toHaveLength(0)
  })

  it("still records the movement when the product has no inventory row", async () => {
    // The movement ledger is the audit trail; losing the entry because a row
    // is missing would hide that goods left.
    const { client, writes } = makeClient({ order: order(), inventory: null })

    await commitStockForOrder(client, "so-1")

    expect(writes.movements).toHaveLength(1)
    expect(writes.movements[0]).toMatchObject({ inventoryId: null, unitCost: 0 })
  })
})

describe("ensureInvoiceForOrder", () => {
  const invoiceableOrder = {
    id: "so-1",
    orderNumber: "SO-2026-0001",
    customerId: "cust-1",
    companyId: "co-1",
    subtotal: 1000,
    taxAmount: 100,
    totalAmount: 1100,
    customer: {
      creditBalance: 0,
      creditLimit: 5000,
      creditStatus: "active",
      paymentTerms: 30,
    },
  }

  it("returns the existing invoice rather than raising a second one", async () => {
    // delivered and invoiced both call this, so being called twice is normal.
    const { client, writes } = makeClient({
      order: invoiceableOrder,
      existingInvoice: { id: "inv-existing" },
    })

    const result = await ensureInvoiceForOrder(client, "so-1")

    expect(result).toMatchObject({ id: "inv-existing" })
    expect(writes.invoices).toHaveLength(0)
    expect(postInvoiceRaised).not.toHaveBeenCalled()
  })

  it("returns null for an order that does not exist", async () => {
    const { client } = makeClient({ order: null })
    expect(await ensureInvoiceForOrder(client, "nope")).toBeNull()
  })

  it("raises the invoice for the full order total, unpaid", async () => {
    const { client, writes } = makeClient({ order: invoiceableOrder })

    await ensureInvoiceForOrder(client, "so-1")

    expect(writes.invoices[0]).toMatchObject({
      totalAmount: 1100,
      outstandingAmt: 1100,
      paidAmount: 0,
      status: "unpaid",
    })
  })

  it("posts it to the ledger, so receivables and the books move together", async () => {
    const { client } = makeClient({ order: invoiceableOrder })

    await ensureInvoiceForOrder(client, "so-1")

    expect(postInvoiceRaised).toHaveBeenCalledTimes(1)
  })

  it("uses the customer's own payment terms for the due date", async () => {
    // paymentTerms was stored and shown for years and never read, so a Net 7
    // account got the same due date as a Net 60 one.
    const { client, writes } = makeClient({
      order: { ...invoiceableOrder, customer: { ...invoiceableOrder.customer, paymentTerms: 6 } },
    })

    await ensureInvoiceForOrder(client, "so-1")

    expect((writes.invoices[0].dueDate as Date).toISOString()).toContain("2026-01-07")
  })

  it("increases the customer's credit balance atomically", async () => {
    const { client, writes } = makeClient({ order: invoiceableOrder })

    await ensureInvoiceForOrder(client, "so-1")

    expect(writes.customerUpdates[0].creditBalance).toEqual({ increment: 1100 })
  })

  it("puts the customer on hold when the invoice takes them past their limit", async () => {
    const { client, writes } = makeClient({
      order: {
        ...invoiceableOrder,
        customer: { creditBalance: 4500, creditLimit: 5000, creditStatus: "active", paymentTerms: 30 },
      },
    })

    await ensureInvoiceForOrder(client, "so-1")

    expect(writes.customerUpdates[0].creditStatus).toBe("on_hold")
  })

  it("leaves an unlimited account alone", async () => {
    // A zero limit means no limit, not a limit of zero.
    const { client, writes } = makeClient({
      order: {
        ...invoiceableOrder,
        customer: { creditBalance: 90000, creditLimit: 0, creditStatus: "active", paymentTerms: 30 },
      },
    })

    await ensureInvoiceForOrder(client, "so-1")

    expect(writes.customerUpdates[0].creditStatus).toBe("active")
  })

  it("records the charge against the customer's credit history", async () => {
    const { client, writes } = makeClient({ order: invoiceableOrder })

    await ensureInvoiceForOrder(client, "so-1")

    expect(writes.creditTransactions[0]).toMatchObject({
      type: "invoice_charge",
      amount: 1100,
      balanceAfter: 1100,
      referenceType: "invoice",
    })
  })
})
