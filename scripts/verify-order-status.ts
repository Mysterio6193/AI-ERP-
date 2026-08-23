/**
 * Order status side-effect verification.
 *
 * The status change was never the point — the side effects are. The order PUT
 * handler commits stock, raises invoices, reserves goods and releases them on
 * cancellation. The agent's updateOrderStatus did a bare salesOrder.update, so
 * an agent moving an order to "dispatched" wrote a word and nothing else:
 * stock never left, no invoice existed, and the reservation stayed held.
 *
 *   bun scripts/verify-order-status.ts
 */
import { db } from "../src/lib/db"
import { applyOrderStatus } from "../src/lib/order-status"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()
const orderIds: string[] = []
let productId = ""
let inventoryId = ""
let startQty = 0

async function makeOrder(n: number, qty: number) {
  const c = await db.customer.findFirstOrThrow({ select: { id: true, companyId: true } })
  const wh = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId }, select: { warehouseId: true } })
  const o = await db.salesOrder.create({
    data: {
      orderNumber: `PROBE-ST-${STAMP}-${n}`, customerId: c.id, companyId: c.companyId,
      warehouseId: wh.warehouseId, status: "approved",
      subtotal: 100 * qty, taxAmount: 0, totalAmount: 100 * qty,
      items: { create: [{ productId, quantity: qty, unitPrice: 100, total: 100 * qty }] },
    },
    select: { id: true },
  })
  orderIds.push(o.id)
  return o
}

async function inv() {
  return db.inventory.findUniqueOrThrow({ where: { id: inventoryId }, select: { quantity: true, reserved: true } })
}

async function cleanup() {
  await db.stockMovement.deleteMany({ where: { reference: { startsWith: `PROBE-ST-${STAMP}` } } })
  await db.stockReservation.deleteMany({ where: { referenceId: { in: orderIds } } })
  await db.invoice.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.salesOrderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.pickListItem.deleteMany({ where: { pickList: { orderId: { in: orderIds } } } }).catch(() => {})
  await db.pickList.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.delivery.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.salesOrderItem.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.salesOrder.deleteMany({ where: { id: { in: orderIds } } })
  await db.auditLog.deleteMany({ where: { entityId: { in: orderIds }, entityType: "sales_order_transition" } })
  if (inventoryId) await db.inventory.update({ where: { id: inventoryId }, data: { quantity: startQty, reserved: 0 } })
}

async function main() {
  console.log("Order status side-effect verification\n")

  const inventory = await db.inventory.findFirstOrThrow({
    where: { quantity: { gte: 20 } },
    select: { id: true, productId: true, quantity: true },
  })
  inventoryId = inventory.id
  productId = inventory.productId
  startQty = inventory.quantity
  await db.inventory.update({ where: { id: inventoryId }, data: { reserved: 0 } })

  console.log("1. Approving reserves the stock")
  const order = await makeOrder(1, 5)
  const approved = await applyOrderStatus(db, order.id, "approved")
  const afterApprove = await inv()

  check(approved.ok, "applied")
  check(afterApprove.reserved >= 5, "stock is held", `reserved=${afterApprove.reserved}`)
  check(afterApprove.quantity === startQty, "and still on the shelf", `qty=${afterApprove.quantity}`)

  console.log("\n2. Dispatching takes it off the shelf — the step the agent used to skip")
  const dispatched = await applyOrderStatus(db, order.id, "dispatched")
  const afterDispatch = await inv()

  check(dispatched.ok, "applied", dispatched.effects.join(", "))
  check(afterDispatch.quantity === startQty - 5, "on-hand fell by 5", `${startQty} -> ${afterDispatch.quantity}`)
  check(afterDispatch.reserved === 0, "and the hold lifted", `reserved=${afterDispatch.reserved}`)

  const movements = await db.stockMovement.count({ where: { reference: `PROBE-ST-${STAMP}-1` } })
  check(movements > 0, "a stock movement was written", `${movements}`)
  console.log("     A bare status update wrote none of this.")

  console.log("\n3. Delivering raises the invoice")
  const delivered = await applyOrderStatus(db, order.id, "delivered")
  const invoice = await db.invoice.findFirst({ where: { orderId: order.id }, select: { invoiceNumber: true } })

  check(delivered.ok, "applied", delivered.effects.join(", "))
  check(Boolean(invoice), "invoice exists", invoice?.invoiceNumber)

  console.log("\n4. Cancelling gives reserved stock back")
  const second = await makeOrder(2, 4)
  await applyOrderStatus(db, second.id, "approved")
  const held = await inv()
  await applyOrderStatus(db, second.id, "cancelled")
  const released = await inv()

  check(held.reserved >= 4, "held while approved", `reserved=${held.reserved}`)
  check(released.reserved === 0, "released on cancel", `reserved=${released.reserved}`)

  console.log("\n5. An illegal move is logged, not silently allowed")
  const third = await makeOrder(3, 1)
  const jump = await applyOrderStatus(db, third.id, "delivered") // approved -> delivered
  const logged = await db.auditLog.count({
    where: { entityType: "sales_order_transition", entityId: third.id },
  })

  check(jump.ok, "allowed while enforcement is off")
  check(logged === 1, "and recorded as illegal for review", `${logged} audit row(s)`)

  console.log("\n6. With enforcement on, it is refused")
  const fourth = await makeOrder(4, 1)
  const refused = await applyOrderStatus(db, fourth.id, "delivered", { enforce: true })

  check(refused.ok === false, "refused", refused.error?.slice(0, 62))
  const unchanged = await db.salesOrder.findUniqueOrThrow({ where: { id: fourth.id }, select: { status: true } })
  check(unchanged.status === "approved", "and the order did not move", unchanged.status)

  await cleanup()
  console.log("\n   (probe orders removed, inventory restored)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
