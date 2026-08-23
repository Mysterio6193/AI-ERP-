import { describe, expect, it } from "vitest"

import { accountForCategory, canTransition, EXPENSE_CATEGORIES } from "./expenses"

describe("accountForCategory", () => {
  it("files each category in its own account", () => {
    expect(accountForCategory("rent")).toBe("6200")
    expect(accountForCategory("utilities")).toBe("6300")
    expect(accountForCategory("marketing")).toBe("6400")
    expect(accountForCategory("salary")).toBe("6500")
  })

  it("gives every offered category a real account", () => {
    for (const category of EXPENSE_CATEGORIES) {
      expect(accountForCategory(category), category).toMatch(/^\d{4}$/)
    }
  })

  it("falls back to General Expenses rather than rejecting an unknown category", () => {
    // A cost that cannot be filed still has to appear somewhere; refusing it
    // would leave it off the books entirely.
    expect(accountForCategory("something-new")).toBe("6900")
    expect(accountForCategory("")).toBe("6900")
  })

  it("is case-insensitive, since categories arrive from forms and imports", () => {
    expect(accountForCategory("RENT")).toBe("6200")
  })
})

describe("canTransition", () => {
  it("allows the normal path", () => {
    expect(canTransition("pending", "approved")).toBe(true)
    expect(canTransition("approved", "paid")).toBe(true)
  })

  it("allows rejecting before payment", () => {
    expect(canTransition("pending", "rejected")).toBe(true)
    expect(canTransition("approved", "rejected")).toBe(true)
  })

  it("refuses to un-pay money that has already left the bank", () => {
    // The ledger entry would still be sitting there.
    expect(canTransition("paid", "pending")).toBe(false)
    expect(canTransition("paid", "approved")).toBe(false)
    expect(canTransition("paid", "rejected")).toBe(false)
  })

  it("treats a rejected expense as finished", () => {
    expect(canTransition("rejected", "approved")).toBe(false)
    expect(canTransition("rejected", "paid")).toBe(false)
  })

  it("refuses to skip approval and pay a pending expense", () => {
    // Paying straight from pending would settle a liability never booked.
    expect(canTransition("pending", "paid")).toBe(false)
  })

  it("rejects an unknown status rather than assuming it is fine", () => {
    expect(canTransition("nonsense", "paid")).toBe(false)
    expect(canTransition("pending", "nonsense")).toBe(false)
  })
})
