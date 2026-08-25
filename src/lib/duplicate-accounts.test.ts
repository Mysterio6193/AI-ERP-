import { describe, expect, it } from "vitest"
import { describeDuplicate, findDuplicateAccounts, normaliseName } from "@/lib/duplicate-accounts"

const account = (id: string, name: string, orderCount = 0) => ({
  id, name, orderCount, invoiceCount: 0,
})

describe("normaliseName", () => {
  it("ignores company suffixes", () => {
    expect(normaliseName("Bidfood Australia Pty Ltd")).toBe(normaliseName("Bidfood"))
  })

  it("ignores punctuation and case", () => {
    expect(normaliseName("Tony's Trattoria")).toBe(normaliseName("TONYS TRATTORIA"))
  })

  it("keeps genuinely different names apart", () => {
    expect(normaliseName("Nonna's Kitchen - West End")).not.toBe(
      normaliseName("Nonna's Kitchen - Fortitude Valley")
    )
  })
})

describe("findDuplicateAccounts", () => {
  it("finds two rows for one venue", () => {
    const groups = findDuplicateAccounts([
      account("a", "Bella Napoli Pizzeria", 2),
      account("b", "Bella Napoli Pizzeria", 2),
      account("c", "Coastal Hotels Group", 3),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].totalOrders).toBe(4)
  })

  it("flags when the split hides a venue from lapse detection", () => {
    // Four orders, but 2 + 2 — neither row reaches the threshold of 3, so a
    // steadily-ordering venue can never show up as having gone quiet.
    const groups = findDuplicateAccounts([
      account("a", "Bella Napoli Pizzeria", 2),
      account("b", "Bella Napoli Pizzeria", 2),
    ])

    expect(groups[0].hiddenFromLapseDetection).toBe(true)
  })

  it("does not flag a split that changes nothing", () => {
    // One row already clears the threshold on its own.
    const groups = findDuplicateAccounts([
      account("a", "Tony's Trattoria", 5),
      account("b", "Tony's Trattoria", 0),
    ])

    expect(groups[0].hiddenFromLapseDetection).toBe(false)
  })

  it("matches across spelling differences", () => {
    const groups = findDuplicateAccounts([
      account("a", "PFD Food Services", 3),
      account("b", "P.F.D. Food Services Pty Ltd", 1),
    ])

    expect(groups).toHaveLength(1)
  })

  it("says nothing when every account is distinct", () => {
    expect(findDuplicateAccounts([account("a", "One"), account("b", "Two")])).toEqual([])
  })

  it("ignores a name that normalises to nothing", () => {
    // "Pty Ltd" alone carries no identity to compare.
    expect(findDuplicateAccounts([account("a", "Pty Ltd"), account("b", "Ltd")])).toEqual([])
  })

  it("puts the biggest split first", () => {
    const groups = findDuplicateAccounts([
      account("a", "Small", 1), account("b", "Small", 1),
      account("c", "Big", 10), account("d", "Big", 5),
    ])

    expect(groups[0].accounts[0].name).toBe("Big")
  })
})

describe("describeDuplicate", () => {
  it("names the consequence, not just the duplication", () => {
    const [group] = findDuplicateAccounts([
      account("a", "Bella Napoli Pizzeria", 2),
      account("b", "Bella Napoli Pizzeria", 2),
    ])

    const said = describeDuplicate(group)
    expect(said).toContain("Bella Napoli")
    expect(said).toMatch(/going-quiet report/)
  })

  it("still reports a harmless split plainly", () => {
    const [group] = findDuplicateAccounts([
      account("a", "Tony's Trattoria", 5),
      account("b", "Tony's Trattoria", 0),
    ])

    expect(describeDuplicate(group)).toMatch(/split 5 \+ 0/)
  })
})
