import { describe, expect, it } from "vitest"

import { validateAiMapping } from "@/lib/leads-import-ai"

/**
 * The model is treated as an untrusted source. Everything here is a way a
 * plausible-looking response silently corrupts an import: a column that is not
 * in the file, one column claimed by two fields, a field nobody asked for.
 */

const HEADERS = ["Company Name", "Business Type", "First Name", "Email", "Phone"]

describe("validateAiMapping", () => {
  it("keeps a sensible mapping", () => {
    const mapping = validateAiMapping(
      { businessName: "Company Name", industry: "Business Type", contactName: "First Name" },
      HEADERS
    )

    expect(mapping.businessName).toBe("Company Name")
    expect(mapping.industry).toBe("Business Type")
    expect(mapping.contactName).toBe("First Name")
  })

  it("drops a column the file does not contain", () => {
    // Models name plausible columns that are simply not there.
    const mapping = validateAiMapping({ businessName: "Trading Name" }, HEADERS)
    expect(mapping.businessName).toBeNull()
  })

  it("refuses to give one column to two fields", () => {
    const mapping = validateAiMapping(
      { businessName: "Company Name", contactName: "Company Name" },
      HEADERS
    )

    expect(mapping.businessName).toBe("Company Name")
    expect(mapping.contactName).toBeNull()
  })

  it("ignores fields that are not ours", () => {
    const mapping = validateAiMapping(
      { businessName: "Company Name", favouriteColour: "Email", abn: "Phone" },
      HEADERS
    )

    expect(mapping.businessName).toBe("Company Name")
    expect(mapping).not.toHaveProperty("favouriteColour")
    expect(mapping.email).toBeNull()
  })

  it("matches a header case-insensitively but stores the file's spelling", () => {
    // The rows are keyed by exactly what the header says, so the returned value
    // has to be the file's spelling or every lookup misses.
    const mapping = validateAiMapping({ businessName: "company name" }, HEADERS)
    expect(mapping.businessName).toBe("Company Name")
  })

  it("survives junk instead of an object", () => {
    for (const junk of [null, undefined, "sorry, I cannot help", 42, []]) {
      expect(validateAiMapping(junk, HEADERS).businessName).toBeNull()
    }
  })

  it("ignores empty and non-string values", () => {
    const mapping = validateAiMapping({ businessName: "", contactName: null, email: 7 }, HEADERS)

    expect(mapping.businessName).toBeNull()
    expect(mapping.contactName).toBeNull()
    expect(mapping.email).toBeNull()
  })

  it("always returns every field, so callers never read undefined", () => {
    const mapping = validateAiMapping({}, HEADERS)

    expect(Object.keys(mapping)).toContain("businessName")
    expect(Object.keys(mapping)).toContain("estimatedValue")
    expect(Object.values(mapping).every((value) => value === null)).toBe(true)
  })
})
