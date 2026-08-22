import { describe, expect, it } from "vitest"

import { FORM_SOURCES, parseFormSchema, renderTemplate } from "./freight"

/**
 * A booking that goes out with a blank address is silently dropped by the
 * carrier and nobody finds out until the delivery does not arrive, so the
 * failure mode worth testing is a placeholder that quietly renders empty.
 */

describe("renderTemplate", () => {
  it("substitutes known placeholders", () => {
    expect(renderTemplate("Booking {{ref}} for {{town}}", { ref: "SO-1", town: "Newtown" })).toBe(
      "Booking SO-1 for Newtown"
    )
  })

  it("leaves unknown placeholders visible rather than blanking them", () => {
    // A visibly wrong template is fixable; a silently empty field is not.
    expect(renderTemplate("To: {{missing}}", { ref: "SO-1" })).toBe("To: {{missing}}")
  })

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("{{ ref }}", { ref: "SO-1" })).toBe("SO-1")
  })

  it("substitutes a placeholder used more than once", () => {
    expect(renderTemplate("{{ref}} / {{ref}}", { ref: "X" })).toBe("X / X")
  })

  it("renders an empty string for a key that exists but is blank", () => {
    // Distinct from unknown: the field was mapped, the order just had no value.
    expect(renderTemplate("Notes: {{notes}}", { notes: "" })).toBe("Notes: ")
  })

  it("leaves text with no placeholders untouched", () => {
    expect(renderTemplate("Plain text", {})).toBe("Plain text")
  })
})

describe("parseFormSchema", () => {
  it("falls back to the standard form when a carrier defines none", () => {
    const fields = parseFormSchema(null)

    expect(fields.length).toBeGreaterThan(0)
    expect(fields.some((field) => field.key === "deliveryPostcode")).toBe(true)
  })

  it("falls back rather than throwing on malformed JSON", () => {
    // A corrupt row must not take the booking screen down.
    expect(parseFormSchema("{not json").length).toBeGreaterThan(0)
  })

  it("falls back on an empty array", () => {
    expect(parseFormSchema("[]").length).toBeGreaterThan(0)
  })

  it("uses the carrier's own fields when defined", () => {
    const fields = parseFormSchema(
      JSON.stringify([{ key: "consignee", label: "Consignee", required: true }])
    )

    expect(fields).toHaveLength(1)
    expect(fields[0].key).toBe("consignee")
  })

  it("drops entries with no key", () => {
    const fields = parseFormSchema(JSON.stringify([{ key: "ok", label: "Ok" }, { label: "no key" }]))

    expect(fields).toHaveLength(1)
  })
})

describe("FORM_SOURCES", () => {
  it("has unique paths, so the editor cannot offer a duplicate", () => {
    const paths = FORM_SOURCES.map((source) => source.path)

    expect(new Set(paths).size).toBe(paths.length)
  })

  it("covers every group the editor renders", () => {
    const groups = new Set(FORM_SOURCES.map((source) => source.group))

    expect(groups).toEqual(new Set(["Order", "Customer", "Delivery", "Pickup"]))
  })

  it("uses dotted paths the filler can resolve", () => {
    for (const source of FORM_SOURCES) {
      expect(source.path).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
    }
  })
})
