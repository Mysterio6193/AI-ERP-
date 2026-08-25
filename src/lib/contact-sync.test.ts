import { describe, expect, it } from "vitest"
import { deriveContact, inferRole, isGenericMailbox } from "@/lib/contact-sync"

describe("inferRole", () => {
  it("reads the role out of a department mailbox", () => {
    // Which role it is decides who gets rung about an overdue invoice.
    expect(inferRole("accounts@venue.com.au")).toBe("accounts_payable")
    expect(inferRole("purchasing@pfdfoods.com.au")).toBe("buyer")
    expect(inferRole("orders@bidfood.com.au")).toBe("buyer")
    expect(inferRole("procurement@skylinecatering.com.au")).toBe("buyer")
  })

  it("reads a role out of the person's title when the address is personal", () => {
    expect(inferRole("marco@bellanapoli.com.au", "Marco Esposito, Head Chef")).toBe("chef")
    expect(inferRole("t@venue.com", "Tony Falcone (Owner)")).toBe("owner")
    expect(inferRole("j@venue.com", "Jo Smith - Venue Manager")).toBe("manager")
  })

  it("falls back to buyer rather than guessing wildly", () => {
    expect(inferRole("marco@bellanapoli.com.au", "Marco Esposito")).toBe("buyer")
    expect(inferRole(null, null)).toBe("buyer")
  })
})

describe("isGenericMailbox", () => {
  it("spots a shared mailbox", () => {
    expect(isGenericMailbox("orders@bidfood.com.au")).toBe(true)
    expect(isGenericMailbox("accounts@venue.com")).toBe(true)
    expect(isGenericMailbox("info@venue.com")).toBe(true)
  })

  it("does not mistake a person for a department", () => {
    expect(isGenericMailbox("marco@bellanapoli.com.au")).toBe(false)
    expect(isGenericMailbox("tony@tonystrattoria.com.au")).toBe(false)
  })

  it("does not match a name that merely starts with a department word", () => {
    // "sallyanne" starts with "sal", "information" starts with "info".
    expect(isGenericMailbox("sallyanne@venue.com")).toBe(false)
    expect(isGenericMailbox("officer.smith@venue.com")).toBe(false)
  })

  it("copes with a missing address", () => {
    expect(isGenericMailbox(null)).toBe(false)
    expect(isGenericMailbox("")).toBe(false)
  })
})

describe("deriveContact", () => {
  it("builds a contact from what the customer record already carries", () => {
    expect(
      deriveContact({
        contactPerson: "Marco Esposito",
        email: "marco@bellanapoli.com.au",
        phone: "02 9550 1122",
      })
    ).toMatchObject({
      name: "Marco Esposito",
      email: "marco@bellanapoli.com.au",
      phone: "02 9550 1122",
      role: "buyer",
      isPrimary: true,
    })
  })

  it("returns nothing when there is no name", () => {
    // A contact called "Unknown" is worse than an empty tab — it looks like an
    // answer.
    expect(deriveContact({ contactPerson: null, email: "orders@x.com", phone: "123" })).toBeNull()
    expect(deriveContact({ contactPerson: "   ", email: null, phone: null })).toBeNull()
  })

  it("warns when the address belongs to a department, not the person", () => {
    // Opening an email with "Hi orders@" is worse than not using a name.
    const contact = deriveContact({
      contactPerson: "Louise Fraser",
      email: "orders@bidfood.com.au",
      phone: null,
    })

    expect(contact?.notes).toMatch(/shared mailbox/)
    expect(contact?.notes).toContain("Louise")
  })

  it("leaves notes empty for a personal address", () => {
    const contact = deriveContact({
      contactPerson: "Marco Esposito",
      email: "marco@bellanapoli.com.au",
      phone: null,
    })

    expect(contact?.notes).toBeNull()
  })

  it("trims, and treats blank contact details as absent", () => {
    const contact = deriveContact({ contactPerson: "  Tony Falcone  ", email: "  ", phone: "  " })
    expect(contact).toMatchObject({ name: "Tony Falcone", email: null, phone: null })
  })
})
