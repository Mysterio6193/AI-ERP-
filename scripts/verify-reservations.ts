/**
 * Stock reservation verification.
 *
 * `StockReservation` was modelled and never written; `Inventory.reserved` was
 * read everywhere and written nowhere. Every "available" figure was really just
 * `quantity`, so two orders for the last pallet both passed.
 *
 * Runs against a scratch product and warehouse, and removes them afterwards.
 *
 *   bun scripts/verify-reservations.ts
 */
import { db } from "../src/lib/db"
import {
  availableQuantity,
  fulfilReservationsForOrder,
  releaseReservationsForOrder,
  reserveStockForOrder,
} from "../src/lib/reservations"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()

async function inv(inventoryId: string) {
  const row = await db.inventory.findUniqueOrThrow({
    where: { id: inventoryId },
    select: { quantity: true, reserved: true },
  })
  return { ...row, available: availableQuantity(row) }
}

async function main() {
  console.log("Stock reservation verification\n")

  const company = await db.company.findFirstOrThrow({ select: { id: true } })
  const customer = await db.customer.findFirstOrThrow({ select: { id: true } })

  const warehouse = await db.warehouse.create({
    data: { name: `Probe WH ${STAMP}`, code: `PWH${STAMP}`.slice(0, 12), location: "probe", status: "active", companyId: company.id },
    select: { id: true },
  })

  const product = await db.product.create({
    data: {
      name: `Probe Pallet ${STAMP}`, sku: `PROBE-${STAMP}`, baseUnit: "unit",
      wholesalePrice: 100, retailPrice: 150, status: "active", companyId: company.id,
    },
    select: { id: true },
  })

  const inventory = await db.inventory.create({
    data: { productId: product.id, warehouseId: warehouse.id, quantity: 10, reserved: 0 },
    select: { id: true },
  })

  const makeOrder = async (qty: number, n: number) =>
    db.salesOrder.create({
      data: {
        orderNumber: `PROBE-SO-${STAMP}-${n}`,
        customerId: customer.id, companyId: company.id, warehouseId: warehouse.id,
        status: "approved", subtotal: 100 * qty, taxAmount: 0, totalAmount: 100 * qty,
        items: { create: [{ productId: product.id, quantity: qty, unitPrice: 100, total: 100 * qty }] },
      },
      select: { id: true },
    })

  console.log("1. Reserving holds stock without moving it")
  const orderA = await makeOrder(8, 1)
  const first = await reserveStockForOrder(db, orderA.id)
  let state = await inv(inventory.id)

  check(!first.skipped, "reservation created")
  check(state.quantity === 10, "on-hand is untouched — nothing has shipped", `qty=${state.quantity}`)
  check(state.reserved === 8, "8 units are held", `reserved=${state.reserved}`)
  check(state.available === 2, "only 2 are sellable", `available=${state.available}`)

  console.log("\n2. The bug this fixes: the second order for the last pallet")
  const orderB = await makeOrder(8, 2)
  await reserveStockForOrder(db, orderB.id)
  state = await inv(inventory.id)

  check(state.reserved === 16, "both orders' promises are visible", `reserved=${state.reserved}`)
  check(
    state.available === 0 && state.reserved > state.quantity,
    "availability is 0 and the over-promise is now detectable",
    `qty=${state.quantity} reserved=${state.reserved} available=${state.available}`
  )
  console.log("     Before this existed, reserved stayed 0 and both orders read '10 available'.")

  console.log("\n3. Reserving twice does not double-count")
  const again = await reserveStockForOrder(db, orderA.id)
  state = await inv(inventory.id)
  check(again.skipped === true, "second call is a no-op", "reason: " + (again.skipped ? again.reason : ""))
  check(state.reserved === 16, "reserved is unchanged", `reserved=${state.reserved}`)

  console.log("\n4. Cancelling gives the stock back")
  await releaseReservationsForOrder(db, orderB.id)
  state = await inv(inventory.id)
  check(state.reserved === 8, "only the surviving order still holds stock", `reserved=${state.reserved}`)
  check(state.available === 2, "availability recovers", `available=${state.available}`)

  const releasedRows = await db.stockReservation.count({ where: { referenceId: orderB.id, status: "released" } })
  check(releasedRows === 1, "the reservation is recorded as released, not deleted")

  console.log("\n5. Dispatch ends the hold, so units are not subtracted twice")
  // Simulate what commitStockForOrder does to on-hand, then fulfil.
  await db.inventory.update({ where: { id: inventory.id }, data: { quantity: { decrement: 8 } } })
  await fulfilReservationsForOrder(db, orderA.id)
  state = await inv(inventory.id)

  check(state.quantity === 2, "on-hand dropped by the shipped amount", `qty=${state.quantity}`)
  check(state.reserved === 0, "the hold lifted", `reserved=${state.reserved}`)
  check(
    state.available === 2,
    "available equals on-hand — the same 8 units were not counted twice",
    `available=${state.available}`
  )

  const fulfilled = await db.stockReservation.count({ where: { referenceId: orderA.id, status: "fulfilled" } })
  check(fulfilled === 1, "recorded as fulfilled, distinct from released")

  console.log("\n6. Releasing never drives reserved negative")
  await releaseReservationsForOrder(db, orderA.id) // already fulfilled — nothing active
  state = await inv(inventory.id)
  check(state.reserved === 0, "reserved stays at 0", `reserved=${state.reserved}`)

  // ---------------------------------------------------------------- cleanup
  await db.stockReservation.deleteMany({ where: { referenceId: { in: [orderA.id, orderB.id] } } })
  await db.salesOrderItem.deleteMany({ where: { orderId: { in: [orderA.id, orderB.id] } } })
  await db.salesOrder.deleteMany({ where: { id: { in: [orderA.id, orderB.id] } } })
  await db.inventory.deleteMany({ where: { id: inventory.id } })
  await db.product.deleteMany({ where: { id: product.id } })
  await db.warehouse.deleteMany({ where: { id: warehouse.id } })
  console.log("\n   (probe order, product and warehouse removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
