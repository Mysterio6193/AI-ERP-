import { describe, expect, it } from "vitest"

import { availableQuantity } from "./reservations"

describe("availableQuantity", () => {
  it("is on-hand minus what is promised", () => {
    expect(availableQuantity({ quantity: 10, reserved: 8 })).toBe(2)
    expect(availableQuantity({ quantity: 10, reserved: 0 })).toBe(10)
  })

  it("never goes negative, even when more is promised than exists", () => {
    // Over-promising is possible and must be visible in `reserved`, but
    // "-6 available" reads as a broken figure rather than as no stock.
    expect(availableQuantity({ quantity: 10, reserved: 16 })).toBe(0)
  })

  it("treats a fully reserved item as unsellable, not as in stock", () => {
    // The whole bug: this used to read as 10 available.
    expect(availableQuantity({ quantity: 10, reserved: 10 })).toBe(0)
  })
})
