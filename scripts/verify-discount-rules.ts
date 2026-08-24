/**
 * Discount rule verification.
 *
 * DiscountRule was modelled, nothing could create one, and applyOrderDiscounts
 * had zero callers — so the discount engine read an empty table that no screen
 * could fill. The same shape as the price lists before Phase 4, and the batch
 * ledger before Phase 1: written, tested in isolation, wired to nothing.
 *
 *   bun scripts/verify-discount-rules.ts
 */
import { db } from "../src/lib/db"
import { createSalesOrder } from "../src/lib/sales-orders"
import { clearSettingsCache, saveSettings } from "../src/lib/settings/service"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()
const ruleIds: string[] = []
const orderIds: string[] = []

async function cleanup() {
  await db.salesOrderItem.deleteMany({ where: { orderId: { in: orderIds } } })
  await db.stockReservation.deleteMany({ where: { referenceId: { in: orderIds } } })
  await db.pickListItem.deleteMany({ where: { pickList: { orderId: { in: orderIds } } } }).catch(() => {})
  await db.pickList.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.salesOrderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.salesOrder.deleteMany({ where: { id: { in: orderIds } } })
  await db.discountRule.deleteMany({ where: { id: { in: ruleIds } } })
  await db.setting.deleteMany({ where: { key: "pricing" } })
  clearSettingsCache()
}

async function place(qty: number) {
  const customer = await db.customer.findFirstOrThrow({ select: { id: true } })
  const product = await db.product.findFirstOrThrow({ select: { id: true } })

  const result = await createSalesOrder({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: qty, unitPrice: 100 }],
    sourceChannel: "probe",
  })

  if (result.ok) orderIds.push(result.order.id)
  return result
}

async function main() {
  console.log("Discount rule verification\n")

  // Headroom, so nothing is refused for credit reasons.
  const customer = await db.customer.findFirstOrThrow({ select: { id: true, creditLimit: true, creditBalance: true } })
  const restore = { creditLimit: customer.creditLimit, creditBalance: customer.creditBalance }
  await db.customer.update({ where: { id: customer.id }, data: { creditLimit: 1000000, creditBalance: 0 } })

  const rule = await db.discountRule.create({
    data: {
      name: `Probe 10% over $500 ${STAMP}`,
      type: "order_total", discountType: "percentage", discountValue: 10,
      minOrderValue: 500, status: "active",
    },
    select: { id: true },
  })
  ruleIds.push(rule.id)

  console.log("1. Off by default — the rule exists and changes nothing")
  await db.setting.deleteMany({ where: { key: "pricing" } })
  clearSettingsCache()

  const off = await place(10) // 1000 net
  if (!off.ok) throw new Error(off.error)
  check(off.order.discountAmount === 0, "no discount applied", String(off.order.discountAmount))
  console.log(`     total ${off.order.totalAmount}`)

  console.log("\n2. Enabled — the rule applies")
  await saveSettings("pricing", { enableDiscountRules: true })
  clearSettingsCache()

  const on = await place(10)
  if (!on.ok) throw new Error(on.error)
  check(on.order.discountAmount === 100, "10% of the 1000 subtotal", String(on.order.discountAmount))
  check(
    on.order.totalAmount === off.order.totalAmount - 100,
    "and the total came down by exactly that",
    `${off.order.totalAmount} -> ${on.order.totalAmount}`
  )

  console.log("\n3. Below the minimum, it does not apply")
  const small = await place(1) // 100 net, under the 500 floor
  if (!small.ok) throw new Error(small.error)
  check(small.order.discountAmount === 0, "no discount on a small order", String(small.order.discountAmount))

  console.log("\n4. A rule demanding sign-off routes the order to approval")
  await db.discountRule.update({ where: { id: rule.id }, data: { requiresApproval: true } })
  clearSettingsCache()

  const needsApproval = await place(10)
  if (!needsApproval.ok) throw new Error(needsApproval.error)
  check(needsApproval.order.requiresApproval === true, "flagged for approval")
  check(needsApproval.order.status === "pending_approval", "and parked there, not draft", needsApproval.order.status)

  console.log("\n5. A paused rule is ignored")
  await db.discountRule.update({ where: { id: rule.id }, data: { status: "paused", requiresApproval: false } })
  const paused = await place(10)
  if (!paused.ok) throw new Error(paused.error)
  check(paused.order.discountAmount === 0, "no discount from a paused rule", String(paused.order.discountAmount))

  await db.customer.update({ where: { id: customer.id }, data: restore })
  await cleanup()
  console.log("\n   (probe rules, orders and settings removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
