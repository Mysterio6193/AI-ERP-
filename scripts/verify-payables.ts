/**
 * Accounts payable verification.
 *
 * Supplier had no invoice and no payment relation. Receiving goods created an
 * asset with nothing on the other side, so the books could not balance and no
 * screen could answer "what do we owe, to whom, by when".
 *
 * Walks the three-way match and checks the ledger after each step.
 *
 *   bun scripts/verify-payables.ts
 */
import { db } from "../src/lib/db"
import { ACCOUNTS, postPurchaseReceipt } from "../src/lib/ledger"
import { outstandingPayables, recordSupplierInvoice, recordSupplierPayment } from "../src/lib/payables"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()

/** Net movement on an account across the entries this probe created. */
async function movement(companyId: string, code: string, entryIds: string[]) {
  const lines = await db.journalLine.findMany({
    where: { journalEntryId: { in: entryIds }, account: { code, companyId } },
    select: { debit: true, credit: true },
  })
  const debit = lines.reduce((s, l) => s + Number(l.debit), 0)
  const credit = lines.reduce((s, l) => s + Number(l.credit), 0)
  return Math.round((debit - credit) * 100) / 100
}

async function entryIdsFor(refs: string[]) {
  const rows = await db.journalEntry.findMany({
    where: { referenceId: { in: refs } },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

async function main() {
  console.log("Accounts payable verification\n")

  const company = await db.company.findFirstOrThrow({ select: { id: true } })
  const supplier = await db.supplier.create({
    data: { name: `Probe Supplier ${STAMP}`, companyId: company.id, paymentTerms: 30, status: "active" },
    select: { id: true, name: true },
  })

  const po = await db.purchaseOrder.create({
    data: {
      poNumber: `PROBE-PO-${STAMP}`, supplierId: supplier.id, companyId: company.id,
      status: "sent", subtotal: 1000, taxAmount: 100, totalAmount: 1100,
    },
    select: { id: true },
  })

  const refs: string[] = []

  console.log("1. Goods arrive — asset up, GRNI up, Payables untouched")
  await postPurchaseReceipt(db, po.id, 1000, { referenceKey: `probe:1000` })
  refs.push(`${po.id}:probe:1000`)
  let ids = await entryIdsFor(refs)

  check(await movement(company.id, ACCOUNTS.inventory, ids) === 1000, "inventory debited 1000")
  check(await movement(company.id, ACCOUNTS.goodsReceivedNotInvoiced, ids) === -1000, "GRNI credited 1000")
  check(
    await movement(company.id, ACCOUNTS.accountsPayable, ids) === 0,
    "Accounts Payable is still zero — nobody has billed us yet"
  )

  console.log("\n2. The bill arrives — GRNI clears into Payables")
  const invoiceResult = await recordSupplierInvoice(db, {
    supplierId: supplier.id,
    invoiceNumber: `SUP-${STAMP}`,
    subtotal: 1000,
    taxAmount: 100,
    purchaseOrderId: po.id,
    companyId: company.id,
  })

  if (!invoiceResult.ok) throw new Error(invoiceResult.error)
  const invoiceId = invoiceResult.duplicate ? invoiceResult.invoiceId : invoiceResult.invoiceId
  refs.push(invoiceId)
  ids = await entryIdsFor(refs)

  check(await movement(company.id, ACCOUNTS.goodsReceivedNotInvoiced, ids) === 0,
    "GRNI is back to zero — received and billed now agree")
  check(await movement(company.id, ACCOUNTS.accountsPayable, ids) === -1100,
    "Payables carries the gross 1100")
  check(await movement(company.id, ACCOUNTS.taxPayable, ids) === 100,
    "GST debited 100 as an input credit, not treated as cost")

  const invoiceRow = await db.supplierInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { dueDate: true, invoiceDate: true, outstandingAmt: true, status: true },
  })
  const days = Math.round((invoiceRow.dueDate.getTime() - invoiceRow.invoiceDate.getTime()) / 86400000)
  check(days === 30, "due date follows the supplier's Net 30 terms", `${days} days`)

  console.log("\n3. A duplicate invoice number is refused, not merged")
  const dup = await recordSupplierInvoice(db, {
    supplierId: supplier.id, invoiceNumber: `SUP-${STAMP}`, subtotal: 1000, taxAmount: 100, companyId: company.id,
  })
  check(dup.ok && dup.duplicate === true, "flagged as a duplicate")
  const invoiceCount = await db.supplierInvoice.count({ where: { supplierId: supplier.id } })
  check(invoiceCount === 1, "still one invoice on file", `${invoiceCount}`)

  console.log("\n4. Paying part of it")
  const pay1 = await recordSupplierPayment(db, {
    supplierInvoiceId: invoiceId, amount: 400, reference: `BANK-${STAMP}-1`,
  })
  if (!pay1.ok) throw new Error(pay1.error)
  refs.push(pay1.duplicate ? pay1.paymentId : pay1.paymentId)

  const afterPart = await db.supplierInvoice.findUniqueOrThrow({
    where: { id: invoiceId }, select: { outstandingAmt: true, status: true },
  })
  check(afterPart.outstandingAmt === 700, "700 still outstanding", String(afterPart.outstandingAmt))
  check(afterPart.status === "partial", "marked partial", afterPart.status)

  console.log("\n5. Replaying the same bank reference does not pay twice")
  const replay = await recordSupplierPayment(db, {
    supplierInvoiceId: invoiceId, amount: 400, reference: `BANK-${STAMP}-1`,
  })
  check(replay.ok && replay.duplicate === true, "recognised as already paid")
  const payCount = await db.supplierPayment.count({ where: { supplierInvoiceId: invoiceId } })
  check(payCount === 1, "still one payment recorded", `${payCount}`)

  console.log("\n6. Overpaying is clamped, not allowed to go negative")
  const pay2 = await recordSupplierPayment(db, {
    supplierInvoiceId: invoiceId, amount: 5000, reference: `BANK-${STAMP}-2`,
  })
  if (!pay2.ok) throw new Error(pay2.error)
  refs.push(pay2.duplicate ? pay2.paymentId : pay2.paymentId)

  const settled = await db.supplierInvoice.findUniqueOrThrow({
    where: { id: invoiceId }, select: { outstandingAmt: true, status: true, paidAmount: true },
  })
  check(settled.outstandingAmt === 0, "nothing outstanding", String(settled.outstandingAmt))
  check(settled.paidAmount === 1100, "paid exactly the invoice total, not 5400", String(settled.paidAmount))
  check(settled.status === "paid", "marked paid", settled.status)

  console.log("\n7. The books balance across the whole cycle")
  ids = await entryIdsFor(refs)
  check(await movement(company.id, ACCOUNTS.accountsPayable, ids) === 0, "Payables settled back to zero")
  check(await movement(company.id, ACCOUNTS.bank, ids) === -1100, "bank down by the amount paid")
  check(await movement(company.id, ACCOUNTS.inventory, ids) === 1000, "inventory holds the goods value")

  const owed = await outstandingPayables(db, company.id)
  check(!owed.invoices.some((i) => i.id === invoiceId), "settled invoice drops off the payables list")

  // ---------------------------------------------------------------- cleanup
  const entries = await db.journalEntry.findMany({ where: { referenceId: { in: refs } }, select: { id: true } })
  await db.journalLine.deleteMany({ where: { journalEntryId: { in: entries.map((e) => e.id) } } })
  await db.journalEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } })
  await db.supplierPayment.deleteMany({ where: { supplierInvoiceId: invoiceId } })
  await db.supplierInvoice.deleteMany({ where: { supplierId: supplier.id } })
  await db.purchaseOrder.deleteMany({ where: { id: po.id } })
  await db.supplier.deleteMany({ where: { id: supplier.id } })
  console.log("\n   (probe supplier, PO, bill, payments and entries removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
