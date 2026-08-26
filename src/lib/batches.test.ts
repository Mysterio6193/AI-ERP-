import { describe, expect, it } from "vitest"

import { selectFefo, type SelectableBatch } from "@/lib/batches"

/**
 * This is the decision that has to be right. Shipping a lot that is on hold
 * because it happened to expire soonest is a recall, not a bug report — so the
 * hold cases matter more than the arithmetic.
 *
 * Batches arrive already sorted by expiry then received date, which is what the
 * query guarantees.
 */

const day = 86400000
const at = (days: number) => new Date(Date.UTC(2026, 7, 25) + days * day)

const batch = (over: Partial<SelectableBatch> & { batchCode: string }): SelectableBatch => ({
  id: `id-${over.batchCode}`,
  quantity: 100,
  reserved: 0,
  expiryDate: null,
  status: "available",
  ...over,
})

describe("selectFefo", () => {
  it("ships the soonest-expiring lot first", () => {
    const result = selectFefo(
      [
        batch({ batchCode: "SOON", expiryDate: at(5), quantity: 30 }),
        batch({ batchCode: "LATER", expiryDate: at(60), quantity: 50 }),
      ],
      60
    )

    expect(result.allocations.map((a) => a.batchCode)).toEqual(["SOON", "LATER"])
    expect(result.allocations.map((a) => a.quantity)).toEqual([30, 30])
    expect(result.ok).toBe(true)
  })

  it("never ships a lot that is on hold, even when it expires first", () => {
    // The whole point of a hold. Taking it because FEFO says so is a recall.
    const result = selectFefo(
      [
        batch({ batchCode: "HOLD", expiryDate: at(1), quantity: 99, status: "quarantine", holdReason: "awaiting lab result" }),
        batch({ batchCode: "GOOD", expiryDate: at(30), quantity: 50 }),
      ],
      20
    )

    expect(result.allocations.map((a) => a.batchCode)).toEqual(["GOOD"])
    expect(result.blocked[0]).toEqual({ batchCode: "HOLD", quantity: 99, reason: "awaiting lab result" })
  })

  it("says what is held back rather than just falling short", () => {
    // "We have 400 but can only ship 250, because 150 is quarantined" is the
    // answer someone can act on; "insufficient stock" is not.
    const result = selectFefo(
      [
        batch({ batchCode: "HOLD", expiryDate: at(2), quantity: 150, status: "quarantine", holdReason: "damaged pallet" }),
        batch({ batchCode: "GOOD", expiryDate: at(10), quantity: 250 }),
      ],
      400
    )

    expect(result.ok).toBe(false)
    expect(result.unallocated).toBe(150)
    expect(result.blocked[0].reason).toBe("damaged pallet")
  })

  it("falls back to the status when no reason was recorded", () => {
    const result = selectFefo([batch({ batchCode: "H", quantity: 10, status: "expired" })], 5)
    expect(result.blocked[0].reason).toBe("expired")
  })

  it("counts reserved stock as unavailable", () => {
    // Reserved is already promised to another order; shipping it twice is how
    // one customer's pallet leaves on somebody else's truck.
    const result = selectFefo(
      [
        batch({ batchCode: "PARTLY", expiryDate: at(3), quantity: 100, reserved: 90 }),
        batch({ batchCode: "FREE", expiryDate: at(9), quantity: 100 }),
      ],
      30
    )

    expect(result.allocations).toEqual([
      expect.objectContaining({ batchCode: "PARTLY", quantity: 10 }),
      expect.objectContaining({ batchCode: "FREE", quantity: 20 }),
    ])
  })

  it("skips a lot that is entirely reserved without listing it as blocked", () => {
    // Nothing is wrong with it; it is simply spoken for.
    const result = selectFefo(
      [
        batch({ batchCode: "GONE", expiryDate: at(1), quantity: 50, reserved: 50 }),
        batch({ batchCode: "FREE", expiryDate: at(5), quantity: 50 }),
      ],
      10
    )

    expect(result.allocations.map((a) => a.batchCode)).toEqual(["FREE"])
    expect(result.blocked).toEqual([])
  })

  it("takes no more than asked for", () => {
    const result = selectFefo([batch({ batchCode: "BIG", quantity: 1000 })], 7)
    expect(result.allocations[0].quantity).toBe(7)
    expect(result.ok).toBe(true)
  })

  it("reports the shortfall rather than over-allocating", () => {
    const result = selectFefo([batch({ batchCode: "SMALL", quantity: 5 })], 40)
    expect(result.ok).toBe(false)
    expect(result.unallocated).toBe(35)
  })

  it("carries the expiry date through so a picker can check the lot", () => {
    const result = selectFefo([batch({ batchCode: "A", expiryDate: at(4), quantity: 10 })], 5)
    expect(result.allocations[0].expiryDate).toEqual(at(4))
  })

  it("asks for nothing and takes nothing", () => {
    const result = selectFefo([batch({ batchCode: "A", quantity: 10 })], 0)
    expect(result.allocations).toEqual([])
    expect(result.ok).toBe(true)
  })

  it("is not satisfied by an empty shelf", () => {
    const result = selectFefo([], 10)
    expect(result.ok).toBe(false)
    expect(result.unallocated).toBe(10)
  })
})
