/**
 * Customer timeline verification.
 *
 * Activity was only ever written by CRM actions and CRM agent tools, so a
 * customer's history showed what someone had remembered to type and nothing
 * else. Orders placed, money paid, a credit hold — none of it appeared, which
 * means opening a customer before a call told you nothing you could not have
 * guessed.
 *
 *   bun scripts/verify-customer-timeline.ts
 */
import { db } from "../src/lib/db"
import { createSalesOrder } from "../src/lib/sales-orders"
import { applyOrderStatus } from "../src/lib/order-status"
import { customerTimeline } from "../src/lib/customer-timeline"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const orderIds: string[] = []
let customerId = ""
let restore: { creditLimit: number; creditBalance: number } | null = null

async function cleanup() {
  await db.activity.deleteMany({ where: { customerId, createdByAgent: true } })
  await db.stockReservation.deleteMany({ where: { referenceId: { in: orderIds } } })
  await db.salesOrderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.pickListItem.deleteMany({ where: { pickList: { orderId: { in: orderIds } } } }).catch(() => {})
  await db.pickList.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.delivery.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.salesOrderItem.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.salesOrder.deleteMany({ where: { id: { in: orderIds } } })
  if (customerId && restore) {
    await db.customer.update({ where: { id: customerId }, data: restore })
  }
}

async function main() {
  console.log("Customer timeline verification\n")

  const customer = await db.customer.findFirstOrThrow({
    select: { id: true, name: true, creditLimit: true, creditBalance: true },
  })
  customerId = customer.id
  restore = { creditLimit: customer.creditLimit, creditBalance: customer.creditBalance }

  const product = await db.product.findFirstOrThrow({ select: { id: true } })

  console.log(`  customer: ${customer.name}`)

  const before = await customerTimeline(db, customerId)
  console.log(`  timeline before: ${before.length} entr${before.length === 1 ? "y" : "ies"}\n`)

  console.log("1. Placing an order writes to the timeline")
  await db.customer.update({ where: { id: customerId }, data: { creditLimit: 1000000, creditBalance: 0 } })

  const placed = await createSalesOrder({
    customerId,
    items: [{ productId: product.id, quantity: 2, unitPrice: 100 }],
    sourceChannel: "probe",
  })
  if (!placed.ok) throw new Error(placed.error)
  orderIds.push(placed.order.id)

  const afterOrder = await customerTimeline(db, customerId)
  const orderEntry = afterOrder.find((a) => a.subject === "Order placed")
  check(Boolean(orderEntry), "an 'Order placed' entry appeared", orderEntry?.body ?? "")
  check(orderEntry?.createdByAgent === true, "marked as system-written, not typed by a person")

  console.log("\n2. Cancelling it is recorded too")
  await applyOrderStatus(db, placed.order.id, "cancelled")
  const afterCancel = await customerTimeline(db, customerId)
  const cancelEntry = afterCancel.find((a) => a.subject === "Order cancelled")
  check(Boolean(cancelEntry), "an 'Order cancelled' entry appeared", cancelEntry?.body ?? "")

  console.log("\n3. Newest first, so a call starts from what just happened")
  check(afterCancel[0]?.subject === "Order cancelled", "most recent is first", afterCancel[0]?.subject ?? "")

  console.log("\n4. A failed write never breaks the business action")
  const orphan = await (await import("../src/lib/customer-timeline")).logCustomerActivity(db, {
    customerId: null,
    event: "order_placed",
  })
  check(orphan.ok === false, "no customer is reported, not thrown", orphan.reason ?? "")

  console.log(`\n  timeline now: ${afterCancel.length} entries`)
  for (const a of afterCancel.slice(0, 4)) {
    console.log(`    ${a.subject.padEnd(18)} ${a.body ?? ""}`)
  }

  await cleanup()
  console.log("\n   (probe order and entries removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(String(e).slice(0, 400)); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
