/**
 * Credit note verification.
 *
 * CreditNote was written in exactly one place — completing a return — and even
 * there it only moved Customer.creditBalance. It never reduced the invoice it
 * credited and never reached the ledger, so an invoice could be fully credited
 * and still read as owing.
 *
 *   bun scripts/verify-credit-notes.ts
 */
import { db } from "../src/lib/db"
import { issueCreditNote, voidInvoice } from "../src/lib/credit-notes"
import { ACCOUNTS } from "../src/lib/ledger"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()
const refs: string[] = []
const orders: string[] = []
const invoices: string[] = []

/**
 * Runs whether or not the probe succeeded. An earlier version cleaned up only
 * on the happy path, so a mid-run failure left probe invoices behind in a
 * database other people are also using.
 */
async function cleanup() {
  const entries = await db.journalEntry.findMany({
    where: { referenceId: { in: refs } }, select: { id: true },
  })
  await db.journalLine.deleteMany({ where: { journalEntryId: { in: entries.map((e) => e.id) } } })
  await db.journalEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } })
  await db.creditTransaction.deleteMany({ where: { referenceId: { in: refs } } })
  await db.creditNote.deleteMany({ where: { id: { in: refs } } })
  await db.invoice.deleteMany({ where: { id: { in: invoices } } })
  await db.salesOrder.deleteMany({ where: { id: { in: orders } } })
}

async function movement(companyId: string, code: string, ids: string[]) {
  const lines = await db.journalLine.findMany({
    where: { journalEntryId: { in: ids }, account: { code, companyId } },
    select: { debit: true, credit: true },
  })
  const d = lines.reduce((s, l) => s + Number(l.debit), 0)
  const c = lines.reduce((s, l) => s + Number(l.credit), 0)
  return Math.round((d - c) * 100) / 100
}
const idsFor = async () =>
  (await db.journalEntry.findMany({ where: { referenceId: { in: refs } }, select: { id: true } })).map((e) => e.id)

async function makeInvoice(n: number, subtotal = 1000, tax = 100) {
  const company = await db.company.findFirstOrThrow({ select: { id: true } })
  const customer = await db.customer.findFirstOrThrow({ select: { id: true } })
  const order = await db.salesOrder.create({
    data: {
      orderNumber: `PROBE-CN-SO-${STAMP}-${n}`, customerId: customer.id, companyId: company.id,
      status: "invoiced", subtotal, taxAmount: tax, totalAmount: subtotal + tax,
    },
    select: { id: true },
  })
  const invoice = await db.invoice.create({
    data: {
      invoiceNumber: `PROBE-CN-INV-${STAMP}-${n}`, orderId: order.id,
      customerId: customer.id, companyId: company.id,
      subtotal, taxAmount: tax, totalAmount: subtotal + tax,
      status: "unpaid", paidAmount: 0, outstandingAmt: subtotal + tax, dueDate: new Date(),
    },
    select: { id: true, invoiceNumber: true },
  })
  return { company, customer, order, invoice }
}

async function main() {
  console.log("Credit note verification\n")

  const { company, customer, order, invoice } = await makeInvoice(1)
  orders.push(order.id)
  invoices.push(invoice.id)

  console.log("1. A partial credit reduces the invoice, not just the account")
  const partial = await issueCreditNote(db, {
    customerId: customer.id, invoiceId: invoice.id,
    amount: 200, taxAmount: 20, reason: "Damaged carton", companyId: company.id,
  })
  if (!partial.ok) throw new Error(partial.error)
  refs.push(partial.creditNoteId)

  const afterPartial = await db.invoice.findUniqueOrThrow({
    where: { id: invoice.id }, select: { outstandingAmt: true, status: true },
  })
  check(afterPartial.outstandingAmt === 880, "outstanding fell from 1100 to 880", String(afterPartial.outstandingAmt))
  check(partial.invoiceOutstanding === 880, "and the result reports it", String(partial.invoiceOutstanding))

  let ids = await idsFor()
  check(await movement(company.id, ACCOUNTS.accountsReceivable, ids) === -220, "receivables credited 220 in the ledger")
  check(await movement(company.id, ACCOUNTS.salesRevenue, ids) === 200, "revenue reversed by the net")
  check(await movement(company.id, ACCOUNTS.taxPayable, ids) === 20, "GST reversed too, not kept")

  console.log("\n2. Over-crediting is refused")
  const tooMuch = await issueCreditNote(db, {
    customerId: customer.id, invoiceId: invoice.id,
    amount: 5000, reason: "Oops", companyId: company.id,
  })
  check(tooMuch.ok === false, "refused", tooMuch.ok ? "" : tooMuch.error)

  console.log("\n3. A credit note needs a reason and a positive amount")
  check((await issueCreditNote(db, { customerId: customer.id, amount: 10, reason: "  ", companyId: company.id })).ok === false, "blank reason refused")
  check((await issueCreditNote(db, { customerId: customer.id, amount: 0, reason: "x", companyId: company.id })).ok === false, "zero amount refused")

  console.log("\n4. Crediting another customer's invoice is refused")
  const other = await db.customer.findFirst({ where: { id: { not: customer.id } }, select: { id: true } })
  if (other) {
    const wrong = await issueCreditNote(db, {
      customerId: other.id, invoiceId: invoice.id, amount: 10, reason: "x", companyId: company.id,
    })
    check(wrong.ok === false, "refused", wrong.ok ? "" : wrong.error)
  } else {
    console.log("     (only one customer on file; skipped)")
  }

  console.log("\n5. Voiding an unpaid invoice credits it in full")
  const second = await makeInvoice(2)
  orders.push(second.order.id)
  invoices.push(second.invoice.id)

  const voided = await voidInvoice(db, second.invoice.id, "Billed in error")
  if (!voided.ok) throw new Error(voided.error)
  refs.push(voided.creditNoteId)

  const afterVoid = await db.invoice.findUniqueOrThrow({
    where: { id: second.invoice.id }, select: { outstandingAmt: true, status: true },
  })
  check(voided.credited === 1100, "credited the full gross", String(voided.credited))
  check(afterVoid.outstandingAmt === 0, "nothing outstanding", String(afterVoid.outstandingAmt))
  check(afterVoid.status === "credited", "marked credited, not deleted", afterVoid.status)

  const stillThere = await db.invoice.count({ where: { id: second.invoice.id } })
  check(stillThere === 1, "the invoice still exists — the customer holds a copy")

  console.log("\n6. An invoice with payments cannot simply be voided")
  const third = await makeInvoice(3)
  orders.push(third.order.id)
  invoices.push(third.invoice.id)
  await db.invoice.update({ where: { id: third.invoice.id }, data: { paidAmount: 500, outstandingAmt: 600 } })

  const paidVoid = await voidInvoice(db, third.invoice.id, "Change of mind")
  check(paidVoid.ok === false, "refused", paidVoid.ok ? "" : paidVoid.error)

  console.log("\n7. The books still balance")
  ids = await idsFor()
  const all = await db.journalEntry.findMany({ select: { entryNumber: true, totalDebit: true, totalCredit: true } })
  const bad = all.filter((e) => Number(e.totalDebit) !== Number(e.totalCredit))
  check(bad.length === 0, `${all.length} entries, none unbalanced`, bad.map((e) => e.entryNumber).join(", ") || undefined)

  await cleanup()
  console.log("\n   (probe invoices, credit notes and entries removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await cleanup().catch(() => {})
  await db.$disconnect()
  process.exit(1)
})
