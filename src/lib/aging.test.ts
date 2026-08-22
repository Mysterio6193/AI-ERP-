import { describe, expect, it } from "vitest"

import { bucketise, daysBetween, daysOverdue } from "./aging"
import { defaultsFor } from "./settings/registry"

const settings = defaultsFor("aging")
const asOf = new Date(2026, 7, 22)

/** An invoice due `days` before `asOf`. Negative means not yet due. */
function invoiceDue(daysPastDue: number, outstanding = 100, status = "unpaid") {
  const dueDate = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() - daysPastDue)
  return { dueDate, outstanding, status }
}

describe("daysBetween", () => {
  it("counts calendar days, ignoring time of day", () => {
    expect(daysBetween(new Date(2026, 7, 22, 23, 59), new Date(2026, 7, 23, 0, 1))).toBe(1)
    expect(daysBetween(new Date(2026, 7, 22, 1, 0), new Date(2026, 7, 22, 23, 0))).toBe(0)
  })

  it("survives a daylight-saving transition without drifting", () => {
    // Sydney DST starts 2026-10-04. A naive /86400000 gives 30.958 days here,
    // which floors to 30 and lands an invoice in the wrong bucket.
    expect(daysBetween(new Date(2026, 8, 20), new Date(2026, 9, 20))).toBe(30)
  })
})

describe("daysOverdue", () => {
  it("returns a negative number for an invoice not yet due", () => {
    // The invoices page clamped this to 0, so nothing ever landed in "Current".
    expect(daysOverdue(invoiceDue(-10), settings, asOf)).toBe(-10)
  })

  it("ages from the invoice date when configured to", () => {
    const byInvoiceDate = { ...settings, basis: "invoiceDate" as const }
    const invoice = {
      dueDate: new Date(2026, 7, 20),
      invoiceDate: new Date(2026, 6, 20),
      outstanding: 100,
    }

    expect(daysOverdue(invoice, settings, asOf)).toBe(2)
    expect(daysOverdue(invoice, byInvoiceDate, asOf)).toBe(33)
  })

  it("falls back to the other date rather than throwing when one is missing", () => {
    expect(
      daysOverdue({ dueDate: null, invoiceDate: new Date(2026, 7, 12), outstanding: 100 }, settings, asOf)
    ).toBe(10)
    expect(daysOverdue({ dueDate: null, outstanding: 100 }, settings, asOf)).toBe(0)
  })
})

describe("bucketise", () => {
  it("places invoices in the right bucket, including not-yet-due as Current", () => {
    const { buckets, total } = bucketise(
      [
        invoiceDue(-5, 100), // Current
        invoiceDue(0, 200), // Current — due today, not late
        invoiceDue(1, 300), // 1-30
        invoiceDue(30, 400), // 1-30
        invoiceDue(31, 500), // 31-60
        invoiceDue(75, 600), // 61-90
        invoiceDue(400, 700), // 90+
      ],
      settings,
      asOf
    )

    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b.amount]))

    expect(byLabel["Current"]).toBe(300)
    expect(byLabel["1-30 days"]).toBe(700)
    expect(byLabel["31-60 days"]).toBe(500)
    expect(byLabel["61-90 days"]).toBe(600)
    expect(byLabel["90+ days"]).toBe(700)
    expect(total).toBe(2800)
  })

  it("puts every boundary day on exactly one side", () => {
    for (const [days, label] of [
      [0, "Current"],
      [1, "1-30 days"],
      [30, "1-30 days"],
      [31, "31-60 days"],
      [60, "31-60 days"],
      [61, "61-90 days"],
      [90, "61-90 days"],
      [91, "90+ days"],
    ] as const) {
      const { buckets } = bucketise([invoiceDue(days, 10)], settings, asOf)
      const hit = buckets.filter((b) => b.count > 0)

      expect(hit, `${days} days should land in exactly one bucket`).toHaveLength(1)
      expect(hit[0].label, `${days} days`).toBe(label)
    }
  })

  it("excludes settled invoices", () => {
    const { buckets, total } = bucketise(
      [
        invoiceDue(40, 100, "paid"),
        invoiceDue(40, 200, "cancelled"),
        invoiceDue(40, 300, "void"),
        invoiceDue(40, 400, "unpaid"),
        invoiceDue(40, 500, "overdue"),
        invoiceDue(40, 600, "partial"),
      ],
      settings,
      asOf
    )

    expect(total).toBe(1500)
    expect(buckets.find((b) => b.label === "31-60 days")?.count).toBe(3)
  })

  it("reports amounts that match no bucket instead of dropping them", () => {
    // The PDF's implementation silently dropped these, understating the debt.
    const gappy = {
      ...settings,
      buckets: [{ label: "Only 1-30", minDays: 1, maxDays: 30 }],
    }

    const { total, unbucketed, buckets } = bucketise(
      [invoiceDue(10, 100), invoiceDue(200, 900)],
      gappy,
      asOf
    )

    expect(buckets[0].amount).toBe(100)
    expect(unbucketed).toBe(900)
    expect(total).toBe(1000)
    expect(buckets.reduce((sum, b) => sum + b.amount, 0) + unbucketed).toBe(total)
  })

  it("ignores zero-balance invoices", () => {
    const { total, buckets } = bucketise([invoiceDue(40, 0)], settings, asOf)

    expect(total).toBe(0)
    expect(buckets.every((b) => b.count === 0)).toBe(true)
  })

  it("always conserves the total across buckets", () => {
    const invoices = [
      invoiceDue(-3, 111.11),
      invoiceDue(15, 222.22),
      invoiceDue(45, 333.33),
      invoiceDue(80, 444.44),
      invoiceDue(365, 555.55),
    ]

    const { buckets, total, unbucketed } = bucketise(invoices, settings, asOf)
    const summed = buckets.reduce((sum, b) => sum + b.amount, 0) + unbucketed

    expect(summed).toBeCloseTo(total, 10)
    expect(total).toBeCloseTo(1666.65, 10)
  })
})
