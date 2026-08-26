import { describe, expect, it } from "vitest"

import { canManage, connectionWhere, describeScope } from "@/lib/integrations/lookup"
import { getProvider } from "@/lib/integrations/providers"

const gmail = getProvider("gmail")!
const stripe = getProvider("stripe")!
const owner = { userId: "user_1", companyId: "company_1" }

describe("connectionWhere", () => {
  it("finds a mailbox by the person who owns it", () => {
    expect(connectionWhere(gmail, owner)).toEqual({ provider: "gmail", scope: "user", userId: "user_1" })
  })

  it("finds a payment gateway by the company, not the person", () => {
    // Otherwise the business loses its ability to bill when whoever connected
    // Stripe leaves.
    expect(connectionWhere(stripe, owner)).toEqual({ provider: "stripe", scope: "company", companyId: "company_1" })
  })

  it("gives two colleagues separate mailboxes", () => {
    const a = connectionWhere(gmail, { userId: "user_1", companyId: "c" })
    const b = connectionWhere(gmail, { userId: "user_2", companyId: "c" })
    expect(a).not.toEqual(b)
  })

  it("gives two colleagues the same gateway", () => {
    const a = connectionWhere(stripe, { userId: "user_1", companyId: "c" })
    const b = connectionWhere(stripe, { userId: "user_2", companyId: "c" })
    expect(a).toEqual(b)
  })
})

describe("canManage", () => {
  it("lets anyone connect their own mailbox", () => {
    for (const role of ["admin", "sales", "warehouse", "accounts"]) {
      expect(canManage(gmail, role)).toBe(true)
    }
  })

  it("restricts the company gateway to an admin", () => {
    // Disconnecting it stops every invoice being payable.
    expect(canManage(stripe, "admin")).toBe(true)
    expect(canManage(stripe, "sales")).toBe(false)
  })
})

describe("describeScope", () => {
  it("says plainly who a disconnection affects", () => {
    expect(describeScope(gmail)).toMatch(/your account only/i)
    expect(describeScope(stripe)).toMatch(/everyone at this company/i)
  })
})
