import { beforeEach, describe, expect, it, vi } from "vitest"

type JournalEntry = { lines: Array<{ accountCode: string; debit?: number; credit?: number }> }
const postJournal = vi.fn(async (_db: unknown, _entry: JournalEntry) => ({ ok: true }))

vi.mock("@/lib/ledger", () => ({
  postJournal: (db: unknown, entry: JournalEntry) => postJournal(db, entry),
  ACCOUNTS: {
    goodsReceivedNotInvoiced: "2050",
    taxPayable: "2100",
    accountsPayable: "2000",
    bank: "1000",
  },
}))
vi.mock("@/lib/settings/service", () => ({ getSettings: async () => ({}) }))
// Real date arithmetic from the issue date — the calculation itself is tested
// in invoicing.test.ts; what matters here is that the supplier's own terms are
// the input.
vi.mock("@/lib/invoicing", () => ({
  computeDueDate: ({ issuedAt, paymentTerms }: { issuedAt: Date; paymentTerms: number }) =>
    new Date(issuedAt.getTime() + (paymentTerms || 0) * 86400000),
}))
vi.mock("@/lib/db", () => ({ db: {} }))

const { recordSupplierInvoice, recordSupplierPayment } = await import("./payables")

/**
 * Money going out to suppliers, and it had no tests.
 *
 * The costly mistakes here are paying the same invoice twice because a supplier
 * re-sent it, and over-applying a payment so the balance goes negative and the
 * error hides itself.
 */

function makeClient(options: {
  supplier?: Record<string, unknown> | null
  existingInvoice?: { id: string } | null
  invoice?: Record<string, unknown> | null
  seenPayment?: { id: string } | null
} = {}) {
  const writes = {
    supplierInvoices: [] as Array<Record<string, unknown>>,
    invoiceUpdates: [] as Array<Record<string, unknown>>,
    payments: [] as Array<Record<string, unknown>>,
  }

  const client = {
    supplier: {
      findUnique: async () =>
        options.supplier === undefined
          ? { id: "sup-1", name: "Fresh Farm Dairy", companyId: "co-1", paymentTerms: 30 }
          : options.supplier,
    },
    supplierInvoice: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        "supplierId_invoiceNumber" in where
          ? (options.existingInvoice ?? null)
          : (options.invoice ?? null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.supplierInvoices.push(data)
        return { id: "sinv-1" }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.invoiceUpdates.push(data)
        return data
      },
    },
    supplierPayment: {
      findFirst: async () => options.seenPayment ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.payments.push(data)
        return { id: "spay-1" }
      },
    },
  }

  return { client: client as never, writes }
}

function supplierInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "sinv-1",
    invoiceNumber: "FFD-8842",
    companyId: "co-1",
    totalAmount: 1100,
    paidAmount: 0,
    outstandingAmt: 1100,
    supplier: { name: "Fresh Farm Dairy" },
    ...overrides,
  }
}

const invoiceInput = { supplierId: "sup-1", invoiceNumber: "FFD-8842", subtotal: 1000, taxAmount: 100 }

beforeEach(() => postJournal.mockClear())

describe("recordSupplierInvoice", () => {
  it("refuses a zero or negative bill", async () => {
    const { client } = makeClient()

    const result = await recordSupplierInvoice(client, { ...invoiceInput, subtotal: 0, taxAmount: 0 })

    expect(result.ok).toBe(false)
  })

  it("refuses an unknown supplier", async () => {
    const { client } = makeClient({ supplier: null })

    expect(await recordSupplierInvoice(client, invoiceInput)).toMatchObject({
      ok: false,
      error: "Supplier not found",
    })
  })

  it("does not record the same supplier invoice number twice", async () => {
    // Suppliers re-send invoices. Recording it again would double the payable.
    const { client, writes } = makeClient({ existingInvoice: { id: "sinv-existing" } })

    const result = await recordSupplierInvoice(client, invoiceInput)

    expect(result).toMatchObject({ ok: true, duplicate: true, invoiceId: "sinv-existing" })
    expect(writes.supplierInvoices).toHaveLength(0)
    expect(postJournal).not.toHaveBeenCalled()
  })

  it("records it unpaid for the full amount", async () => {
    const { client, writes } = makeClient()

    const result = await recordSupplierInvoice(client, invoiceInput)

    expect(result).toMatchObject({ ok: true, duplicate: false, totalAmount: 1100 })
    expect(writes.supplierInvoices[0]).toMatchObject({
      totalAmount: 1100,
      outstandingAmt: 1100,
      paidAmount: 0,
      status: "unpaid",
    })
  })

  it("uses the supplier's own payment terms for the due date", async () => {
    // One definition of "Net 30" across the business rather than two. The
    // supplier fixture is Net 30, so the due date is 30 days after issue.
    const { client, writes } = makeClient()
    const issued = new Date("2026-02-01T00:00:00Z")

    await recordSupplierInvoice(client, { ...invoiceInput, invoiceDate: issued })

    const due = writes.supplierInvoices[0].dueDate as Date
    expect(Math.round((due.getTime() - issued.getTime()) / 86400000)).toBe(30)
  })

  it("clears goods-received into a real payable, and it balances", async () => {
    const { client } = makeClient()

    await recordSupplierInvoice(client, invoiceInput)

    const entry = postJournal.mock.calls[0][1]

    expect(entry.lines).toEqual([
      { accountCode: "2050", debit: 1000 },
      { accountCode: "2100", debit: 100 },
      { accountCode: "2000", credit: 1100 },
    ])

    const debits = entry.lines.reduce((s, l) => s + (l.debit || 0), 0)
    const credits = entry.lines.reduce((s, l) => s + (l.credit || 0), 0)
    expect(debits).toBe(credits)
  })
})

describe("recordSupplierPayment", () => {
  it("refuses a zero or negative payment", async () => {
    const { client } = makeClient({ invoice: supplierInvoice() })

    expect((await recordSupplierPayment(client, { supplierInvoiceId: "sinv-1", amount: 0 })).ok).toBe(
      false
    )
  })

  it("refuses against an invoice that does not exist", async () => {
    const { client } = makeClient({ invoice: null })

    expect(await recordSupplierPayment(client, { supplierInvoiceId: "gone", amount: 100 })).toMatchObject(
      { ok: false, error: "Supplier invoice not found" }
    )
  })

  it("does not pay twice on the same bank reference", async () => {
    const { client, writes } = makeClient({
      invoice: supplierInvoice(),
      seenPayment: { id: "spay-existing" },
    })

    const result = await recordSupplierPayment(client, {
      supplierInvoiceId: "sinv-1",
      amount: 1100,
      reference: "EFT-99213",
    })

    expect(result).toMatchObject({ ok: true, duplicate: true })
    expect(writes.payments).toHaveLength(0)
    expect(postJournal).not.toHaveBeenCalled()
  })

  it("refuses when nothing is left owing", async () => {
    const { client, writes } = makeClient({
      invoice: supplierInvoice({ outstandingAmt: 0, paidAmount: 1100 }),
    })

    const result = await recordSupplierPayment(client, { supplierInvoiceId: "sinv-1", amount: 50 })

    expect(result.ok).toBe(false)
    expect(writes.payments).toHaveLength(0)
  })

  it("never over-applies, because a negative balance hides the mistake", async () => {
    const { client, writes } = makeClient({
      invoice: supplierInvoice({ totalAmount: 200, outstandingAmt: 200 }),
    })

    const result = await recordSupplierPayment(client, { supplierInvoiceId: "sinv-1", amount: 900 })

    expect(result).toMatchObject({ ok: true, applied: 200, outstanding: 0, status: "paid" })
    expect(writes.payments[0].amount).toBe(200)
  })

  it("marks it partial while money is still owed", async () => {
    const { client, writes } = makeClient({ invoice: supplierInvoice() })

    const result = await recordSupplierPayment(client, { supplierInvoiceId: "sinv-1", amount: 400 })

    expect(result).toMatchObject({ applied: 400, outstanding: 700, status: "partial" })
    expect(writes.invoiceUpdates[0]).toMatchObject({ paidAmount: 400, status: "partial" })
  })

  it("adds to what was already paid rather than replacing it", async () => {
    const { client, writes } = makeClient({
      invoice: supplierInvoice({ paidAmount: 300, outstandingAmt: 800 }),
    })

    await recordSupplierPayment(client, { supplierInvoiceId: "sinv-1", amount: 500 })

    expect(writes.invoiceUpdates[0]).toMatchObject({ paidAmount: 800, outstandingAmt: 300 })
  })

  it("moves the money from the payable to the bank, and it balances", async () => {
    const { client } = makeClient({ invoice: supplierInvoice() })

    await recordSupplierPayment(client, { supplierInvoiceId: "sinv-1", amount: 1100 })

    const entry = postJournal.mock.calls[0][1]

    expect(entry.lines).toEqual([
      { accountCode: "2000", debit: 1100 },
      { accountCode: "1000", credit: 1100 },
    ])
  })

  it("posts only what was applied, not what was offered", async () => {
    // An over-payment must not put more through the ledger than the books took.
    const { client } = makeClient({
      invoice: supplierInvoice({ totalAmount: 200, outstandingAmt: 200 }),
    })

    await recordSupplierPayment(client, { supplierInvoiceId: "sinv-1", amount: 900 })

    const entry = postJournal.mock.calls[0][1]
    expect(entry.lines[0].debit).toBe(200)
  })
})

describe("recordSupplierPayment — how the new balance is derived", () => {
  it("recomputes outstanding from the invoice total, not by subtracting from the old outstanding", async () => {
    // Worth pinning because the two are not the same calculation: the payment
    // is capped using outstandingAmt, but the new balance comes from
    // totalAmount - paidAmount. While those agree — which is how every invoice
    // is written today — the result is identical. If anything ever reduces
    // outstandingAmt without moving paidAmount, a later payment would quietly
    // restore the balance to the higher figure.
    const { client, writes } = makeClient({
      invoice: supplierInvoice({ totalAmount: 1100, paidAmount: 0, outstandingAmt: 200 }),
    })

    const result = await recordSupplierPayment(client, { supplierInvoiceId: "sinv-1", amount: 900 })

    expect(result).toMatchObject({ applied: 200, outstanding: 900 })
    expect(writes.invoiceUpdates[0]).toMatchObject({ paidAmount: 200, outstandingAmt: 900 })
  })
})
