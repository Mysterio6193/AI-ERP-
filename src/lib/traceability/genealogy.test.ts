import { describe, expect, it } from "vitest"

import {
  buildLotGraph,
  recallScope,
  traceBackward,
  traceForward,
  type LotLink,
  type LotShipmentRow,
} from "./genealogy"

/**
 * A three-level chain, which is the case the old one-hop trace could not see:
 *
 *   FLOUR-A ─┐
 *            ├─> DOUGH-1 ──> BASE-1 ──> PIZZA-1
 *   WATER-A ─┘
 */
const chain: LotLink[] = [
  { parentLot: "FLOUR-A", childLot: "DOUGH-1", quantity: 50, productId: "flour", productName: "Flour" },
  { parentLot: "WATER-A", childLot: "DOUGH-1", quantity: 30, productId: "water", productName: "Water" },
  { parentLot: "DOUGH-1", childLot: "BASE-1", quantity: 80, productId: "dough", productName: "Dough" },
  { parentLot: "BASE-1", childLot: "PIZZA-1", quantity: 60, productId: "base", productName: "Base" },
]

describe("traceBackward", () => {
  it("walks past the first hop", () => {
    const result = traceBackward("PIZZA-1", buildLotGraph(chain))
    const lots = result.nodes.map((node) => node.lot)

    expect(lots).toContain("BASE-1")
    expect(lots).toContain("DOUGH-1")
    // The whole point: the flour is three hops up and still has to be found.
    expect(lots).toContain("FLOUR-A")
    expect(lots).toContain("WATER-A")
  })

  it("reports the true number of hops", () => {
    const result = traceBackward("PIZZA-1", buildLotGraph(chain))
    const depth = Object.fromEntries(result.nodes.map((node) => [node.lot, node.depth]))

    expect(depth["BASE-1"]).toBe(1)
    expect(depth["DOUGH-1"]).toBe(2)
    expect(depth["FLOUR-A"]).toBe(3)
  })

  it("returns nothing for a lot with no inputs", () => {
    const result = traceBackward("FLOUR-A", buildLotGraph(chain))
    expect(result.nodes).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it("returns nothing for a lot nobody has heard of", () => {
    const result = traceBackward("NOPE", buildLotGraph(chain))
    expect(result.nodes).toEqual([])
  })
})

describe("traceForward", () => {
  it("follows a lot all the way to the finished product", () => {
    const result = traceForward("FLOUR-A", buildLotGraph(chain))
    const lots = result.nodes.map((node) => node.lot)

    expect(lots).toEqual(["DOUGH-1", "BASE-1", "PIZZA-1"])
  })

  it("finds every branch when a lot was split across runs", () => {
    const split: LotLink[] = [
      { parentLot: "FLOUR-A", childLot: "DOUGH-1", quantity: 50, productId: "flour" },
      { parentLot: "FLOUR-A", childLot: "DOUGH-2", quantity: 40, productId: "flour" },
      { parentLot: "DOUGH-2", childLot: "BASE-9", quantity: 40, productId: "dough" },
    ]

    const lots = traceForward("FLOUR-A", buildLotGraph(split)).nodes.map((node) => node.lot)

    expect(new Set(lots)).toEqual(new Set(["DOUGH-1", "DOUGH-2", "BASE-9"]))
  })
})

describe("the walk's awkward shapes", () => {
  it("does not loop forever when rework feeds a lot back into itself", () => {
    // This should not happen and does: a batch is reworked into a later batch
    // of the same product, and someone records the lot code both ways.
    const cyclic: LotLink[] = [
      { parentLot: "A", childLot: "B", quantity: 1, productId: "p" },
      { parentLot: "B", childLot: "C", quantity: 1, productId: "p" },
      { parentLot: "C", childLot: "A", quantity: 1, productId: "p" },
    ]

    const result = traceForward("A", buildLotGraph(cyclic))

    expect(result.nodes.map((node) => node.lot)).toEqual(["B", "C"])
    expect(result.revisited).toContain("A")
  })

  it("counts a lot once when two paths reach it", () => {
    // A diamond: DOUGH-1 is reached via both FLOUR and WATER.
    const result = traceBackward("BASE-1", buildLotGraph(chain))
    const doughNodes = result.nodes.filter((node) => node.lot === "DOUGH-1")

    expect(doughNodes).toHaveLength(1)
  })

  it("reports the shallowest depth, not the first path found", () => {
    // X reaches Z directly and also through Y. Depth-first would label Z as
    // two hops if it happened to walk that branch first.
    const diamond: LotLink[] = [
      { parentLot: "X", childLot: "Y", quantity: 1, productId: "p" },
      { parentLot: "Y", childLot: "Z", quantity: 1, productId: "p" },
      { parentLot: "X", childLot: "Z", quantity: 1, productId: "p" },
    ]

    const result = traceForward("X", buildLotGraph(diamond))
    const z = result.nodes.find((node) => node.lot === "Z")

    expect(z?.depth).toBe(1)
  })

  it("drops a lot recorded as consuming itself", () => {
    const graph = buildLotGraph([{ parentLot: "A", childLot: "A", quantity: 1, productId: "p" }])

    expect(traceForward("A", graph).nodes).toEqual([])
    expect(traceBackward("A", graph).nodes).toEqual([])
  })

  it("says so when it stopped at the depth limit", () => {
    const result = traceForward("FLOUR-A", buildLotGraph(chain), 2)

    expect(result.nodes.map((node) => node.lot)).toEqual(["DOUGH-1", "BASE-1"])
    expect(result.truncated).toBe(true)
  })

  it("does not claim truncation when the chain simply ended", () => {
    // Exactly deep enough. Saying "there may be more" here would send someone
    // looking for records that do not exist.
    const result = traceForward("FLOUR-A", buildLotGraph(chain), 3)

    expect(result.nodes).toHaveLength(3)
    expect(result.truncated).toBe(false)
  })
})

describe("recallScope", () => {
  const shipments: LotShipmentRow[] = [
    {
      lot: "PIZZA-1",
      productId: "pizza",
      quantity: 12,
      customerId: "c1",
      customerName: "Bella Roma",
      orderNumber: "SO-1001",
      contact: { phone: "0400 000 001", email: null },
    },
    {
      lot: "PIZZA-1",
      productId: "pizza",
      quantity: 6,
      customerId: "c1",
      customerName: "Bella Roma",
      orderNumber: "SO-1009",
      // The second order carries the email the first one lacked.
      contact: { phone: null, email: "orders@bellaroma.test" },
    },
    {
      lot: "BASE-1",
      productId: "base",
      quantity: 40,
      customerId: "c2",
      customerName: "Nonna's",
      orderNumber: "SO-1002",
      contact: { phone: "0400 000 002" },
    },
    {
      lot: "UNRELATED-7",
      productId: "pizza",
      quantity: 99,
      customerId: "c3",
      customerName: "Not Affected Pty Ltd",
      orderNumber: "SO-1003",
    },
  ]

  it("names only customers a shipment record actually links to the lot", () => {
    const scope = recallScope("FLOUR-A", buildLotGraph(chain), shipments)
    const names = scope.customers.map((customer) => customer.customerName)

    expect(names).toContain("Bella Roma")
    expect(names).toContain("Nonna's")
    // Bought the same product, never got this lot. The old date heuristic
    // would have called them.
    expect(names).not.toContain("Not Affected Pty Ltd")
  })

  it("lists every lot made from the recalled one", () => {
    const scope = recallScope("FLOUR-A", buildLotGraph(chain), shipments)

    expect(scope.affectedLots.map((row) => row.lot)).toEqual([
      "FLOUR-A",
      "DOUGH-1",
      "BASE-1",
      "PIZZA-1",
    ])
    expect(scope.affectedLots[0].depth).toBe(0)
  })

  it("adds up one customer's orders rather than listing them twice", () => {
    const scope = recallScope("FLOUR-A", buildLotGraph(chain), shipments)
    const bella = scope.customers.find((customer) => customer.customerName === "Bella Roma")!

    expect(bella.quantity).toBe(18)
    expect(bella.orders).toEqual(["SO-1001", "SO-1009"])
  })

  it("keeps a contact detail that only one of the orders carried", () => {
    const scope = recallScope("FLOUR-A", buildLotGraph(chain), shipments)
    const bella = scope.customers.find((customer) => customer.customerName === "Bella Roma")!

    expect(bella.phone).toBe("0400 000 001")
    expect(bella.email).toBe("orders@bellaroma.test")
  })

  it("puts the most directly affected customer first", () => {
    // Nonna's got BASE-1 (2 hops from the flour); Bella got PIZZA-1 (3).
    const scope = recallScope("FLOUR-A", buildLotGraph(chain), shipments)

    expect(scope.customers[0].customerName).toBe("Nonna's")
    expect(scope.customers[0].nearestDepth).toBe(2)
  })

  it("counts the recalled lot's own shipments, not just its descendants'", () => {
    const direct = recallScope("PIZZA-1", buildLotGraph(chain), shipments)

    expect(direct.totalQuantity).toBe(18)
    expect(direct.customers.map((customer) => customer.customerName)).toEqual(["Bella Roma"])
    expect(direct.customers[0].nearestDepth).toBe(0)
  })

  it("returns an empty scope rather than everything for an unknown lot", () => {
    const scope = recallScope("NEVER-EXISTED", buildLotGraph(chain), shipments)

    expect(scope.customers).toEqual([])
    expect(scope.totalQuantity).toBe(0)
    // The lot itself is still listed, so the UI can say "no shipments found"
    // rather than "no such lot".
    expect(scope.affectedLots).toEqual([{ lot: "NEVER-EXISTED", depth: 0 }])
  })

  it("passes truncation through, so a deep chain is not read as complete", () => {
    const scope = recallScope("FLOUR-A", buildLotGraph(chain), shipments, 1)

    expect(scope.truncated).toBe(true)
    // With one hop only, the pizza customer is out of scope and must not be
    // silently dropped without the caller knowing the walk was cut short.
    expect(scope.customers.map((customer) => customer.customerName)).toEqual([])
  })
})
