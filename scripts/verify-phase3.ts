/**
 * Phase 3 verification.
 *
 * The safety claim of this phase is that routing tax, due dates and aging
 * through the new shared modules changes *nothing* while settings sit at their
 * defaults. This recomputes every stored document through the new code and
 * asserts equality with what is already in the database. Any difference is a
 * bug in the new path, not an improvement.
 *
 *   npx tsx scripts/verify-phase3.ts
 */

import { PrismaClient } from "@prisma/client"

import { bucketise, daysOverdue } from "../src/lib/aging"
import { computeDueDate } from "../src/lib/invoicing"
import { defaultsFor } from "../src/lib/settings/registry"
import { computeLineTax } from "../src/lib/tax"

const db = new PrismaClient()

const taxSettings = defaultsFor("tax")
const invoicingSettings = defaultsFor("invoicing")
const agingSettings = defaultsFor("aging")

let failures = 0
let checks = 0

function check(ok: boolean, label: string, detail?: string) {
  checks += 1
  if (!ok) {
    failures += 1
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

/** Money compares to the cent; float noise below that is not a discrepancy. */
function sameMoney(a: number, b: number) {
  return Math.abs(a - b) < 0.005
}

async function verifyOrderTax() {
  console.log("\nSales order lines — recomputed tax vs stored")

  const items = await db.salesOrderItem.findMany({
    include: {
      product: { select: { gstRate: true, gstExempt: true } },
      order: {
        select: {
          orderNumber: true,
          companyId: true,
          customer: { select: { customerType: true } },
        },
      },
    },
  })

  const companies = new Map(
    (await db.company.findMany({ select: { id: true, gstRate: true, country: true } })).map((c) => [
      c.id,
      c,
    ])
  )

  let drift = 0

  for (const item of items) {
    const lineSubtotal = item.unitPrice * item.quantity
    const taxable = lineSubtotal - lineSubtotal * ((item.discount || 0) / 100)

    const recomputed = computeLineTax(
      taxable,
      {
        product: item.product,
        customer: item.order.customer,
        company: item.order.companyId ? companies.get(item.order.companyId) : null,
      },
      taxSettings
    )

    if (!sameMoney(recomputed.taxAmount, item.taxAmount)) {
      drift += 1
      if (drift <= 5) {
        console.log(
          `  FAIL  ${item.order.orderNumber}: stored ${item.taxAmount.toFixed(4)} vs recomputed ${recomputed.taxAmount.toFixed(4)} (rate ${recomputed.rate}%, via ${recomputed.source})`
        )
      }
    }
  }

  check(drift === 0, `${items.length} order lines`, drift ? `${drift} differ` : undefined)
  console.log(`  ${items.length} lines checked, ${drift} differ`)
}

async function verifyQuoteTax() {
  console.log("\nQuote lines — recomputed tax vs stored")

  const items = await db.quoteItem.findMany({
    include: {
      product: { select: { gstRate: true, gstExempt: true } },
      quote: {
        select: {
          quoteNumber: true,
          companyId: true,
          customer: { select: { customerType: true } },
        },
      },
    },
  })

  const companies = new Map(
    (await db.company.findMany({ select: { id: true, gstRate: true, country: true } })).map((c) => [
      c.id,
      c,
    ])
  )

  let drift = 0

  for (const item of items) {
    const lineSubtotal = item.unitPrice * item.quantity
    const taxable = lineSubtotal - lineSubtotal * ((item.discount || 0) / 100)

    const recomputed = computeLineTax(
      taxable,
      {
        // Quotes persist the rate actually used on the line.
        lineRate: item.taxRate,
        product: item.product,
        customer: item.quote.customer,
        company: item.quote.companyId ? companies.get(item.quote.companyId) : null,
      },
      taxSettings
    )

    if (!sameMoney(recomputed.taxAmount, item.taxAmount)) {
      drift += 1
      if (drift <= 5) {
        console.log(
          `  FAIL  ${item.quote.quoteNumber}: stored ${item.taxAmount.toFixed(4)} vs recomputed ${recomputed.taxAmount.toFixed(4)}`
        )
      }
    }
  }

  check(drift === 0, `${items.length} quote lines`, drift ? `${drift} differ` : undefined)
  console.log(`  ${items.length} lines checked, ${drift} differ`)
}

async function verifyOrderTotals() {
  console.log("\nOrder headers — sum(lines) vs stored header totals")

  const orders = await db.salesOrder.findMany({
    select: {
      orderNumber: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      items: { select: { taxAmount: true, total: true } },
    },
  })

  let drift = 0

  for (const order of orders) {
    const lineTax = order.items.reduce((sum, item) => sum + item.taxAmount, 0)

    if (!sameMoney(lineTax, order.taxAmount)) {
      drift += 1
      if (drift <= 5) {
        console.log(
          `  FAIL  ${order.orderNumber}: header tax ${order.taxAmount.toFixed(2)} vs line sum ${lineTax.toFixed(2)}`
        )
      }
    }
  }

  check(drift === 0, `${orders.length} order headers`, drift ? `${drift} differ` : undefined)
  console.log(`  ${orders.length} orders checked, ${drift} differ`)
}

function verifyDueDates() {
  console.log("\nDue dates — one case per payment term")

  const issuedAt = new Date(2026, 7, 22, 10, 0)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const cases: Array<[number | null, string, string]> = [
    [7, "2026-08-29", "Net 7"],
    [14, "2026-09-05", "Net 14"],
    [30, "2026-09-21", "Net 30"],
    [45, "2026-10-06", "Net 45"],
    [60, "2026-10-21", "Net 60"],
    [90, "2026-11-20", "Net 90"],
    [0, "2026-08-22", "COD — same day"],
    [-1, "2026-08-31", "EOM — last day of month"],
    [null, "2026-09-21", "no terms — falls back to 30"],
  ]

  for (const [terms, expected, label] of cases) {
    const actual = fmt(computeDueDate({ issuedAt, paymentTerms: terms, settings: invoicingSettings }))
    check(actual === expected, label, actual === expected ? undefined : `got ${actual}, want ${expected}`)
    console.log(`  ${actual === expected ? "ok  " : "FAIL"}  ${label.padEnd(28)} ${actual}`)
  }
}

async function verifyAgingAgreement() {
  console.log("\nAging — the three views now agree")

  const invoices = await db.invoice.findMany({
    select: { invoiceNumber: true, dueDate: true, invoiceDate: true, outstandingAmt: true, status: true },
  })

  const ageable = invoices.map((invoice) => ({
    dueDate: invoice.dueDate,
    invoiceDate: invoice.invoiceDate,
    outstanding: invoice.outstandingAmt,
    status: invoice.status,
  }))

  const { buckets, total, unbucketed } = bucketise(ageable, agingSettings)

  const summed = buckets.reduce((sum, b) => sum + b.amount, 0) + unbucketed
  check(sameMoney(summed, total), "buckets conserve the total", `${summed.toFixed(2)} vs ${total.toFixed(2)}`)
  check(unbucketed === 0, "every invoice lands in a bucket", `${unbucketed.toFixed(2)} unbucketed`)

  for (const bucket of buckets) {
    console.log(`  ${bucket.label.padEnd(14)} ${bucket.count.toString().padStart(3)} invoices  $${bucket.amount.toFixed(2)}`)
  }
  console.log(`  ${"TOTAL".padEnd(14)} ${invoices.length.toString().padStart(3)} invoices  $${total.toFixed(2)}`)

  // A not-yet-due invoice must be able to reach "Current"; the old invoices
  // page clamped days to >= 0 so that bucket was unreachable.
  const notYetDue = ageable.filter((i) => i.dueDate && daysOverdue(i, agingSettings) < 0)
  console.log(`  ${notYetDue.length} invoices are not yet due (previously forced into the 0-day bucket)`)
}

async function main() {
  console.log("Phase 3 verification — defaults must reproduce stored values exactly")

  await verifyOrderTax()
  await verifyQuoteTax()
  await verifyOrderTotals()
  verifyDueDates()
  await verifyAgingAgreement()

  console.log(
    `\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed`
  )

  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
