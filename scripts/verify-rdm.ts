/**
 * RDM end-to-end verification.
 *
 * RDM Manufacturing is the second billing entity, and the whole point of the
 * multi-entity work is that its money never lands in the other company's books.
 * This drives a real order through pricing, dispatch and invoicing and checks
 * which entity each artefact belongs to.
 *
 *   bun scripts/verify-rdm.ts
 */
import { db } from "../src/lib/db"
import { applyOrderStatus } from "../src/lib/order-status"
import { priceSalesOrder } from "../src/lib/sales-orders"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()
const orderIds: string[] = []
let rdmId = ""
let otherId = ""

async function cleanup() {
  const invoices = await db.invoice.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
  const ids = invoices.map((i) => i.id)
  const entries = await db.journalEntry.findMany({
    where: { referenceType: { in: ["invoice", "sales_order"] }, referenceId: { in: [...ids, ...orderIds] } },
    select: { id: true },
  })
  await db.journalLine.deleteMany({ where: { journalEntryId: { in: entries.map((e) => e.id) } } })
  await db.journalEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } })
  await db.creditTransaction.deleteMany({ where: { referenceId: { in: ids } } })
  await db.invoice.deleteMany({ where: { id: { in: ids } } })
  await db.stockMovement.deleteMany({ where: { reference: { startsWith: `RDM-PROBE-${STAMP}` } } })
  await db.stockReservation.deleteMany({ where: { referenceId: { in: orderIds } } })
  await db.salesOrderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.pickListItem.deleteMany({ where: { pickList: { orderId: { in: orderIds } } } }).catch(() => {})
  await db.pickList.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.delivery.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.salesOrderItem.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.salesOrder.deleteMany({ where: { id: { in: orderIds } } })
}

async function main() {
  console.log("RDM multi-entity verification\n")

  const rdm = await db.company.findFirstOrThrow({
    where: { name: { contains: "RDM" } },
    select: { id: true, name: true, gstRate: true, abn: true },
  })
  const other = await db.company.findFirstOrThrow({
    where: { NOT: { id: rdm.id } },
    select: { id: true, name: true },
  })
  rdmId = rdm.id
  otherId = other.id

  console.log("1. RDM has its own books")
  const rdmAccounts = await db.chartOfAccount.count({ where: { companyId: rdm.id } })
  const otherAccounts = await db.chartOfAccount.count({ where: { companyId: other.id } })
  check(rdmAccounts > 0, "chart of accounts exists", `${rdmAccounts} accounts`)
  check(rdmAccounts === otherAccounts, "matching the other entity's", `${rdm.name}=${rdmAccounts} vs ${other.name}=${otherAccounts}`)

  const rdmRates = await db.taxRate.count({ where: { companyId: rdm.id } })
  check(rdmRates > 0, "named tax rates exist", `${rdmRates}`)

  console.log("\n2. An RDM order prices against RDM")
  const customer = await db.customer.findFirstOrThrow({
    where: { companyId: rdm.id },
    select: { id: true, name: true, companyId: true },
  })
  const inv = await db.inventory.findFirstOrThrow({
    where: { quantity: { gte: 10 } },
    select: { id: true, productId: true, quantity: true, warehouseId: true },
  })

  const priced = await priceSalesOrder(
    [{ productId: inv.productId, quantity: 2, unitPrice: 100 }],
    { customerId: customer.id, companyId: rdm.id }
  )
  if (!priced.ok) throw new Error(priced.error)

  check(priced.subtotal === 200, "subtotal", String(priced.subtotal))
  check(priced.taxAmount === 20, `GST at RDM's ${rdm.gstRate}%`, String(priced.taxAmount))
  console.log(`     customer: ${customer.name}`)

  console.log("\n3. Dispatch and invoice")
  const order = await db.salesOrder.create({
    data: {
      orderNumber: `RDM-PROBE-${STAMP}`, customerId: customer.id, companyId: rdm.id,
      warehouseId: inv.warehouseId, status: "approved",
      subtotal: 200, taxAmount: 20, totalAmount: 220,
      items: { create: [{ productId: inv.productId, quantity: 2, unitPrice: 100, total: 200 }] },
    },
    select: { id: true },
  })
  orderIds.push(order.id)

  const moved = await applyOrderStatus(db, order.id, "delivered")
  check(moved.ok, "order reached delivered", moved.effects.join(", "))

  const invoice = await db.invoice.findFirstOrThrow({
    where: { orderId: order.id },
    select: { id: true, invoiceNumber: true, companyId: true, totalAmount: true },
  })
  check(invoice.companyId === rdm.id, "invoice belongs to RDM", invoice.companyId === rdm.id ? invoice.invoiceNumber : "WRONG ENTITY")
  check(invoice.totalAmount === 220, "for the right amount", String(invoice.totalAmount))

  console.log("\n4. The money landed in RDM's ledger, not the other entity's")
  const entry = await db.journalEntry.findFirstOrThrow({
    where: { referenceType: "invoice", referenceId: invoice.id },
    select: { id: true, companyId: true, totalDebit: true, totalCredit: true,
      lines: { select: { account: { select: { code: true, companyId: true } } } } },
  })

  check(entry.companyId === rdm.id, "journal entry is RDM's", entry.companyId === rdm.id ? "yes" : "WRONG ENTITY")
  check(entry.totalDebit === entry.totalCredit, "and it balances", `${entry.totalDebit} / ${entry.totalCredit}`)

  const foreign = entry.lines.filter((l) => l.account.companyId !== rdm.id)
  check(foreign.length === 0, "every line hits an RDM account", foreign.length ? `${foreign.length} foreign` : "all RDM")

  const otherEntityEntries = await db.journalEntry.count({
    where: { referenceId: invoice.id, companyId: otherId },
  })
  check(otherEntityEntries === 0, "nothing posted to the other entity", String(otherEntityEntries))

  await cleanup()
  console.log("\n   (probe order, invoice and journal removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(String(e).slice(0, 400)); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
