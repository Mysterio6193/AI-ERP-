import { describe, expect, it } from "vitest"

import { canRaiseInvoices, isValidAbn, isValidBsb, validateCompany } from "@/lib/companies"

/**
 * A company record is whose name, ABN and bank account appear on an invoice, so
 * these tests are about what makes a document payable rather than tidy input.
 */

const valid = {
  name: "RDM Manufacturing Pty Ltd",
  abn: "41 615 988 415",
  bsb: "062-000",
  accountNumber: "10293847",
}

describe("isValidAbn", () => {
  it("accepts a genuinely valid ABN", () => {
    // The ABR's own worked example, plus RDM Manufacturing's, which passes.
    expect(isValidAbn("51 824 753 556")).toBe(true)
    expect(isValidAbn("41 615 988 415")).toBe(true)
  })

  it("catches the invalid ABNs this database was carrying", () => {
    // Found by running this checksum against the live records: two of the three
    // companies held ABNs that fail it. An invalid ABN makes a tax invoice not
    // a tax invoice, so these must be corrected before anyone bills.
    expect(isValidAbn("68 621 344 902")).toBe(false)
    expect(isValidAbn("27 654 321 098")).toBe(false)
  })

  it("rejects a transposed pair, which length alone cannot catch", () => {
    expect(isValidAbn("41 615 988 451")).toBe(false)
  })

  it("rejects anything that is not eleven digits", () => {
    for (const abn of ["", "123", "4161598841", "416159884155", "abcdefghijk"]) {
      expect(isValidAbn(abn)).toBe(false)
    }
  })

  it("ignores the spaces people type", () => {
    expect(isValidAbn("41615988415")).toBe(true)
  })
})

describe("isValidBsb", () => {
  it("accepts six digits written either way", () => {
    expect(isValidBsb("062000")).toBe(true)
    expect(isValidBsb("062-000")).toBe(true)
  })

  it("rejects the wrong length", () => {
    expect(isValidBsb("06200")).toBe(false)
    expect(isValidBsb("0620001")).toBe(false)
  })
})

describe("validateCompany", () => {
  it("accepts a real entity", () => {
    const verdict = validateCompany(valid)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.company.name).toBe("RDM Manufacturing Pty Ltd")
  })

  it("requires a name, because it goes on every invoice", () => {
    const verdict = validateCompany({ ...valid, name: "  " })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.field).toBe("name")
  })

  it("refuses the invented bank details this system was carrying", () => {
    // Super Veloce held 012-345 / 55667788 — a sequential BSB and a
    // repeating-pair account. An invoice with those asks a customer to pay
    // an account that either bounces or belongs to somebody else.
    const verdict = validateCompany({ ...valid, bsb: "012345", accountNumber: "55667788" })

    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error).toMatch(/made up/i)
  })

  it("refuses a straight-run account number", () => {
    const verdict = validateCompany({ ...valid, accountNumber: "12345678" })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.field).toBe("accountNumber")
  })

  it("refuses an ABN that fails its checksum", () => {
    const verdict = validateCompany({ ...valid, abn: "12 345 678 901" })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.field).toBe("abn")
  })

  it("allows a company with no bank details yet", () => {
    // Legitimate: the entity exists before the account is opened. It simply
    // cannot bill until it has one, which canRaiseInvoices enforces.
    const verdict = validateCompany({ name: "New Entity Pty Ltd" })
    expect(verdict.ok).toBe(true)
  })

  it("defaults country and currency rather than leaving them unset", () => {
    const verdict = validateCompany({ name: "X Pty Ltd" })
    if (verdict.ok) {
      expect(verdict.company.country).toBe("AU")
      expect(verdict.company.baseCurrency).toBe("AUD")
    }
  })

  it("follows the country when it is not Australia", () => {
    const verdict = validateCompany({ name: "X Pvt Ltd", country: "IN" })
    if (verdict.ok) expect(verdict.company.baseCurrency).toBe("INR")
  })

  it("trims what people paste", () => {
    const verdict = validateCompany({ name: "  RDM Retail Pty Ltd  ", email: " a@b.com " })
    if (verdict.ok) {
      expect(verdict.company.name).toBe("RDM Retail Pty Ltd")
      expect(verdict.company.email).toBe("a@b.com")
    }
  })
})

describe("canRaiseInvoices", () => {
  it("is satisfied by a complete entity", () => {
    expect(canRaiseInvoices({ abn: "41615988415", bsb: "062000", accountNumber: "10293847" }).ok).toBe(true)
  })

  it("names everything missing at once, not one at a time", () => {
    const verdict = canRaiseInvoices({})
    expect(verdict.ok).toBe(false)
    expect(verdict.missing).toEqual(["ABN", "BSB", "account number"])
  })

  it("blocks billing when only the account is missing", () => {
    const verdict = canRaiseInvoices({ abn: "41615988415", bsb: "062000" })
    expect(verdict.ok).toBe(false)
    expect(verdict.missing).toEqual(["account number"])
  })
})
