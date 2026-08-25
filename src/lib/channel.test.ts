import { describe, expect, it } from "vitest"
import { canSupply, checkSupplyLink, ordersExpectedFrom, summariseChannel } from "@/lib/channel"

describe("ordersExpectedFrom", () => {
  it("expects orders from a distributor and a direct account", () => {
    expect(ordersExpectedFrom("distributor")).toBe(true)
    expect(ordersExpectedFrom("direct")).toBe(true)
  })

  it("expects none from an end user", () => {
    // A venue buys from its distributor. Silence here is the design, not churn.
    expect(ordersExpectedFrom("end_user")).toBe(false)
  })

  it("treats an unset role as ordering directly", () => {
    // Existing accounts predate the column and did buy direct.
    expect(ordersExpectedFrom(null)).toBe(true)
    expect(ordersExpectedFrom(undefined)).toBe(true)
  })
})

describe("canSupply", () => {
  it("is true only for a distributor", () => {
    expect(canSupply("distributor")).toBe(true)
    expect(canSupply("end_user")).toBe(false)
    expect(canSupply("direct")).toBe(false)
    expect(canSupply(null)).toBe(false)
  })
})

describe("checkSupplyLink", () => {
  const venue = { customerId: "venue", customerRole: "end_user" }

  it("accepts a venue supplied by a distributor", () => {
    expect(
      checkSupplyLink({ ...venue, supplierId: "pfd", supplierRole: "distributor" })
    ).toEqual({ ok: true })
  })

  it("accepts clearing the link", () => {
    expect(checkSupplyLink({ ...venue, supplierId: null, supplierRole: null }).ok).toBe(true)
  })

  it("refuses an account supplying itself", () => {
    // Nothing in the database stops this — it is a self-referencing key.
    const result = checkSupplyLink({ ...venue, supplierId: "venue", supplierRole: "end_user" })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/its own supplier/)
  })

  it("refuses a supplier that is not a distributor, and says how to fix it", () => {
    const result = checkSupplyLink({ ...venue, supplierId: "other", supplierRole: "end_user" })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/channel role/i)
  })

  it("refuses a distributor being supplied by another distributor", () => {
    const result = checkSupplyLink({
      customerId: "small",
      customerRole: "distributor",
      supplierId: "pfd",
      supplierRole: "distributor",
    })
    expect(result.ok).toBe(false)
  })
})

describe("summariseChannel", () => {
  it("counts each role", () => {
    const counts = summariseChannel([
      { channelRole: "distributor", suppliedById: null },
      { channelRole: "end_user", suppliedById: "pfd" },
      { channelRole: "end_user", suppliedById: null },
      { channelRole: "direct", suppliedById: null },
    ])

    expect(counts).toEqual({ direct: 1, distributor: 1, endUser: 2, unlinkedEndUsers: 1 })
  })

  it("counts an unset role as direct", () => {
    expect(summariseChannel([{ channelRole: null, suppliedById: null }]).direct).toBe(1)
  })

  it("flags venues whose distributor is unknown", () => {
    // A venue nobody can be told where to buy from.
    const counts = summariseChannel([
      { channelRole: "end_user", suppliedById: null },
      { channelRole: "end_user", suppliedById: null },
    ])
    expect(counts.unlinkedEndUsers).toBe(2)
  })
})
