import { describe, expect, it } from "vitest"

import { ACCOUNTS, entryNumberFor } from "./ledger"

describe("entryNumberFor", () => {
  it("is deterministic, so the unique constraint enforces once-only posting", () => {
    // A timestamped number would let the same invoice post twice on a retry.
    expect(entryNumberFor("invoice", "abc123")).toBe("JE-invoice-abc123")
    expect(entryNumberFor("invoice", "abc123")).toBe(entryNumberFor("invoice", "abc123"))
  })

  it("distinguishes documents and document types", () => {
    expect(entryNumberFor("invoice", "a")).not.toBe(entryNumberFor("payment", "a"))
    expect(entryNumberFor("invoice", "a")).not.toBe(entryNumberFor("invoice", "b"))
  })

  it("separates staged receipts on one purchase order", () => {
    // A PO received in two deliveries must post twice, not once.
    expect(entryNumberFor("purchase_receipt", "po1:line1:10")).not.toBe(
      entryNumberFor("purchase_receipt", "po1:line1:25")
    )
  })

  it("stays within the column, however long the ids are", () => {
    expect(entryNumberFor("purchase_receipt", "x".repeat(400)).length).toBeLessThanOrEqual(190)
  })
})

describe("account codes", () => {
  it("keeps tax separate from revenue", () => {
    // GST collected is owed onward, not earned. Booking it as revenue
    // overstates income by the tax on every invoice.
    expect(ACCOUNTS.taxPayable).not.toBe(ACCOUNTS.salesRevenue)
  })

  it("names every account the posting helpers reference", () => {
    for (const code of Object.values(ACCOUNTS)) {
      expect(code).toMatch(/^\d{4}$/)
    }
  })
})
