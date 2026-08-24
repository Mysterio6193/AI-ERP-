import { beforeEach, describe, expect, it, vi } from "vitest"

const postPaymentReceived = vi.fn(async (..._args: unknown[]) => ({ ok: true }))

vi.mock("@/lib/ledger", () => ({
  postPaymentReceived: (...args: unknown[]) => postPaymentReceived(...(args as [])),
}))

vi.mock("@/lib/db", () => ({ db: {} }))

const { recordPayment } = await import("./payments")

/**
 * Every pound a customer pays goes through recordPayment, and it had no tests.
 *
 * Four things must happen together: the Payment row, the invoice balance, the
 * customer's credit balance, and the ledger entry. These cover the cases where
 * getting one of them wrong costs real money — a webhook retry charging twice,
 * an overpayment landing silently, a customer staying blocked after paying.
 *
 * The client is injectable, so this is a unit test with a fake rather than a
 * database round trip.
 */

interface FakeInvoice {
  id: string
  invoiceNumber: string
  customerId: string
  paidAmount: number
  outstandingAmt: number
  status: string
  customer: {
    id: string
    creditBalance: number
    creditLimit: number
    creditStatus: string
  }
}

function makeClient(invoice: FakeInvoice | null, existingPaymentRef?: string) {
  const writes = {
    payments: [] as Array<Record<string, unknown>>,
    invoiceUpdates: [] as Array<Record<string, unknown>>,
    customerUpdates: [] as Array<Record<string, unknown>>,
    creditTransactions: [] as Array<Record<string, unknown>>,
  }

  const client = {
    payment: {
      findFirst: async ({ where }: { where: { reference: string } }) =>
        existingPaymentRef && where.reference === existingPaymentRef
          ? { id: "existing-payment" }
          : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.payments.push(data)
        return { id: `pay-${writes.payments.length}`, ...data }
      },
    },
    invoice: {
      findUnique: async () => invoice,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.invoiceUpdates.push(data)
        return data
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

function invoice(overrides: Partial<FakeInvoice> = {}): FakeInvoice {
  return {
    id: "inv-1",
    invoiceNumber: "INV-2026-00001",
    customerId: "cust-1",
    paidAmount: 0,
    outstandingAmt: 1100,
    status: "sent",
    customer: {
      id: "cust-1",
      creditBalance: 1100,
      creditLimit: 5000,
      creditStatus: "active",
    },
    ...overrides,
  }
}

beforeEach(() => {
  postPaymentReceived.mockClear()
})

describe("recordPayment — refusals", () => {
  it("refuses a zero or negative amount", async () => {
    const { client } = makeClient(invoice())

    for (const amount of [0, -50]) {
      const result = await recordPayment({ invoiceId: "inv-1", amount }, client)
      expect(result.ok, `amount ${amount}`).toBe(false)
    }
  })

  it("refuses an amount that is not a number", async () => {
    const { client } = makeClient(invoice())
    const result = await recordPayment({ invoiceId: "inv-1", amount: Number.NaN }, client)

    expect(result.ok).toBe(false)
  })

  it("refuses when the invoice does not exist", async () => {
    const { client } = makeClient(null)
    const result = await recordPayment({ invoiceId: "missing", amount: 100 }, client)

    expect(result).toEqual({ ok: false, error: "Invoice not found" })
  })

  it("refuses a payment against an invoice already settled", async () => {
    const { client, writes } = makeClient(
      invoice({ outstandingAmt: 0, paidAmount: 1100, status: "paid" })
    )

    const result = await recordPayment({ invoiceId: "inv-1", amount: 100 }, client)

    expect(result.ok).toBe(false)
    // Nothing may be written on a refusal, or the ledger drifts from the books.
    expect(writes.payments).toHaveLength(0)
    expect(postPaymentReceived).not.toHaveBeenCalled()
  })

  it("refuses an overpayment by default", async () => {
    const { client, writes } = makeClient(invoice({ outstandingAmt: 100 }))

    const result = await recordPayment({ invoiceId: "inv-1", amount: 500 }, client)

    expect(result.ok).toBe(false)
    expect(writes.payments).toHaveLength(0)
  })

  it("accepts an overpayment when it is deliberate, but only applies what is owed", async () => {
    const { client, writes } = makeClient(invoice({ outstandingAmt: 100 }))

    const result = await recordPayment(
      { invoiceId: "inv-1", amount: 500, allowOverpayment: true },
      client
    )

    expect(result.ok).toBe(true)
    // Applying the full 500 would drive the invoice negative and take 500 off
    // the customer's credit balance for a 100 debt.
    expect(writes.payments[0].amount).toBe(100)
  })
})

describe("recordPayment — provider retries", () => {
  it("does not charge twice when a webhook is redelivered", async () => {
    // Stripe retries on any non-2xx, so this is a normal event, not an edge
    // case. Recording it twice takes real money off a real balance.
    const { client, writes } = makeClient(invoice(), "evt_stripe_123")

    const result = await recordPayment(
      { invoiceId: "inv-1", amount: 1100, externalId: "evt_stripe_123" },
      client
    )

    expect(result).toEqual({ ok: true, duplicate: true, paymentId: "existing-payment" })
    expect(writes.payments).toHaveLength(0)
    expect(writes.customerUpdates).toHaveLength(0)
    expect(postPaymentReceived).not.toHaveBeenCalled()
  })

  it("records a first-time provider payment and keeps its id for reconciliation", async () => {
    const { client, writes } = makeClient(invoice())

    await recordPayment(
      { invoiceId: "inv-1", amount: 1100, externalId: "evt_stripe_999" },
      client
    )

    expect(writes.payments[0].reference).toBe("evt_stripe_999")
  })
})

describe("recordPayment — what it settles", () => {
  it("marks an invoice paid when the balance reaches zero", async () => {
    const { client, writes } = makeClient(invoice({ outstandingAmt: 1100 }))

    const result = await recordPayment({ invoiceId: "inv-1", amount: 1100 }, client)

    expect(result).toMatchObject({ ok: true, invoiceStatus: "paid", outstanding: 0 })
    expect(writes.invoiceUpdates[0]).toMatchObject({
      paidAmount: 1100,
      outstandingAmt: 0,
      status: "paid",
    })
  })

  it("marks it partial when money is still owed", async () => {
    const { client, writes } = makeClient(invoice({ outstandingAmt: 1100 }))

    const result = await recordPayment({ invoiceId: "inv-1", amount: 400 }, client)

    expect(result).toMatchObject({ ok: true, invoiceStatus: "partial", outstanding: 700 })
    expect(writes.invoiceUpdates[0]).toMatchObject({ paidAmount: 400, status: "partial" })
  })

  it("adds to what was already paid rather than replacing it", async () => {
    const { client, writes } = makeClient(
      invoice({ paidAmount: 300, outstandingAmt: 800, status: "partial" })
    )

    await recordPayment({ invoiceId: "inv-1", amount: 500 }, client)

    expect(writes.invoiceUpdates[0]).toMatchObject({ paidAmount: 800, outstandingAmt: 300 })
  })

  it("keeps money to two decimals", async () => {
    // Repeating fractions from a percentage split must not reach the books.
    const { client, writes } = makeClient(invoice({ outstandingAmt: 100 }))

    await recordPayment({ invoiceId: "inv-1", amount: 33.333 }, client)

    expect(writes.payments[0].amount).toBe(33.33)
    expect(writes.invoiceUpdates[0].outstandingAmt).toBe(66.67)
  })

  it("posts to the ledger exactly once, against the payment it just created", async () => {
    const { client } = makeClient(invoice())

    await recordPayment({ invoiceId: "inv-1", amount: 1100 }, client)

    expect(postPaymentReceived).toHaveBeenCalledTimes(1)
    expect(postPaymentReceived.mock.calls[0][1]).toBe("pay-1")
  })
})

describe("recordPayment — credit", () => {
  it("decrements the credit balance atomically, not by writing a computed total", async () => {
    // A concurrent invoice charge would be lost if this wrote an absolute
    // value read a moment earlier.
    const { client, writes } = makeClient(invoice())

    await recordPayment({ invoiceId: "inv-1", amount: 400 }, client)

    expect(writes.customerUpdates[0].creditBalance).toEqual({ decrement: 400 })
  })

  it("releases a credit hold once the balance is back under the limit", async () => {
    // The bug this guards: a customer who paid stayed blocked from ordering.
    const { client, writes } = makeClient(
      invoice({
        outstandingAmt: 1000,
        customer: { id: "cust-1", creditBalance: 5200, creditLimit: 5000, creditStatus: "on_hold" },
      })
    )

    const result = await recordPayment({ invoiceId: "inv-1", amount: 1000 }, client)

    expect(result).toMatchObject({ creditReleased: true })
    expect(writes.customerUpdates[0]).toMatchObject({ creditStatus: "active" })
  })

  it("leaves the hold in place when the balance is still over the limit", async () => {
    const { client, writes } = makeClient(
      invoice({
        outstandingAmt: 5000,
        customer: { id: "cust-1", creditBalance: 9000, creditLimit: 5000, creditStatus: "on_hold" },
      })
    )

    const result = await recordPayment({ invoiceId: "inv-1", amount: 100 }, client)

    expect(result).toMatchObject({ creditReleased: false })
    expect(writes.customerUpdates[0].creditStatus).toBeUndefined()
  })

  it("does not touch credit status for a customer who was never on hold", async () => {
    const { client, writes } = makeClient(invoice())

    const result = await recordPayment({ invoiceId: "inv-1", amount: 1100 }, client)

    expect(result).toMatchObject({ creditReleased: false })
    expect(writes.customerUpdates[0].creditStatus).toBeUndefined()
  })

  it("writes a credit transaction as a negative movement, referencing the payment", async () => {
    const { client, writes } = makeClient(invoice())

    await recordPayment({ invoiceId: "inv-1", amount: 400, method: "stripe" }, client)

    expect(writes.creditTransactions[0]).toMatchObject({
      type: "payment_received",
      amount: -400,
      referenceType: "payment",
      referenceId: "pay-1",
    })
  })

  it("never reports a credit balance below zero", async () => {
    // Clamped deliberately: a negative balance here is meaningless, though it
    // does hide pre-existing drift.
    const { client, writes } = makeClient(
      invoice({
        outstandingAmt: 900,
        customer: { id: "cust-1", creditBalance: 200, creditLimit: 5000, creditStatus: "active" },
      })
    )

    await recordPayment({ invoiceId: "inv-1", amount: 900 }, client)

    expect(writes.creditTransactions[0].balanceAfter).toBe(0)
  })
})
