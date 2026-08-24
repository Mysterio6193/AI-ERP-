/**
 * Delivery route verification.
 *
 * GET /api/routes used to call backfillDeliveryRoutes on every request, so
 * reading the screen created data: it scanned every packed, dispatched and
 * delivered order and materialised deliveries as a side effect. A delivery
 * existed because somebody happened to open a page.
 *
 *   bun scripts/verify-routes.ts
 */
import { db } from "../src/lib/db"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const BASE = process.env.PROBE_BASE_URL || "http://localhost:3000"
const STAMP = Date.now()
const createdOrders: string[] = []
const createdRoutes: string[] = []

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

async function counts() {
  return {
    deliveries: await db.delivery.count(),
    routes: await db.deliveryRoute.count(),
  }
}

async function cleanup() {
  await db.delivery.deleteMany({ where: { orderId: { in: createdOrders } } })
  await db.salesOrder.deleteMany({ where: { id: { in: createdOrders } } })
  await db.deliveryRoute.deleteMany({ where: { id: { in: createdRoutes } } })
}

async function main() {
  console.log("Delivery route verification\n")

  const company = await db.company.findFirstOrThrow({ select: { id: true } })
  const customer = await db.customer.findFirstOrThrow({ select: { id: true } })

  console.log("1. A packed order with no delivery, to give the old GET something to do")
  const order = await db.salesOrder.create({
    data: {
      orderNumber: `PROBE-RT-${STAMP}`, customerId: customer.id, companyId: company.id,
      status: "packed", subtotal: 100, taxAmount: 10, totalAmount: 110,
    },
    select: { id: true },
  })
  createdOrders.push(order.id)

  const before = await counts()
  console.log(`     deliveries=${before.deliveries} routes=${before.routes}`)

  console.log("\n2. Reading the routes screen creates nothing")
  const read = await api("/api/routes")
  const afterRead = await counts()

  check(read.status === 200, "GET succeeded", `status ${read.status}`)
  check(afterRead.deliveries === before.deliveries, "no delivery was created by a read",
    `${before.deliveries} -> ${afterRead.deliveries}`)
  check(afterRead.routes === before.routes, "no route was created by a read",
    `${before.routes} -> ${afterRead.routes}`)
  console.log("     Before this change, that GET would have materialised one.")

  console.log("\n3. The backlog is reported rather than silently repaired")
  check(
    typeof read.body?.meta?.missingDeliveries === "number",
    "GET reports how many orders are missing a delivery",
    String(read.body?.meta?.missingDeliveries)
  )
  check(read.body.meta.missingDeliveries >= 1, "including the one just created")

  console.log("\n4. Backfilling is an explicit action")
  const fixed = await api("/api/routes", {
    method: "POST",
    body: JSON.stringify({ action: "backfill" }),
  })
  const afterFix = await counts()

  check(fixed.status === 200, "POST backfill succeeded", `status ${fixed.status}`)
  check(fixed.body?.data?.created >= 1, "it says what it created", JSON.stringify(fixed.body?.data))
  check(afterFix.deliveries > before.deliveries, "and a delivery now exists",
    `${before.deliveries} -> ${afterFix.deliveries}`)

  const nowRead = await api("/api/routes")
  check(nowRead.body?.meta?.missingDeliveries === 0, "the backlog reads as cleared",
    String(nowRead.body?.meta?.missingDeliveries))

  console.log("\n5. Running the backfill again does nothing")
  const again = await api("/api/routes", { method: "POST", body: JSON.stringify({ action: "backfill" }) })
  const afterAgain = await counts()
  check(again.body?.data?.created === 0, "nothing created the second time", JSON.stringify(again.body?.data))
  check(afterAgain.deliveries === afterFix.deliveries, "delivery count unchanged")

  console.log("\n6. A route can be created deliberately")
  const made = await api("/api/routes", {
    method: "POST",
    body: JSON.stringify({ routeDate: new Date().toISOString() }),
  })
  check(made.status === 201, "POST created a route", `status ${made.status}`)
  if (made.body?.data?.id) {
    createdRoutes.push(made.body.data.id)
    check(Boolean(made.body.data.routeNumber), "with a route number", made.body.data.routeNumber)
  }

  const twice = await api("/api/routes", {
    method: "POST",
    body: JSON.stringify({ routeDate: new Date().toISOString() }),
  })
  check(
    twice.body?.data?.id === made.body?.data?.id,
    "planning the same day twice reuses the route rather than splitting the run",
    twice.body?.data?.routeNumber
  )

  console.log("\n7. A bad date is refused")
  const bad = await api("/api/routes", { method: "POST", body: JSON.stringify({ routeDate: "not-a-date" }) })
  check(bad.status === 400, "refused", bad.body?.error)

  await cleanup()
  console.log("\n   (probe order, delivery and route removed)")

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
