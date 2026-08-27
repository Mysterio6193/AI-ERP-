import { describe, expect, it } from "vitest"
import type { CustomerLocation } from "@prisma/client"

import {
  buildRouteName,
  deriveDeliveryStatusFromOrder,
  getRouteDate,
  pickLocation,
} from "@/lib/delivery-routes"

/**
 * These four decide which day a pallet goes out, to which address, and what a
 * driver is told about it. Each is a small function whose failure is a physical
 * one — a truck at the wrong door, or a delivery that never appears on a run.
 */

const location = (over: Partial<CustomerLocation> & { id: string }): CustomerLocation =>
  ({
    customerId: "c1",
    label: "Site",
    contactName: null,
    phone: null,
    email: null,
    address: "1 Test St",
    city: null,
    state: null,
    postcode: null,
    isDefault: false,
    isShipping: false,
    isBilling: false,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as CustomerLocation

describe("getRouteDate", () => {
  const orderDate = new Date("2026-08-01T09:00:00")

  it("prefers the requested delivery date", () => {
    const date = getRouteDate({
      deliveryDate: new Date("2026-08-10T14:00:00"),
      requiredDate: new Date("2026-08-05T00:00:00"),
      orderDate,
    })

    expect(date.getDate()).toBe(10)
  })

  it("falls back to when the customer needs it", () => {
    const date = getRouteDate({ deliveryDate: null, requiredDate: new Date("2026-08-05T00:00:00"), orderDate })
    expect(date.getDate()).toBe(5)
  })

  it("falls back to the order date rather than nowhere", () => {
    // An order with no dates must still land on a run; without this it would
    // simply never appear on one.
    const date = getRouteDate({ deliveryDate: null, requiredDate: null, orderDate })
    expect(date.getDate()).toBe(1)
  })

  it("normalises to the start of the day so a run groups correctly", () => {
    const date = getRouteDate({ deliveryDate: new Date("2026-08-10T23:45:00"), orderDate })
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
  })
})

describe("pickLocation", () => {
  const shipping = location({ id: "ship", isShipping: true, label: "Warehouse" })
  const billing = location({ id: "bill", isBilling: true, isDefault: true, label: "Head Office" })

  it("uses the location the order named", () => {
    expect(pickLocation([billing, shipping], "ship")?.id).toBe("ship")
  })

  it("prefers the shipping address over the default", () => {
    // Trade customers bill to an office and receive at a warehouse. Defaulting
    // to the billing address sends a pallet to accounts.
    expect(pickLocation([billing, shipping])?.id).toBe("ship")
  })

  it("falls back to the default when there is no shipping address", () => {
    expect(pickLocation([billing])?.id).toBe("bill")
  })

  it("takes whatever exists rather than nothing", () => {
    const only = location({ id: "only" })
    expect(pickLocation([only])?.id).toBe("only")
  })

  it("returns nothing when the customer has no address at all", () => {
    expect(pickLocation([])).toBeNull()
  })

  it("ignores a named location that is not theirs", () => {
    // A stale id must not silently deliver nowhere; it falls through to the
    // customer's own best address.
    expect(pickLocation([billing, shipping], "someone-elses")?.id).toBe("ship")
  })
})

describe("deriveDeliveryStatusFromOrder", () => {
  it("maps the states that have a delivery meaning", () => {
    expect(deriveDeliveryStatusFromOrder("delivered")).toBe("delivered")
    expect(deriveDeliveryStatusFromOrder("dispatched")).toBe("en_route")
  })

  it("treats everything else as pending", () => {
    // Deliberately conservative: marking a delivery further along than the
    // goods actually are sends a driver for stock still on the shelf.
    for (const status of ["draft", "approved", "picking", "packed", "cancelled", "anything"]) {
      expect(deriveDeliveryStatusFromOrder(status)).toBe("pending")
    }
  })
})

describe("buildRouteName", () => {
  it("names a run by warehouse and day", () => {
    expect(buildRouteName(new Date("2026-08-27T00:00:00"), "Gregory Hills")).toBe("Gregory Hills Run 27 Aug")
  })

  it("still names a run with no warehouse", () => {
    expect(buildRouteName(new Date("2026-08-27T00:00:00"), null)).toBe("Delivery Run 27 Aug")
  })
})
