import { describe, expect, it } from "vitest"

import { decideCredit, type CreditExposure } from "@/lib/credit"

/**
 * Both ways of being wrong are expensive and neither is visible from the
 * screen: refusing a good customer costs the order and some of the
 * relationship, while letting a bad one through costs the money.
 */

const exposure = (over: Partial<CreditExposure> = {}): CreditExposure => ({
  invoiced: 0,
  openOrders: 0,
  total: 0,
  limit: 10000,
  available: 10000,
  status: "active",
  unlimited: false,
  ...over,
})

describe("decideCredit", () => {
  it("lets an ordinary order through", () => {
    expect(decideCredit(exposure({ total: 1000, available: 9000 }), 500).ok).toBe(true)
  })

  it("refuses a stopped account before considering the amount", () => {
    // A stopped account is not a question about headroom, so even a $1 order
    // and an empty balance must not pass.
    const result = decideCredit(exposure({ status: "stopped" }), 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/stopped/i)
  })

  it("refuses an account on hold", () => {
    const result = decideCredit(exposure({ status: "on_hold" }), 1)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/hold/i)
  })

  it("lets an unlimited account through regardless of size", () => {
    expect(decideCredit(exposure({ unlimited: true, total: 999999 }), 500000).ok).toBe(true)
  })

  it("still stops an unlimited account that is stopped", () => {
    // Unlimited is about the limit, not about whether they may trade at all.
    expect(decideCredit(exposure({ unlimited: true, status: "stopped" }), 10).ok).toBe(false)
  })

  it("counts orders not yet invoiced against the limit", () => {
    // The whole point of exposure: invoiced balance alone would let a customer
    // place unlimited orders that have not reached an invoice yet.
    const result = decideCredit(
      exposure({ invoiced: 3000, openOrders: 6000, total: 9000, limit: 10000, available: 1000 }),
      2000
    )

    expect(result.ok).toBe(false)
  })

  it("explains which part of the exposure is which", () => {
    // "You have no credit left" reads as a dispute when most of it is orders
    // they have not been invoiced for.
    const result = decideCredit(
      exposure({ invoiced: 3000, openOrders: 6000, total: 9000, limit: 10000, available: 1000 }),
      2000
    )

    expect(result.reason).toContain("3000.00 invoiced")
    expect(result.reason).toContain("6000.00 in orders not yet invoiced")
  })

  it("omits the breakdown when there is nothing uninvoiced to explain", () => {
    const result = decideCredit(exposure({ invoiced: 9500, total: 9500, limit: 10000, available: 500 }), 2000)
    expect(result.reason).not.toContain("not yet invoiced")
  })

  it("allows an order that exactly reaches the limit", () => {
    // On the line is within it. Refusing here would block a customer paying
    // down to precisely their limit, which is a normal thing to do.
    expect(decideCredit(exposure({ total: 8000, limit: 10000, available: 2000 }), 2000).ok).toBe(true)
  })

  it("refuses a cent over", () => {
    expect(decideCredit(exposure({ total: 8000, limit: 10000, available: 2000 }), 2000.01).ok).toBe(false)
  })

  it("treats a missing order total as zero rather than failing", () => {
    expect(decideCredit(exposure({ total: 100 }), undefined as unknown as number).ok).toBe(true)
  })

  it("carries the exposure back either way, so the caller can show it", () => {
    expect(decideCredit(exposure(), 10).exposure).toBeDefined()
    expect(decideCredit(exposure({ status: "stopped" }), 10).exposure).toBeDefined()
  })
})
