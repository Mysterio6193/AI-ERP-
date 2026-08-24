/**
 * Product-supplier link verification.
 *
 * ProductSupplier was modelled and never written, so reorderSuggestions — which
 * already reads it and picks a supplier — always found nothing. Reorder advice
 * fell back to the product's own cost price and named nobody to buy from,
 * which is the one thing that advice is for.
 *
 *   bun scripts/verify-product-suppliers.ts
 */
import { db } from "../src/lib/db"
import { buildPurchasingTools } from "../src/lib/agent/tools/purchasing"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const BASE = "http://localhost:3000"
const STAMP = Date.now()
const madeSuppliers: string[] = []
let productId = ""
let inventoryId = ""
let originalReorder: { reorderLevel: number; reorderQty: number } | null = null

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function suggestions() {
  const tools = buildPurchasingTools({ kind: "staff", role: "admin", userId: "probe" } as never) as Record<string, { execute: (...args: unknown[]) => unknown }>
  const out = await tools.reorderSuggestions.execute({ limit: 50 }, {} as never)
  return (out as Array<Record<string, unknown>>).find((r) => r.productId === productId)
}

async function cleanup() {
  await db.productSupplier.deleteMany({ where: { productId } })
  await db.supplier.deleteMany({ where: { id: { in: madeSuppliers } } })
  if (inventoryId && originalReorder) {
    await db.inventory.update({ where: { id: inventoryId }, data: originalReorder })
  }
}

async function main() {
  console.log("Product-supplier link verification\n")

  const inventory = await db.inventory.findFirstOrThrow({
    select: { id: true, productId: true, quantity: true, reserved: true, reorderLevel: true, reorderQty: true },
  })
  productId = inventory.productId
  inventoryId = inventory.id
  originalReorder = { reorderLevel: inventory.reorderLevel, reorderQty: inventory.reorderQty }

  // Force this product below its reorder level so it appears in the advice.
  await db.inventory.update({
    where: { id: inventoryId },
    data: { reorderLevel: inventory.quantity - inventory.reserved + 50, reorderQty: 10 },
  })
  await db.productSupplier.deleteMany({ where: { productId } })

  console.log("1. With no supplier on file, the advice names nobody")
  const bare = await suggestions()
  check(Boolean(bare), "the product appears in reorder advice")
  check(bare?.preferredSupplier === null, "no supplier named", String(bare?.preferredSupplier))
  check(bare?.hasSupplierLink === false, "and it says so rather than implying one")
  check(bare?.suggestedQty === 10, "quantity is the reorder qty", String(bare?.suggestedQty))

  console.log("\n2. Linking two suppliers")
  const cheap = await db.supplier.create({ data: { name: `Probe Cheap ${STAMP}`, status: "active" }, select: { id: true, name: true } })
  const pref = await db.supplier.create({ data: { name: `Probe Preferred ${STAMP}`, status: "active" }, select: { id: true, name: true } })
  madeSuppliers.push(cheap.id, pref.id)

  const a = await api(`/api/products/${productId}/suppliers`, {
    method: "POST", body: JSON.stringify({ supplierId: cheap.id, costPrice: 5, leadTime: 14, minOrderQty: 1 }),
  })
  check(a.status === 201, "cheaper supplier linked", `status ${a.status}`)

  const b = await api(`/api/products/${productId}/suppliers`, {
    method: "POST", body: JSON.stringify({ supplierId: pref.id, costPrice: 8, leadTime: 2, minOrderQty: 25, isPreferred: true }),
  })
  check(b.status === 201, "preferred supplier linked", `status ${b.status}`)

  console.log("\n3. The advice now names a supplier — the preferred one, not the cheapest")
  const linked = await suggestions()
  check(linked?.preferredSupplier === pref.name, "preferred wins over cheaper", String(linked?.preferredSupplier))
  check(linked?.unitCost === 8, "at its cost, not the product's", String(linked?.unitCost))
  check(linked?.leadTimeDays === 2, "with its lead time", String(linked?.leadTimeDays))
  console.log("     Before this, the field was called preferredSupplier and only sorted by price.")

  console.log("\n4. The supplier's minimum raises the suggested quantity")
  check(linked?.suggestedQty === 25, "10 raised to the 25 minimum", String(linked?.suggestedQty))
  check(linked?.raisedToMinimum === true, "and flagged so the change is explainable")

  console.log("\n5. Only one supplier can be preferred")
  const bId = (b.body as { data?: { id: string } })?.data?.id
  const aId = (a.body as { data?: { id: string } })?.data?.id
  await api(`/api/products/${productId}/suppliers/${aId}`, {
    method: "PATCH", body: JSON.stringify({ isPreferred: true }),
  })
  const preferredCount = await db.productSupplier.count({ where: { productId, isPreferred: true } })
  check(preferredCount === 1, "still exactly one", `${preferredCount}`)

  console.log("\n6. Guards")
  const dup = await api(`/api/products/${productId}/suppliers`, {
    method: "POST", body: JSON.stringify({ supplierId: cheap.id, costPrice: 3 }),
  })
  check(dup.status === 409, "the same supplier cannot be linked twice", dup.body?.error)

  const neg = await api(`/api/products/${productId}/suppliers`, {
    method: "POST", body: JSON.stringify({ supplierId: pref.id, costPrice: -1 }),
  })
  check(neg.status === 409 || neg.status === 400, "a negative cost is refused", neg.body?.error)

  const foreign = await api(`/api/products/${productId}/suppliers/${bId}xyz`, {
    method: "PATCH", body: JSON.stringify({ costPrice: 1 }),
  })
  check(foreign.status === 404, "an unknown link 404s", `status ${foreign.status}`)

  await cleanup()
  console.log("\n   (probe suppliers, links and reorder levels restored)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
