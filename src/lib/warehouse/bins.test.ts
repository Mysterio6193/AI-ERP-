import { describe, expect, it } from "vitest"

import {
  allocateFromBins,
  choosePutawayBin,
  formatBinCode,
  orderPickPath,
  parseBinCode,
  pickSequenceFor,
  type Bin,
  type PickTask,
  type PutawayCandidate,
  type WarehouseSettings,
} from "./bins"

const settings: WarehouseSettings = {
  serpentinePicking: true,
  maxRacksPerAisle: 50,
  pickStrategy: "fefo",
  allowBinOverfill: true,
  defaultReceivingZone: "R",
  enforceBinQuantities: false,
}

function bin(code: string, overrides: Partial<Bin> = {}): Bin {
  const parsed = parseBinCode(code)
  if (!parsed.ok) throw new Error(`test wrote a bad bin code: ${code}`)

  return {
    id: code,
    code,
    ...parsed.bin,
    isPickable: true,
    maxUnits: null,
    status: "active",
    ...overrides,
  }
}

describe("parseBinCode", () => {
  it("reads the four parts", () => {
    const result = parseBinCode("A-01-3-2")
    expect(result).toEqual({ ok: true, bin: { zone: "A", aisle: 1, rack: 3, level: 2 } })
  })

  it("accepts an unpadded code, because people write them that way", () => {
    const result = parseBinCode("a-1-3-2")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bin).toEqual({ zone: "A", aisle: 1, rack: 3, level: 2 })
  })

  it("refuses codes that nearly parse", () => {
    // Each of these would otherwise land somewhere plausible-looking on the
    // route, which is worse than being rejected at the door.
    for (const code of ["A-01-3", "A-01-3-2-1", "1-01-3-2", "A-01-3-x", "A-0001-3-2", "", "   "]) {
      expect(parseBinCode(code).ok, code).toBe(false)
    }
  })

  it("says what is wrong with it", () => {
    const result = parseBinCode("A-01-3")
    if (result.ok) throw new Error("expected a failure")
    expect(result.error).toContain("ZONE-AISLE-RACK-LEVEL")
  })
})

describe("formatBinCode", () => {
  it("pads the aisle so codes read consistently", () => {
    expect(formatBinCode({ zone: "A", aisle: 1, rack: 3, level: 2 })).toBe("A-01-3-2")
  })

  it("round-trips", () => {
    const result = parseBinCode("B-12-7-4")
    if (!result.ok) throw new Error("expected a parse")
    expect(formatBinCode(result.bin)).toBe("B-12-7-4")
  })
})

describe("pickSequenceFor", () => {
  it("walks even aisles low rack to high", () => {
    const low = pickSequenceFor({ zone: "A", aisle: 2, rack: 1, level: 1 }, settings)
    const high = pickSequenceFor({ zone: "A", aisle: 2, rack: 9, level: 1 }, settings)
    expect(low).toBeLessThan(high)
  })

  it("walks odd aisles in reverse, so the picker does not double back", () => {
    const low = pickSequenceFor({ zone: "A", aisle: 1, rack: 1, level: 1 }, settings)
    const high = pickSequenceFor({ zone: "A", aisle: 1, rack: 9, level: 1 }, settings)
    expect(high).toBeLessThan(low)
  })

  it("keeps aisles in order regardless of the reversal", () => {
    const endOfAisleOne = pickSequenceFor({ zone: "A", aisle: 1, rack: 1, level: 1 }, settings)
    const startOfAisleTwo = pickSequenceFor({ zone: "A", aisle: 2, rack: 1, level: 1 }, settings)
    expect(endOfAisleOne).toBeLessThan(startOfAisleTwo)
  })

  it("does not reverse anything when serpentine is off", () => {
    const straight = { ...settings, serpentinePicking: false }
    const low = pickSequenceFor({ zone: "A", aisle: 1, rack: 1, level: 1 }, straight)
    const high = pickSequenceFor({ zone: "A", aisle: 1, rack: 9, level: 1 }, straight)
    expect(low).toBeLessThan(high)
  })

  it("orders zones alphabetically, including multi-letter ones", () => {
    const a = pickSequenceFor({ zone: "A", aisle: 1, rack: 1, level: 1 }, settings)
    const b = pickSequenceFor({ zone: "B", aisle: 1, rack: 1, level: 1 }, settings)
    const aa = pickSequenceFor({ zone: "AA", aisle: 1, rack: 1, level: 1 }, settings)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(aa)
  })

  it("takes low levels before high ones at the same rack", () => {
    const floor = pickSequenceFor({ zone: "A", aisle: 2, rack: 3, level: 1 }, settings)
    const ladder = pickSequenceFor({ zone: "A", aisle: 2, rack: 3, level: 4 }, settings)
    expect(floor).toBeLessThan(ladder)
  })

  it("keeps racks in their own aisle even at three digits", () => {
    // The code grammar allows a three-digit rack, so the packed sequence has
    // to leave room for one. With too-narrow fields, A-02-100-1 packs into
    // aisle 3's range and the picker is sent to the wrong aisle.
    const straight = { ...settings, serpentinePicking: false }
    const deepAisleTwo = pickSequenceFor({ zone: "A", aisle: 2, rack: 100, level: 1 }, straight)
    const startAisleThree = pickSequenceFor({ zone: "A", aisle: 3, rack: 1, level: 1 }, straight)
    expect(deepAisleTwo).toBeLessThan(startAisleThree)
  })

  it("keeps levels from spilling into the next rack", () => {
    const straight = { ...settings, serpentinePicking: false }
    const topOfRackOne = pickSequenceFor({ zone: "A", aisle: 2, rack: 1, level: 999 }, straight)
    const bottomOfRackTwo = pickSequenceFor({ zone: "A", aisle: 2, rack: 2, level: 1 }, straight)
    expect(topOfRackOne).toBeLessThan(bottomOfRackTwo)
  })

  it("stays inside the exact range of a double", () => {
    // The stored column is a double; a sequence past 2^53 would round and
    // two different bins would sort as equal.
    const worst = pickSequenceFor({ zone: "ZZZZ", aisle: 999, rack: 999, level: 999 }, settings)
    expect(worst).toBeLessThan(Number.MAX_SAFE_INTEGER)
    expect(Number.isSafeInteger(worst)).toBe(true)
  })

  it("does not go negative when a rack sits past the configured aisle length", () => {
    // A misconfigured maxRacksPerAisle should not fold racks back around and
    // scramble the route.
    const short = { ...settings, maxRacksPerAisle: 4 }
    const sequence = pickSequenceFor({ zone: "A", aisle: 1, rack: 9, level: 1 }, short)
    expect(sequence).toBeGreaterThan(0)
  })
})

describe("orderPickPath", () => {
  const task = (code: string): PickTask => ({
    productId: "p1",
    binId: code,
    bin: bin(code),
    quantity: 1,
  })

  it("does not sort bins as text", () => {
    // The bug this exists to prevent: "A-10-…" sorts before "A-2-…" as a
    // string, sending a picker back down the building.
    const straight = { ...settings, serpentinePicking: false }
    const ordered = orderPickPath([task("A-10-1-1"), task("A-02-1-1")], straight)
    expect(ordered.map((t) => t.bin.code)).toEqual(["A-02-1-1", "A-10-1-1"])
  })

  it("produces a serpentine walk across aisles", () => {
    const ordered = orderPickPath(
      [
        task("A-02-1-1"),
        task("A-01-1-1"),
        task("A-02-9-1"),
        task("A-01-9-1"),
      ],
      settings
    )

    // Up aisle 1 from rack 9 down to rack 1, then along aisle 2 from 1 to 9.
    expect(ordered.map((t) => t.bin.code)).toEqual([
      "A-01-9-1",
      "A-01-1-1",
      "A-02-1-1",
      "A-02-9-1",
    ])
  })

  it("leaves the caller's array alone", () => {
    const tasks = [task("A-02-1-1"), task("A-01-1-1")]
    orderPickPath(tasks, settings)
    expect(tasks.map((t) => t.bin.code)).toEqual(["A-02-1-1", "A-01-1-1"])
  })
})

describe("choosePutawayBin", () => {
  const candidate = (
    code: string,
    used: number,
    holdsSameProduct: boolean,
    binOverrides: Partial<Bin> = {}
  ): PutawayCandidate => ({ bin: bin(code, binOverrides), used, holdsSameProduct })

  it("consolidates onto a bin already holding the product", () => {
    const result = choosePutawayBin(
      "p1",
      10,
      [candidate("A-02-1-1", 0, false), candidate("A-09-1-1", 5, true)],
      settings
    )

    expect(result).toMatchObject({ ok: true, binId: "A-09-1-1" })
    if (!result.ok) return
    expect(result.reason).toContain("already holds")
  })

  it("prefers an empty bin over a shared one when the product is not here yet", () => {
    const result = choosePutawayBin(
      "p1",
      10,
      [candidate("A-02-1-1", 7, false), candidate("A-04-1-1", 0, false)],
      settings
    )

    expect(result).toMatchObject({ ok: true, binId: "A-04-1-1" })
  })

  it("falls back to any bin with room", () => {
    const result = choosePutawayBin("p1", 10, [candidate("A-02-1-1", 7, false)], settings)
    expect(result).toMatchObject({ ok: true, binId: "A-02-1-1" })
  })

  it("picks the earliest bin on the route among equals", () => {
    const result = choosePutawayBin(
      "p1",
      1,
      [candidate("B-02-1-1", 0, false), candidate("A-02-1-1", 0, false)],
      settings
    )

    expect(result).toMatchObject({ ok: true, binId: "A-02-1-1" })
  })

  it("skips bins that are not active or not pickable", () => {
    const result = choosePutawayBin(
      "p1",
      1,
      [
        candidate("A-01-1-1", 0, true, { status: "blocked" }),
        candidate("A-02-1-1", 0, true, { isPickable: false }),
      ],
      settings
    )

    expect(result).toMatchObject({ ok: false })
  })

  it("respects a bin ceiling when overfill is off", () => {
    const strict = { ...settings, allowBinOverfill: false }
    const result = choosePutawayBin(
      "p1",
      10,
      [
        candidate("A-01-1-1", 95, true, { maxUnits: 100 }),
        candidate("A-04-1-1", 0, false, { maxUnits: 100 }),
      ],
      strict
    )

    // The consolidation bin would go over, so the empty one wins instead.
    expect(result).toMatchObject({ ok: true, binId: "A-04-1-1" })
  })

  it("consolidates over the ceiling when overfill is allowed", () => {
    const result = choosePutawayBin(
      "p1",
      10,
      [
        candidate("A-01-1-1", 95, true, { maxUnits: 100 }),
        candidate("A-04-1-1", 0, false, { maxUnits: 100 }),
      ],
      settings
    )

    expect(result).toMatchObject({ ok: true, binId: "A-01-1-1" })
  })

  it("treats a null ceiling as no ceiling, not as zero", () => {
    const strict = { ...settings, allowBinOverfill: false }
    const result = choosePutawayBin(
      "p1",
      10_000,
      [candidate("A-02-1-1", 900, false, { maxUnits: null })],
      strict
    )

    expect(result).toMatchObject({ ok: true, binId: "A-02-1-1" })
  })

  it("says what to do when nothing has room", () => {
    const strict = { ...settings, allowBinOverfill: false }
    const result = choosePutawayBin(
      "p1",
      10,
      [candidate("A-02-1-1", 100, false, { maxUnits: 100 })],
      strict
    )

    if (result.ok) throw new Error("expected a refusal")
    expect(result.error).toContain("overfill")
  })

  it("refuses a non-positive quantity", () => {
    expect(choosePutawayBin("p1", 0, [candidate("A-02-1-1", 0, false)], settings).ok).toBe(false)
    expect(choosePutawayBin("p1", -5, [candidate("A-02-1-1", 0, false)], settings).ok).toBe(false)
  })
})

describe("allocateFromBins", () => {
  const bins = new Map<string, Bin>(
    ["A-01-1-1", "A-02-1-1", "A-09-1-1", "Q-01-1-1"].map((code) => [
      code,
      bin(code, code === "Q-01-1-1" ? { status: "quarantine", isPickable: false } : {}),
    ])
  )

  const day = (n: number) => new Date(`2026-0${n}-01T00:00:00Z`)

  it("takes the earliest expiry first", () => {
    const result = allocateFromBins(
      "p1",
      10,
      [
        { binId: "A-02-1-1", productId: "p1", quantity: 10, batchCode: "L2", expiryDate: day(9) },
        { binId: "A-09-1-1", productId: "p1", quantity: 10, batchCode: "L1", expiryDate: day(3) },
      ],
      bins,
      settings
    )

    expect(result.shortfall).toBe(0)
    expect(result.allocations).toEqual([
      { binId: "A-09-1-1", binCode: "A-09-1-1", quantity: 10, batchCode: "L1" },
    ])
  })

  it("breaks an expiry tie on walking order", () => {
    const result = allocateFromBins(
      "p1",
      15,
      [
        { binId: "A-09-1-1", productId: "p1", quantity: 10, expiryDate: day(3) },
        { binId: "A-02-1-1", productId: "p1", quantity: 10, expiryDate: day(3) },
      ],
      bins,
      settings
    )

    expect(result.allocations.map((a) => a.binCode)).toEqual(["A-02-1-1", "A-09-1-1"])
    expect(result.allocations.map((a) => a.quantity)).toEqual([10, 5])
  })

  it("puts undated stock behind dated stock rather than at the front", () => {
    // Infinity, not zero: a missing expiry must not look like the oldest lot.
    const result = allocateFromBins(
      "p1",
      5,
      [
        { binId: "A-02-1-1", productId: "p1", quantity: 10, expiryDate: null },
        { binId: "A-09-1-1", productId: "p1", quantity: 10, expiryDate: day(3) },
      ],
      bins,
      settings
    )

    expect(result.allocations[0].binCode).toBe("A-09-1-1")
  })

  it("follows the route instead of expiry when the strategy says so", () => {
    const byRoute = { ...settings, pickStrategy: "route" as const }
    const result = allocateFromBins(
      "p1",
      5,
      [
        { binId: "A-09-1-1", productId: "p1", quantity: 10, expiryDate: day(3) },
        { binId: "A-02-1-1", productId: "p1", quantity: 10, expiryDate: day(9) },
      ],
      bins,
      byRoute
    )

    expect(result.allocations[0].binCode).toBe("A-02-1-1")
  })

  it("reports a shortfall rather than throwing", () => {
    const result = allocateFromBins(
      "p1",
      100,
      [{ binId: "A-02-1-1", productId: "p1", quantity: 10 }],
      bins,
      settings
    )

    expect(result.allocations).toHaveLength(1)
    expect(result.shortfall).toBe(90)
  })

  it("does not pick out of quarantine", () => {
    const result = allocateFromBins(
      "p1",
      5,
      [{ binId: "Q-01-1-1", productId: "p1", quantity: 500 }],
      bins,
      settings
    )

    expect(result.allocations).toHaveLength(0)
    expect(result.shortfall).toBe(5)
  })

  it("ignores other products, empty rows, and bins it does not know", () => {
    const result = allocateFromBins(
      "p1",
      5,
      [
        { binId: "A-02-1-1", productId: "p2", quantity: 100 },
        { binId: "A-01-1-1", productId: "p1", quantity: 0 },
        { binId: "gone", productId: "p1", quantity: 100 },
      ],
      bins,
      settings
    )

    expect(result.allocations).toHaveLength(0)
    expect(result.shortfall).toBe(5)
  })

  it("asks for nothing when nothing is needed", () => {
    expect(allocateFromBins("p1", 0, [], bins, settings)).toEqual({
      allocations: [],
      shortfall: 0,
    })
  })
})
