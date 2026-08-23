import { describe, expect, it } from "vitest"

import {
  defaultsFor,
  isNamespace,
  listNamespaces,
  numberingSchema,
  taxSchema,
} from "./registry"

/**
 * The safety property of this whole layer is that **defaults reproduce today's
 * behaviour**. If a default drifts, turning settings on silently changes tax,
 * due dates or document numbers across the system — which is exactly the class
 * of change nobody notices until a customer does.
 *
 * These assertions are pinned to the values that were hardcoded before.
 */

describe("defaults reproduce existing behaviour", () => {
  it("leaves tax inheriting the company rate rather than inventing one", () => {
    const tax = defaultsFor("tax")

    // null means "use Company.gstRate" - the field the settings page already
    // exposed but nothing read.
    expect(tax.defaultRate).toBeNull()
    expect(tax.country).toBeNull()
    expect(tax.resolutionOrder).toEqual(["line", "product", "customer", "company"])
  })

  it("keeps tax-inclusive pricing off", () => {
    // Implementing this changes every total; it must not arrive by default.
    expect(defaultsFor("tax").pricesIncludeTax).toBe(false)
  })

  it("matches the previous hardcoded +30 day invoice due date", () => {
    const invoicing = defaultsFor("invoicing")

    expect(invoicing.fallbackDays).toBe(30)
    expect(invoicing.fixedDays).toBe(30)
    // But now prefers the customer's actual terms, which was the bug.
    expect(invoicing.dueDateSource).toBe("customerTerms")
  })

  it("keeps price lists off, since turning them on changes what customers pay", () => {
    const pricing = defaultsFor("pricing")

    expect(pricing.enablePriceLists).toBe(false)
    expect(pricing.enableDiscountRules).toBe(false)
    expect(pricing.fallback).toBe("wholesalePrice")
  })

  it("keeps every document counter off so legacy generators still run", () => {
    const numbering = defaultsFor("numbering")

    for (const [kind, format] of Object.entries(numbering)) {
      // `expense` is the one exception: there was no expenses API before, so
      // there is no legacy generator to preserve and it starts on the counter.
      if (kind === "expense") {
        expect(format.useCounter, "expense has no legacy path to fall back to").toBe(true)
        continue
      }

      expect(format.useCounter, `${kind} must start on the legacy generator`).toBe(false)
    }
  })

  it("reproduces each existing document number format", () => {
    const numbering = defaultsFor("numbering")

    // Pad widths differ per kind in the existing code; they must be preserved
    // or sequence continuation breaks when parsing the previous number.
    expect(numbering.salesOrder).toMatchObject({ prefix: "SO", pad: 5, start: 1001 })
    expect(numbering.invoice).toMatchObject({ prefix: "INV", pad: 5, start: 1001 })
    expect(numbering.productionOrder).toMatchObject({ prefix: "PRD", pad: 4 })
    expect(numbering.freightBooking).toMatchObject({ prefix: "FB", pad: 4 })
    expect(numbering.route).toMatchObject({ prefix: "RT", pad: 3, dateToken: "YYYYMMDD" })
  })

  it("gives aging five buckets ending open-ended", () => {
    const aging = defaultsFor("aging")

    expect(aging.buckets).toHaveLength(5)
    expect(aging.buckets.at(-1)?.maxDays).toBeNull()
    expect(aging.basis).toBe("dueDate")
  })

  it("provides complete defaults for branding, dashboard, automation, and agent persona", () => {
    const branding = defaultsFor("branding")
    expect(branding.primaryColor).toBe("sky")
    expect(branding.showPaymentQrOnInvoice).toBe(true)

    const dashboard = defaultsFor("dashboard")
    expect(dashboard.showSalesTrend).toBe(true)
    expect(dashboard.kpiCardsVisible.length).toBeGreaterThan(0)

    const automation = defaultsFor("automation")
    expect(automation.blockOrdersOnCreditHold).toBe(true)

    const agent = defaultsFor("agentPersona")
    expect(agent.tone).toBe("professional")
  })
})

describe("schema validation", () => {
  it("rejects an out-of-range tax rate", () => {
    expect(taxSchema.safeParse({ defaultRate: 150 }).success).toBe(false)
    expect(taxSchema.safeParse({ defaultRate: -1 }).success).toBe(false)
  })

  it("accepts a valid tax rate and a null one", () => {
    expect(taxSchema.safeParse({ defaultRate: 18 }).success).toBe(true)
    expect(taxSchema.safeParse({ defaultRate: null }).success).toBe(true)
  })

  it("rejects an empty numbering prefix", () => {
    const result = numberingSchema.safeParse({
      salesOrder: { prefix: "", dateToken: "YYYY", pad: 5, start: 1, reset: "yearly" },
    })

    expect(result.success).toBe(false)
  })

  it("rejects an unknown reset policy", () => {
    const result = numberingSchema.safeParse({
      salesOrder: { prefix: "SO", dateToken: "YYYY", pad: 5, start: 1, reset: "fortnightly" },
    })

    expect(result.success).toBe(false)
  })

  it("fills defaults for namespaces omitted from a partial parse", () => {
    const parsed = numberingSchema.parse({})

    expect(parsed.quote.prefix).toBe("QT")
  })
})

describe("registry", () => {
  it("recognises real namespaces and rejects anything else", () => {
    expect(isNamespace("tax")).toBe(true)
    expect(isNamespace("nonsense")).toBe(false)
    // Guards the API route against a path segment being treated as a namespace.
    expect(isNamespace("__proto__")).toBe(false)
  })

  it("gives every namespace a label, description and write roles", () => {
    for (const entry of listNamespaces()) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
      expect(entry.writeRoles.length).toBeGreaterThan(0)
    }
  })

  it("never grants write access to every role by default", () => {
    // Numbering and pricing change money and document identity.
    for (const entry of listNamespaces()) {
      expect(entry.writeRoles).not.toContain("driver")
      expect(entry.writeRoles).toContain("admin")
    }
  })
})
