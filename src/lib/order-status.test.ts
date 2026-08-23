import { describe, expect, it } from "vitest"

import { checkTransition, ORDER_STATUSES, ORDER_TRANSITIONS } from "./order-status"

describe("checkTransition", () => {
  it("allows the normal path through the lifecycle", () => {
    const path = ["draft", "approved", "picking", "packed", "dispatched", "delivered", "invoiced"]

    for (let i = 0; i < path.length - 1; i++) {
      const result = checkTransition(path[i], path[i + 1])
      expect(result.allowed, `${path[i]} -> ${path[i + 1]}: ${result.reason}`).toBe(true)
    }
  })

  it("refuses to deliver something that never shipped", () => {
    // Dispatch is what takes stock off the shelf; skipping it would deliver
    // goods the system still believes are in the warehouse.
    const result = checkTransition("approved", "delivered")

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("cannot go from approved to delivered")
  })

  it("refuses to cancel goods that are already on a truck", () => {
    // Once dispatched the answer is a return, not a cancellation — cancelling
    // would release a reservation for stock that has physically gone.
    expect(checkTransition("dispatched", "cancelled").allowed).toBe(false)
    expect(checkTransition("delivered", "cancelled").allowed).toBe(false)
  })

  it("treats invoiced and cancelled as final", () => {
    expect(checkTransition("invoiced", "draft").allowed).toBe(false)
    expect(checkTransition("cancelled", "approved").allowed).toBe(false)
    expect(checkTransition("invoiced", "draft").reason).toContain("final status")
  })

  it("allows staying put, because a re-sent status is a retry", () => {
    for (const status of ORDER_STATUSES) {
      expect(checkTransition(status, status).allowed, status).toBe(true)
    }
  })

  it("rejects a status that does not exist", () => {
    // "confirmed" renders in the UI but is in no fulfilment eligibility set,
    // so an order parked there is invisible to fulfilment forever.
    expect(checkTransition("draft", "confirmed").allowed).toBe(false)
    expect(checkTransition("draft", "nonsense").allowed).toBe(false)
  })

  it("does not strand an order already in an unknown status", () => {
    // Refusing here would make a bad state permanent.
    expect(checkTransition("confirmed", "approved").allowed).toBe(true)
  })

  it("lets anything unshipped be cancelled", () => {
    for (const status of ["draft", "pending_approval", "approved", "picking", "packed"]) {
      expect(checkTransition(status, "cancelled").allowed, status).toBe(true)
    }
  })

  it("names a real destination for every status that has one", () => {
    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      for (const to of targets) {
        expect(ORDER_STATUSES, `${from} -> ${to}`).toContain(to)
      }
    }
  })
})
