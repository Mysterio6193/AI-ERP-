/**
 * General ledger verification.
 *
 * `journalLine` had zero call sites. Invoicing, payment and goods receipt all
 * moved money and assets while the ledger stayed empty — the books could not
 * be balanced because there was nothing in them.
 *
 *   bun scripts/verify-ledger.ts
 */
import { db } from "../src/lib/db"
import { ACCOUNTS, postJournal, postInvoiceRaised, postPaymentReceived } from "../src/lib/ledger"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()
const refs: string[] = []

async function entryFor(referenceType: string, referenceId: string) {
  return db.journalEntry.findFirst({
    where: { referenceType, referenceId },
    select: {
      id: true, entryNumber: true, totalDebit: true, totalCredit: true, status: true,
      lines: { select: { debit: true, credit: true, account: { select: { code: true, name: true } } } },
    },
  })
}

async function main() {
  console.log("General ledger verification\n")

  const company = await db.company.findFirstOrThrow({ select: { id: true } })
  const customer = await db.customer.findFirstOrThrow({ select: { id: true } })

  console.log("1. The chart of accounts gets created on first post")
  const before = await db.chartOfAccount.count({ where: { companyId: company.id } })

  const ref = `probe-${STAMP}`
  refs.push(ref)
  await postJournal(db, {
    companyId: company.id,
    description: "Probe entry",
    referenceType: "probe",
    referenceId: ref,
    lines: [
      { accountCode: ACCOUNTS.bank, debit: 100 },
      { accountCode: ACCOUNTS.salesRevenue, credit: 100 },
    ],
  })

  const after = await db.chartOfAccount.count({ where: { companyId: company.id } })
  console.log(`     accounts before=${before} after=${after}`)
  check(after > 0, "chart exists", `${after} accounts`)

  console.log("\n2. An unbalanced entry is refused, not posted")
  let threw = false
  try {
    await postJournal(db, {
      companyId: company.id,
      description: "Unbalanced",
      referenceType: "probe",
      referenceId: `bad-${STAMP}`,
      lines: [
        { accountCode: ACCOUNTS.bank, debit: 100 },
        { accountCode: ACCOUNTS.salesRevenue, credit: 90 },
      ],
    })
  } catch {
    threw = true
  }
  check(threw, "throws rather than posting")
  check(
    (await entryFor("probe", `bad-${STAMP}`)) === null,
    "and no entry row was written"
  )

  console.log("\n3. Invoicing posts AR / revenue / GST")
  // Invoice requires an order, so the probe builds a scratch one.
  const order = await db.salesOrder.create({
    data: {
      orderNumber: `PROBE-SO-LEDGER-${STAMP}`,
      customerId: customer.id, companyId: company.id, status: "invoiced",
      subtotal: 1000, taxAmount: 100, totalAmount: 1100,
    },
    select: { id: true },
  })

  const invoice = await db.invoice.create({
    data: {
      invoiceNumber: `PROBE-INV-${STAMP}`,
      orderId: order.id,
      customerId: customer.id, companyId: company.id,
      subtotal: 1000, taxAmount: 100, totalAmount: 1100,
      status: "unpaid", paidAmount: 0, outstandingAmt: 1100,
      dueDate: new Date(),
    },
    select: { id: true },
  })
  refs.push(invoice.id)

  await postInvoiceRaised(db, invoice.id)
  const invEntry = await entryFor("invoice", invoice.id)

  check(invEntry !== null, "an entry was posted")
  check(Number(invEntry?.totalDebit) === Number(invEntry?.totalCredit), "it balances",
    `${invEntry?.totalDebit} = ${invEntry?.totalCredit}`)

  for (const line of invEntry?.lines ?? []) {
    console.log(`     ${line.account.code} ${line.account.name.padEnd(22)} DR ${String(line.debit).padStart(8)}  CR ${String(line.credit).padStart(8)}`)
  }

  const ar = invEntry?.lines.find((l) => l.account.code === ACCOUNTS.accountsReceivable)
  const rev = invEntry?.lines.find((l) => l.account.code === ACCOUNTS.salesRevenue)
  const gst = invEntry?.lines.find((l) => l.account.code === ACCOUNTS.taxPayable)
  check(Number(ar?.debit) === 1100, "AR debited the gross", String(ar?.debit))
  check(Number(rev?.credit) === 1000, "revenue credited net of tax", String(rev?.credit))
  check(Number(gst?.credit) === 100, "GST held as a liability, not booked as revenue", String(gst?.credit))

  console.log("\n4. Posting the same invoice twice does not double the books")
  const second = await postInvoiceRaised(db, invoice.id)
  const count = await db.journalEntry.count({ where: { referenceType: "invoice", referenceId: invoice.id } })
  check(second.skipped === true, "second call skipped")
  check(count === 1, "still exactly one entry", `${count}`)

  console.log("\n5. Payment moves the receivable to the bank")
  const payment = await db.payment.create({
    data: { invoiceId: invoice.id, customerId: customer.id, amount: 400, method: "bank_transfer" },
    select: { id: true },
  })
  refs.push(payment.id)

  await postPaymentReceived(db, payment.id)
  const payEntry = await entryFor("payment", payment.id)
  const bank = payEntry?.lines.find((l) => l.account.code === ACCOUNTS.bank)
  const arCredit = payEntry?.lines.find((l) => l.account.code === ACCOUNTS.accountsReceivable)

  check(Number(bank?.debit) === 400, "bank debited", String(bank?.debit))
  check(Number(arCredit?.credit) === 400, "receivable reduced by the same amount", String(arCredit?.credit))

  console.log("\n6. Every entry in the ledger balances")
  const all = await db.journalEntry.findMany({
    select: { entryNumber: true, totalDebit: true, totalCredit: true },
  })
  const unbalanced = all.filter((e) => Number(e.totalDebit) !== Number(e.totalCredit))
  check(unbalanced.length === 0, `${all.length} entries, none unbalanced`,
    unbalanced.map((e) => e.entryNumber).join(", ") || undefined)

  // Lines must agree with the header, or the header is decorative.
  const lineSums = await db.journalLine.aggregate({ _sum: { debit: true, credit: true } })
  check(
    Number(lineSums._sum.debit) === Number(lineSums._sum.credit),
    "and the lines themselves sum equal",
    `DR ${lineSums._sum.debit} / CR ${lineSums._sum.credit}`
  )

  // ---------------------------------------------------------------- cleanup
  const entries = await db.journalEntry.findMany({
    where: { referenceId: { in: refs } }, select: { id: true },
  })
  await db.journalLine.deleteMany({ where: { journalEntryId: { in: entries.map((e) => e.id) } } })
  await db.journalEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } })
  await db.payment.deleteMany({ where: { id: payment.id } })
  await db.invoice.deleteMany({ where: { id: invoice.id } })
  await db.salesOrder.deleteMany({ where: { id: order.id } })
  console.log("\n   (probe invoice, payment and entries removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
