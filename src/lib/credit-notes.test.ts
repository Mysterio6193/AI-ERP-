import { beforeEach, describe, expect, it, vi } from "vitest"

type JournalEntry = { lines: Array<{ accountCode: string; debit?: number; credit?: number }> }
const postJournal = vi.fn(async (_db: unknown, _entry: JournalEntry) => ({ ok: true }))

vi.mock("@/lib/ledger", () => ({
  postJournal: (db: unknown, entry: JournalEntry) => postJournal(db, entry),
  ACCOUNTS: {
    salesRevenue: "4000",
    taxPayable: "2100",
    accountsReceivable: "1100",
  },
}))
vi.mock("@/lib/numbering", () => ({ nextDocumentNumber: async () => "CN-2026-0007" }))
vi.mock("@/lib/db", () => ({ db: {} }))

const { issueCreditNote } = await import("./credit-notes")

/**
 * Money going back out to a customer, and it had no tests.
 *
 * A credit note reduces what someone owes, so the failure modes are expensive
 * in both directions: crediting more than the invoice was ever worth, crediting
 * one customer against another's invoice, or leaving a fully credited invoice
 * still reading as owing.
 */

function makeClient(options: {
  invoice?: Record<string, unknown> | null
  alreadyCredited?: { amount: number; taxAmount: number }
  customerAfter?: { creditBalance: number; creditLimit: number; creditStatus: string }
} = {}) {
  const writes = {
    creditNotes: [] as Array<Record<string, unknown>>,
    invoiceUpdates: [] as Array<Record<string, unknown>>,
    customerUpdates: [] as Array<Record<string, unknown>>,
    creditTransactions: [] as Array<Record<string, unknown>>,
  }

  const client = {
    invoice: {
      findUnique: async () => options.invoice ?? null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.invoiceUpdates.push(data)
        return data
      },
    },
    creditNote: {
      aggregate: async () => ({
        _sum: {
          amount: options.alreadyCredited?.amount ?? 0,
          taxAmount: options.alreadyCredited?.taxAmount ?? 0,
        },
      }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.creditNotes.push(data)
        return { id: "cn-1", cnNumber: "CN-2026-0007" }
      },
    },
    customer: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.customerUpdates.push(data)
        return (
          options.customerAfter ?? { creditBalance: 0, creditLimit: 5000, creditStatus: "active" }
        )
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

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    invoiceNumber: "INV-2026-00001",
    companyId: "co-1",
    customerId: "cust-1",
    totalAmount: 1100,
    paidAmount: 0,
    outstandingAmt: 1100,
    status: "unpaid",
    ...overrides,
  }
}

const base = { customerId: "cust-1", amount: 500, taxAmount: 50, reason: "Damaged in transit" }

beforeEach(() => postJournal.mockClear())

describe("issueCreditNote — refusals", () => {
  it("refuses a zero or negative credit", async () => {
    const { client } = makeClient()

    for (const amount of [0, -100]) {
      expect((await issueCreditNote(client, { ...base, amount, taxAmount: 0 })).ok).toBe(false)
    }
  })

  it("refuses one with no reason", async () => {
    // A credit with no stated reason is indistinguishable from a mistake when
    // someone reads it back months later.
    const { client } = makeClient()

    expect((await issueCreditNote(client, { ...base, reason: "   " })).ok).toBe(false)
  })

  it("refuses when the named invoice does not exist", async () => {
    const { client } = makeClient({ invoice: null })

    const result = await issueCreditNote(client, { ...base, invoiceId: "gone" })

    expect(result).toMatchObject({ ok: false, error: "Invoice not found" })
  })

  it("refuses to credit one customer against another's invoice", async () => {
    const { client, writes } = makeClient({ invoice: invoice({ customerId: "someone-else" }) })

    const result = await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(result.ok).toBe(false)
    expect(writes.creditNotes).toHaveLength(0)
  })

  it("refuses to credit more than the invoice was ever worth", async () => {
    // The usual double-credit route: two people crediting the same complaint.
    const { client, writes } = makeClient({
      invoice: invoice({ totalAmount: 1100 }),
      alreadyCredited: { amount: 700, taxAmount: 70 },
    })

    const result = await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toContain("1100")
    expect(writes.creditNotes).toHaveLength(0)
    expect(postJournal).not.toHaveBeenCalled()
  })

  it("allows a credit that exactly exhausts the invoice", async () => {
    const { client } = makeClient({
      invoice: invoice({ totalAmount: 1100 }),
      alreadyCredited: { amount: 500, taxAmount: 50 },
    })

    const result = await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(result.ok).toBe(true)
  })
})

describe("issueCreditNote — what it settles", () => {
  it("brings the invoice outstanding down by the credited total", async () => {
    const { client, writes } = makeClient({ invoice: invoice({ outstandingAmt: 1100 }) })

    const result = await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(result).toMatchObject({ ok: true, total: 550, invoiceOutstanding: 550 })
    expect(writes.invoiceUpdates[0]).toMatchObject({ outstandingAmt: 550 })
  })

  it("marks a fully credited unpaid invoice as credited, not paid", async () => {
    // Nobody paid it. Recording it as paid would overstate cash received.
    const { client, writes } = makeClient({ invoice: invoice({ outstandingAmt: 550 }) })

    await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(writes.invoiceUpdates[0]).toMatchObject({ outstandingAmt: 0, status: "credited" })
  })

  it("marks it paid when the customer had already paid something", async () => {
    const { client, writes } = makeClient({
      invoice: invoice({ outstandingAmt: 550, paidAmount: 550 }),
    })

    await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(writes.invoiceUpdates[0]).toMatchObject({ status: "paid" })
  })

  it("never drives outstanding below zero", async () => {
    const { client, writes } = makeClient({ invoice: invoice({ outstandingAmt: 100 }) })

    const result = await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(writes.invoiceUpdates[0].outstandingAmt).toBe(0)
    expect(result).toMatchObject({ invoiceOutstanding: 0 })
  })

  it("issues a standalone credit with no invoice attached", async () => {
    const { client, writes } = makeClient({ invoice: null })

    const result = await issueCreditNote(client, { ...base, companyId: "co-1" })

    expect(result.ok).toBe(true)
    expect(writes.creditNotes[0]).toMatchObject({ invoiceId: null, appliedAmount: 0 })
    expect(writes.invoiceUpdates).toHaveLength(0)
  })
})

describe("issueCreditNote — credit and the ledger", () => {
  it("reduces the customer's balance atomically", async () => {
    const { client, writes } = makeClient({ invoice: invoice() })

    await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(writes.customerUpdates[0].creditBalance).toEqual({ decrement: 550 })
  })

  it("releases a credit hold when the credit brings them back under the limit", async () => {
    const { client, writes } = makeClient({
      invoice: invoice(),
      customerAfter: { creditBalance: 4000, creditLimit: 5000, creditStatus: "on_hold" },
    })

    await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(writes.customerUpdates[1]).toMatchObject({ creditStatus: "active" })
  })

  it("leaves the hold when they are still over", async () => {
    const { client, writes } = makeClient({
      invoice: invoice(),
      customerAfter: { creditBalance: 9000, creditLimit: 5000, creditStatus: "on_hold" },
    })

    await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(writes.customerUpdates).toHaveLength(1)
  })

  it("records the movement as a negative refund against the credit note", async () => {
    const { client, writes } = makeClient({ invoice: invoice() })

    await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    expect(writes.creditTransactions[0]).toMatchObject({
      type: "refund",
      amount: -550,
      referenceType: "credit_note",
    })
  })

  it("posts the exact reverse of the invoice entry, and it balances", async () => {
    // Without this, ledger receivables never came down while the customer's
    // balance did, and the books drifted.
    const { client } = makeClient({ invoice: invoice() })

    await issueCreditNote(client, { ...base, invoiceId: "inv-1" })

    const entry = postJournal.mock.calls[0][1]

    const debits = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
    const credits = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0)

    expect(debits).toBe(credits)
    expect(entry.lines).toEqual([
      { accountCode: "4000", debit: 500 },
      { accountCode: "2100", debit: 50 },
      { accountCode: "1100", credit: 550 },
    ])
  })
})
