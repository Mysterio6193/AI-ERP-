import { describe, expect, it } from "vitest"

import { inferColumnMapping, parseCsv } from "./leads-import"

/**
 * A prospect list is someone's spreadsheet, so the parser meets quoted commas,
 * embedded newlines, Excel's BOM and inconsistent header names on the first
 * real file. The previous `parseSimpleCsv` split on bare commas and silently
 * shredded any address, which is why these cases are here.
 */

describe("parseCsv", () => {
  it("parses a plain file", () => {
    const rows = parseCsv("Name,Email\nAcme,a@b.com\nBeta,c@d.com")

    expect(rows).toEqual([
      { Name: "Acme", Email: "a@b.com" },
      { Name: "Beta", Email: "c@d.com" },
    ])
  })

  it("keeps commas inside quoted fields", () => {
    const rows = parseCsv('Name,Address\nAcme,"Shop 3, King St, Newtown"')

    expect(rows[0].Address).toBe("Shop 3, King St, Newtown")
  })

  it("handles escaped quotes", () => {
    const rows = parseCsv('Name,Note\nAcme,"They said ""yes"" on Friday"')

    expect(rows[0].Note).toBe('They said "yes" on Friday')
  })

  it("handles a newline inside a quoted field", () => {
    const rows = parseCsv('Name,Address\nAcme,"Line one\nLine two"')

    expect(rows).toHaveLength(1)
    expect(rows[0].Address).toBe("Line one\nLine two")
  })

  it("strips the UTF-8 BOM Excel writes", () => {
    const rows = parseCsv("﻿Name,Email\nAcme,a@b.com")

    // Without stripping, the first header becomes "﻿Name" and never maps.
    expect(Object.keys(rows[0])).toContain("Name")
  })

  it("survives CRLF line endings", () => {
    const rows = parseCsv("Name,Email\r\nAcme,a@b.com\r\nBeta,c@d.com")

    expect(rows).toHaveLength(2)
    expect(rows[1].Name).toBe("Beta")
  })

  it("pads rows with missing trailing cells", () => {
    const rows = parseCsv("Name,Email,Phone\nAcme,a@b.com")

    expect(rows[0].Phone).toBe("")
  })

  it("ignores blank lines", () => {
    const rows = parseCsv("Name\nAcme\n\n\nBeta\n")

    expect(rows).toHaveLength(2)
  })

  it("returns nothing for a header-only or empty file", () => {
    expect(parseCsv("Name,Email")).toEqual([])
    expect(parseCsv("")).toEqual([])
  })
})

describe("inferColumnMapping", () => {
  it("matches common header spellings", () => {
    const mapping = inferColumnMapping([
      "Business Name",
      "Contact",
      "Email",
      "Phone",
      "Suburb",
      "Venue Type",
      "Monthly Spend",
    ])

    expect(mapping.businessName).toBe("Business Name")
    expect(mapping.contactName).toBe("Contact")
    expect(mapping.industry).toBe("Venue Type")
    expect(mapping.estimatedValue).toBe("Monthly Spend")
  })

  it("is case and spacing insensitive", () => {
    const mapping = inferColumnMapping(["  COMPANY NAME  ", "e-mail"])

    expect(mapping.businessName).toBe("  COMPANY NAME  ")
    expect(mapping.email).toBe("e-mail")
  })

  it("never assigns one column to two fields", () => {
    // "name" could match businessName or contactName; it must not do both.
    const mapping = inferColumnMapping(["name"])
    const used = Object.values(mapping).filter(Boolean)

    expect(new Set(used).size).toBe(used.length)
  })

  it("reports unmatched fields as null rather than guessing", () => {
    const mapping = inferColumnMapping(["Business Name"])

    expect(mapping.businessName).toBe("Business Name")
    expect(mapping.phone).toBeNull()
    expect(mapping.email).toBeNull()
  })
})
