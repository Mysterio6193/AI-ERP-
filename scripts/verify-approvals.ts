/**
 * Approval trail verification.
 *
 * ApprovalAction was modelled and never written. The platform has
 * requiresApproval, a pending_approval status and an approved status — and no
 * record of who made the call or what they said. An order that went out at an
 * unusual discount could be traced to the moment it changed status and no
 * further.
 *
 *   bun scripts/verify-approvals.ts
 */
import { db } from "../src/lib/db"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const BASE = "http://localhost:3000"
const STAMP = Date.now()
const orderIds: string[] = []

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function makeOrder(n: number, status: string) {
  const c = await db.customer.findFirstOrThrow({ select: { id: true, companyId: true } })
  const o = await db.salesOrder.create({
    data: {
      orderNumber: `PROBE-AP-${STAMP}-${n}`, customerId: c.id, companyId: c.companyId,
      status, requiresApproval: true, subtotal: 500, taxAmount: 50, totalAmount: 550,
    },
    select: { id: true },
  })
  orderIds.push(o.id)
  return o
}

async function cleanup() {
  await db.approvalAction.deleteMany({ where: { salesOrderId: { in: orderIds } } })
  await db.salesOrderStatusLog.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.pickListItem.deleteMany({ where: { pickList: { orderId: { in: orderIds } } } }).catch(() => {})
  await db.pickList.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {})
  await db.stockReservation.deleteMany({ where: { referenceId: { in: orderIds } } }).catch(() => {})
  await db.salesOrder.deleteMany({ where: { id: { in: orderIds } } })
}

async function main() {
  console.log("Approval trail verification\n")

  console.log("1. Approving an order awaiting sign-off is recorded")
  const order = await makeOrder(1, "pending_approval")

  const approved = await api(`/api/orders/${order.id}`, {
    method: "PUT",
    body: JSON.stringify({ status: "approved", internalNotes: "Within the rep's authority" }),
  })
  check(approved.status === 200, "approved", `status ${approved.status}`)

  const actions = await db.approvalAction.findMany({
    where: { salesOrderId: order.id },
    include: { user: { select: { name: true, role: true } } },
  })
  check(actions.length === 1, "one approval recorded", `${actions.length}`)
  check(actions[0]?.action === "approved", "as an approval", actions[0]?.action)
  check(Boolean(actions[0]?.userId), "attributed to a real user", actions[0]?.user?.name)
  check(actions[0]?.comments === "Within the rep's authority", "with the reason kept", actions[0]?.comments ?? "")

  console.log("\n2. It is answerable from the document")
  const fetched = await api(`/api/orders/${order.id}`)
  const trail = fetched.body?.data?.approvalActions
  check(Array.isArray(trail) && trail.length === 1, "the order carries its approval trail")
  check(Boolean(trail?.[0]?.user?.name), "including who decided", trail?.[0]?.user?.name)

  console.log("\n3. Cancelling something awaiting sign-off reads as a rejection")
  const rejected = await makeOrder(2, "pending_approval")
  await api(`/api/orders/${rejected.id}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled", internalNotes: "Margin too thin" }),
  })

  const rejActions = await db.approvalAction.findMany({ where: { salesOrderId: rejected.id } })
  check(rejActions.length === 1, "recorded", `${rejActions.length}`)
  check(rejActions[0]?.action === "rejected", "as a rejection, not an approval", rejActions[0]?.action)

  console.log("\n4. An ordinary status change is not an approval")
  const plain = await makeOrder(3, "draft")
  await api(`/api/orders/${plain.id}`, { method: "PUT", body: JSON.stringify({ status: "approved" }) })

  const plainActions = await db.approvalAction.count({ where: { salesOrderId: plain.id } })
  check(plainActions === 0, "draft to approved records nothing", `${plainActions}`)
  console.log("     Only a decision on something that was actually waiting counts.")

  await cleanup()
  console.log("\n   (probe orders and approvals removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
