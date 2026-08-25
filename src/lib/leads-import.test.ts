import { describe, expect, it } from "vitest"

import {
  classifyDuplicate,
  columnLooksCategorical,
  detectDelimiter,
  findHeaderRow,
  inferColumnMapping,
  parseCsv,
  parseGrid,
  type KeyIndex,
} from "./leads-import"

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

const index = (over: Partial<Record<"email" | "phone" | "name", string[]>> = {}): KeyIndex => ({
  email: new Set(over.email ?? []),
  phone: new Set(over.phone ?? []),
  name: new Set(over.name ?? []),
})

const keys = (over: Partial<{ email: string; phoneKey: string; nameKey: string }> = {}) => ({
  email: "",
  phoneKey: "",
  nameKey: "bellanapoli",
  ...over,
})

describe("classifyDuplicate", () => {
  it("lets a genuinely new row through", () => {
    expect(classifyDuplicate(keys(), index(), index())).toBeNull()
  })

  it("catches someone we already have", () => {
    expect(classifyDuplicate(keys(), index({ name: ["bellanapoli"] }), index())).toBe("already-on-file")
  })

  it("catches a row the sheet lists twice", () => {
    expect(classifyDuplicate(keys(), index(), index({ name: ["bellanapoli"] }))).toBe("repeated-in-file")
  })

  it("calls a row that is both 'already on file' — the more useful answer", () => {
    // Otherwise a sheet full of existing customers reads as a problem with the
    // sheet, and someone goes looking for a mistake that is not there.
    const both = classifyDuplicate(keys(), index({ name: ["bellanapoli"] }), index({ name: ["bellanapoli"] }))
    expect(both).toBe("already-on-file")
  })

  it("matches on email as well as name", () => {
    const k = keys({ email: "marco@bella.com.au", nameKey: "somethingelse" })
    expect(classifyDuplicate(k, index({ email: ["marco@bella.com.au"] }), index())).toBe("already-on-file")
  })

  it("matches on phone as well as name", () => {
    const k = keys({ phoneKey: "0391234567", nameKey: "somethingelse" })
    expect(classifyDuplicate(k, index({ phone: ["0391234567"] }), index())).toBe("already-on-file")
  })

  it("does not treat two blank emails as the same person", () => {
    // Half a trade-show list has no email; matching on empty would collapse it
    // into one lead and silently bin the rest.
    const k = keys({ email: "", nameKey: "uniquevenue" })
    expect(classifyDuplicate(k, index({ email: [""] }), index())).toBeNull()
  })

  it("does not treat two blank phones as the same person", () => {
    const k = keys({ phoneKey: "", nameKey: "uniquevenue" })
    expect(classifyDuplicate(k, index({ phone: [""] }), index())).toBeNull()
  })
})

describe("detectDelimiter", () => {
  it("finds commas", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",")
  })

  it("finds semicolons, which Excel writes in much of Europe", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";")
  })

  it("finds tabs, which is what a sheet pasted out of Excel looks like", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t")
  })

  it("is not fooled by a comma inside a quoted header", () => {
    expect(detectDelimiter('"Name, trading";Email\nBella;a@b.com')).toBe(";")
  })

  it("falls back to a comma for a single-column file", () => {
    expect(detectDelimiter("Business Name\nBella")).toBe(",")
  })
})

describe("parseCsv delimiters", () => {
  it("reads a semicolon file", () => {
    const rows = parseCsv("Business Name;Email\nBella;a@b.com")
    expect(rows[0]).toEqual({ "Business Name": "Bella", Email: "a@b.com" })
  })

  it("reads a tab file", () => {
    const rows = parseCsv("Business Name\tEmail\nBella\ta@b.com")
    expect(rows[0]).toEqual({ "Business Name": "Bella", Email: "a@b.com" })
  })

  it("still protects a comma inside quotes when commas separate", () => {
    const rows = parseCsv('Business Name,Address\nBella,"Shop 3, Village Precinct"')
    expect(rows[0].Address).toBe("Shop 3, Village Precinct")
  })
})

describe("inferColumnMapping — describing columns vs naming ones", () => {
  it("does not mistake a category column for the business name", () => {
    // "Business Type" holds "Restaurant / Commercial Foodservice". Taking it as
    // the name imports every row with a category where its name should be, and
    // the file looks like it worked.
    const mapping = inferColumnMapping(["Business Type", "Company Name", "First Name", "Email"])
    expect(mapping.businessName).toBe("Company Name")
    expect(mapping.industry).toBe("Business Type")
  })

  it("returns nothing rather than guessing when no column names the business", () => {
    const mapping = inferColumnMapping(["Business Type", "First Name", "Email"])
    expect(mapping.businessName).toBeNull()
  })

  it("still treats a column headed exactly 'Business' as the name", () => {
    expect(inferColumnMapping(["Business", "Contact"]).businessName).toBe("Business")
  })

  it("handles the words a hospitality list actually uses", () => {
    const mapping = inferColumnMapping(["Restaurant Name", "Contact Person", "Phone Number"])
    expect(mapping.businessName).toBe("Restaurant Name")
    expect(mapping.contactName).toBe("Contact Person")
    expect(mapping.phone).toBe("Phone Number")
  })

  it("separates a venue from its venue type", () => {
    const mapping = inferColumnMapping(["Venue Name", "Venue Type", "Contact Name"])
    expect(mapping.businessName).toBe("Venue Name")
    expect(mapping.industry).toBe("Venue Type")
  })

  it("does not let 'name' steal the contact column", () => {
    const mapping = inferColumnMapping(["Name", "Contact Name"])
    expect(mapping.businessName).toBe("Name")
    expect(mapping.contactName).toBe("Contact Name")
  })

  it("copes with underscores and other punctuation", () => {
    const mapping = inferColumnMapping(["business_name", "email_address"])
    expect(mapping.businessName).toBe("business_name")
    expect(mapping.email).toBe("email_address")
  })
})

describe("columnLooksCategorical", () => {
  it("recognises the column that caused a real bad import", () => {
    // These are the exact values that imported as nine business names.
    const values = [
      "Restaurant / Commercial Foodservice (e.g. QSR, Fine Dining, Cafe, Pub)",
      "Catering / Contract Foodservice",
      "Institutional Foodservice (e.g. Aged Care, Government, Workplace)",
      "Supplier",
      "Affiliated Segments (e.g. Consultant, Services, Student, etc.)",
      "Distributor / Wholesaler",
      "Accommodation (e.g. Hotel, Casino, Cruise)",
      "Retail (e.g. Grocery, Convenience, Speciality)",
    ]

    expect(columnLooksCategorical(values)).toBe(true)
  })

  it("leaves a column of real business names alone", () => {
    const values = [
      "Bella Napoli Pizzeria",
      "Coastal Hotels Group",
      "Coles Local",
      "Tony's Trattoria",
      "The Woodfire Co",
      "Pizza Luna",
    ]

    expect(columnLooksCategorical(values)).toBe(false)
  })

  it("spots a repeating category even when the words are short", () => {
    expect(columnLooksCategorical(["Cafe", "Cafe", "Pub", "Cafe", "Pub", "Cafe"])).toBe(true)
  })

  it("says nothing about a list too short to judge", () => {
    // Three venues that happen to repeat is not evidence of anything.
    expect(columnLooksCategorical(["Bella", "Bella", "Luna"])).toBe(false)
  })

  it("ignores blanks rather than counting them as repeats", () => {
    const values = ["Bella Napoli", "", "Coastal Hotels", "", "Coles Local", "", "Tony's", ""]
    expect(columnLooksCategorical(values)).toBe(false)
  })

  it("is not fooled by a long name that merely contains a slash", () => {
    const values = [
      "Smith & Sons Pty Ltd",
      "Jones / Baker Holdings Group Limited",
      "Coastal Hotels Group",
      "Bella Napoli Pizzeria",
      "The Woodfire Company",
      "Luna Restaurants Australia",
    ]

    expect(columnLooksCategorical(values)).toBe(false)
  })
})

describe("findHeaderRow", () => {
  it("skips the title and date lines an export puts on top", () => {
    const grid = parseGrid(`RDM Pizza — Prospect Export
Generated on 24/08/2026

Business Name,Email
Bella,a@b.com`)

    expect(grid[findHeaderRow(grid)]).toEqual(["Business Name", "Email"])
  })

  it("uses the first row when the file is tidy", () => {
    expect(findHeaderRow(parseGrid("Business Name,Email\nBella,a@b.com"))).toBe(0)
  })

  it("does not choose a row of numbers as the header", () => {
    const grid = parseGrid(`Business Name,Orders,Value
Bella,12,4500
Luna,8,3200`)

    expect(findHeaderRow(grid)).toBe(0)
  })

  it("reads the rows under a preamble correctly", () => {
    const rows = parseCsv(`Export
Generated today

Business Name,Email
Bella,a@b.com`)

    expect(rows).toEqual([{ "Business Name": "Bella", Email: "a@b.com" }])
  })
})
