import { describe, expect, it } from "vitest"

import { canTransition, RETURN_STATUSES } from "./returns"

/**
 * The lifecycle guard is what stops goods being restocked while they are still
 * at the customer, and what stops a credit note being issued for goods nobody
 * has checked. Both used to be possible because the lifecycle did not exist.
 */

describe("canTransition", () => {
  it("allows the normal path", () => {
    expect(canTransition("pending", "approved")).toBe(true)
    expect(canTransition("approved", "received")).toBe(true)
    expect(canTransition("received", "completed")).toBe(true)
  })

  it("refuses receiving before approval", () => {
    // The goods are still at the customer at this point.
    expect(canTransition("pending", "received")).toBe(false)
  })

  it("refuses completing before the goods are back", () => {
    // Completing issues a credit note; doing it early refunds unchecked goods.
    expect(canTransition("pending", "completed")).toBe(false)
    expect(canTransition("approved", "completed")).toBe(false)
  })

  it("allows rejection until the goods have arrived", () => {
    expect(canTransition("pending", "rejected")).toBe(true)
    expect(canTransition("approved", "rejected")).toBe(true)
    expect(canTransition("received", "rejected")).toBe(false)
  })

  it("treats completed and rejected as terminal", () => {
    for (const status of RETURN_STATUSES) {
      expect(canTransition("completed", status)).toBe(false)
      expect(canTransition("rejected", status)).toBe(false)
    }
  })

  it("refuses to repeat a step", () => {
    expect(canTransition("received", "received")).toBe(false)
    expect(canTransition("approved", "approved")).toBe(false)
  })

  it("refuses an unknown status rather than defaulting to allow", () => {
    expect(canTransition("banana", "completed")).toBe(false)
    expect(canTransition("pending", "banana")).toBe(false)
  })
})
