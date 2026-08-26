import { describe, expect, it } from "vitest"

import { findClaimContradictions, parseAllergens } from "@/lib/allergens"

/**
 * A contradicted claim is worse than a missing declaration: a missing allergen
 * is an incomplete label, while "nut free" on a pack containing peanut actively
 * tells somebody the thing that will hurt them is not in there.
 */

const from = (pairs: Record<string, string[]>) => new Map(Object.entries(pairs))

describe("findClaimContradictions", () => {
  it("catches peanut in a nut-free product", () => {
    // The bug this test exists for: "nut free" used to check tree nuts only,
    // so a peanut passed straight through the claim it most contradicts.
    const found = findClaimContradictions("Nut Free Pizza Base", from({ peanut: ["satay sauce"] }))

    expect(found).toHaveLength(1)
    expect(found[0]).toContain("peanut")
    expect(found[0]).toContain("satay sauce")
  })

  it("catches tree nut in a nut-free product", () => {
    expect(findClaimContradictions("Nut Free Base", from({ treenut: ["almond meal"] }))).toHaveLength(1)
  })

  it("reads a hyphenated claim the same as a spaced one", () => {
    // "Nut-Free" was previously missed entirely, since only "nut free" was listed.
    for (const name of ["Nut-Free Base", "Nut Free Base", "NUT   FREE BASE", "nut_free base"]) {
      expect(findClaimContradictions(name, from({ peanut: ["peanut oil"] }))).toHaveLength(1)
    }
  })

  it("treats a gluten-free claim as ruling out wheat too", () => {
    expect(findClaimContradictions("Gluten Free Base", from({ wheat: ["wheat starch"] }))).toHaveLength(1)
  })

  it("treats vegan as a claim about every animal allergen", () => {
    const found = findClaimContradictions("Vegan Margherita", from({ milk: ["mozzarella"], egg: ["egg wash"] }))
    expect(found).toHaveLength(2)
  })

  it("says nothing when the claim holds", () => {
    expect(findClaimContradictions("Gluten Free Base", from({ soy: ["soy flour"] }))).toEqual([])
  })

  it("says nothing when there is no claim to contradict", () => {
    expect(findClaimContradictions("Napoli Rustica Base", from({ gluten: ["wheat flour"] }))).toEqual([])
  })

  it("names every ingredient bringing the allergen in, once each", () => {
    const found = findClaimContradictions(
      "Dairy Free Base",
      from({ milk: ["butter", "cheese", "butter"] })
    )

    expect(found[0]).toContain("butter, cheese")
    expect(found[0].match(/butter/g)).toHaveLength(1)
  })

  it("reports each contradicted allergen separately", () => {
    // One line per problem, because each is a separate thing to fix.
    const found = findClaimContradictions("Nut Free Base", from({ peanut: ["p"], treenut: ["t"] }))
    expect(found).toHaveLength(2)
  })

  it("ignores an allergen listed with no source", () => {
    expect(findClaimContradictions("Nut Free Base", from({ peanut: [] }))).toEqual([])
  })
})

describe("parseAllergens", () => {
  it("reads a stored list", () => {
    expect(parseAllergens('["Gluten","MILK"]')).toEqual(["gluten", "milk"])
  })

  it("treats unreadable data as nothing declared rather than throwing", () => {
    // Throwing here would block a production run over a malformed field; an
    // empty declaration instead surfaces as undeclared allergens, which is the
    // safe direction to fail in.
    for (const junk of [null, "", "not json", "{}", "[1,2,3]"]) {
      expect(parseAllergens(junk)).toEqual([])
    }
  })

  it("drops blanks and trims", () => {
    expect(parseAllergens('[" gluten ", "", "  "]')).toEqual(["gluten"])
  })
})
