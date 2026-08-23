/**
 * Expense verification.
 *
 * The Expense model had no API and no screen, so nothing could be recorded —
 * rent, freight and utilities never reached the books and every profit figure
 * was really gross margin.
 *
 *   bun scripts/verify-expenses.ts
 */
import { db } from "../src/lib/db"
import { createExpense, setExpenseStatus } from "../src/lib/expenses"
import { ACCOUNTS } from "../src/lib/ledger"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
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

async function main() {
  console.log("Expense verification\n")
  const company = await db.company.findFirstOrThrow({ select: { id: true } })
  const created: string[] = []

  console.log("1. Recording one — which was impossible before")
  const result = await createExpense(db, {
    category: "rent",
    description: "Gregory Hills warehouse — August",
    amount: 4000,
    taxAmount: 400,
    companyId: company.id,
  })
  if (!result.ok) throw new Error(result.error)
  created.push(result.expenseId)

  check(result.expenseNumber.startsWith("EXP-2026-"), "numbered from the counter", result.expenseNumber)
  check(result.totalAmount === 4400, "total is amount plus tax", String(result.totalAmount))

  const ids0 = (await db.journalEntry.findMany({ where: { referenceId: result.expenseId }, select: { id: true } })).map((e) => e.id)
  check(ids0.length === 0, "a pending expense posts nothing — it is a request, not a cost")

  console.log("\n2. Approving it books the cost and the liability")
  await setExpenseStatus(db, result.expenseId, "approved")
  let ids = (await db.journalEntry.findMany({ where: { referenceId: result.expenseId }, select: { id: true } })).map((e) => e.id)

  check(await movement(company.id, "6200", ids) === 4000, "rent expense debited 4000")
  check(await movement(company.id, ACCOUNTS.taxPayable, ids) === 400, "GST claimed as an input credit")
  check(await movement(company.id, ACCOUNTS.accountsPayable, ids) === -4400, "payable owed 4400")
  check(await movement(company.id, ACCOUNTS.bank, ids) === 0, "bank untouched — not paid yet")

  console.log("\n3. Paying it settles the liability without doubling the cost")
  await setExpenseStatus(db, result.expenseId, "paid")
  ids = (await db.journalEntry.findMany({ where: { referenceId: result.expenseId }, select: { id: true } })).map((e) => e.id)

  check(await movement(company.id, "6200", ids) === 4000, "the cost is still 4000, not 8000")
  check(await movement(company.id, ACCOUNTS.accountsPayable, ids) === 0, "payable settled to zero")
  check(await movement(company.id, ACCOUNTS.bank, ids) === -4400, "bank down 4400")

  console.log("\n4. A paid expense cannot be walked backwards")
  const back = await setExpenseStatus(db, result.expenseId, "pending")
  check(back.ok === false, "refused", back.ok ? "" : back.error)

  console.log("\n5. Validation")
  const noAmount = await createExpense(db, { category: "other", description: "x", amount: 0, companyId: company.id })
  check(noAmount.ok === false, "a zero-amount expense is refused")

  const noDescription = await createExpense(db, { category: "other", description: "   ", amount: 10, companyId: company.id })
  check(noDescription.ok === false, "a blank description is refused")

  console.log("\n6. Numbers do not collide")
  const a = await createExpense(db, { category: "travel", description: "Fuel", amount: 120, companyId: company.id })
  const b = await createExpense(db, { category: "travel", description: "Tolls", amount: 30, companyId: company.id })
  if (!a.ok || !b.ok) throw new Error("expense creation failed")
  created.push(a.expenseId, b.expenseId)
  check(a.expenseNumber !== b.expenseNumber, "sequential and distinct", `${a.expenseNumber} then ${b.expenseNumber}`)

  console.log("\n7. Everything posted still balances")
  const all = await db.journalEntry.findMany({ select: { entryNumber: true, totalDebit: true, totalCredit: true } })
  const bad = all.filter((e) => Number(e.totalDebit) !== Number(e.totalCredit))
  check(bad.length === 0, `${all.length} entries, none unbalanced`, bad.map((e) => e.entryNumber).join(", ") || undefined)

  // ---------------------------------------------------------------- cleanup
  const entries = await db.journalEntry.findMany({ where: { referenceId: { in: created } }, select: { id: true } })
  await db.journalLine.deleteMany({ where: { journalEntryId: { in: entries.map((e) => e.id) } } })
  await db.journalEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } })
  await db.expense.deleteMany({ where: { id: { in: created } } })
  await db.documentCounter.deleteMany({ where: { kind: "expense" } })
  console.log("\n   (probe expenses, entries and counter removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
