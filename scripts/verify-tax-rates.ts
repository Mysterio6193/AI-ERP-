/**
 * Named tax rate verification.
 *
 * TaxRate was modelled with everything a real rate needs — country, rate,
 * type, HSN ranges, a default flag — and nothing ever created one or read one.
 * Product.gstRate was a bare float, so "which products are GST free" could
 * only be answered by scanning for zeros, and changing a rate meant editing
 * every product carrying that number.
 *
 *   bun scripts/verify-tax-rates.ts
 */
import { db } from "../src/lib/db"
import { priceSalesOrder } from "../src/lib/sales-orders"
import { ensureDefaultTaxRates } from "../src/lib/tax-rates"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const BASE = "http://localhost:3000"
const STAMP = Date.now()
let productId = ""
let originalTaxRateId: string | null = null
const madeRates: string[] = []

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function priceOne(qty = 1) {
  const customer = await db.customer.findFirstOrThrow({ select: { id: true, companyId: true } })
  const result = await priceSalesOrder([{ productId, quantity: qty, unitPrice: 100 }], {
    customerId: customer.id, companyId: customer.companyId,
  })
  if (!result.ok) throw new Error(result.error)
  return result.items[0]
}

async function cleanup() {
  if (productId) {
    await db.product.update({ where: { id: productId }, data: { taxRateId: originalTaxRateId } })
  }
  await db.product.updateMany({ where: { taxRateId: { in: madeRates } }, data: { taxRateId: null } })
  await db.taxRate.deleteMany({ where: { id: { in: madeRates } } })
}

async function main() {
  console.log("Named tax rate verification\n")

  const company = await db.company.findFirstOrThrow({ select: { id: true, country: true } })
  const product = await db.product.findFirstOrThrow({ select: { id: true, gstRate: true, taxRateId: true } })
  productId = product.id
  originalTaxRateId = product.taxRateId

  console.log("1. The standard rates become rows")
  const seeded = await ensureDefaultTaxRates(db, company.id, company.country)
  const rates = await db.taxRate.findMany({ where: { companyId: company.id }, select: { code: true, rate: true } })
  check(rates.length > 0, "rates exist", rates.map((r) => `${r.code}=${r.rate}%`).join(" "))
  console.log(`     created ${seeded.created}, already there ${seeded.existing}`)

  console.log("\n2. Seeding twice creates nothing new")
  const again = await ensureDefaultTaxRates(db, company.id, company.country)
  check(again.created === 0, "idempotent", `created ${again.created}`)

  console.log("\n3. A product with no named rate prices exactly as before")
  await db.product.update({ where: { id: productId }, data: { taxRateId: null } })
  const before = await priceOne()
  check(before.taxRate === product.gstRate, "uses the bare gstRate", `${before.taxRate}%`)

  console.log("\n4. Pointing it at a named rate changes the tax")
  const gstFree = rates.find((r) => r.rate === 0)
  const freeRow = gstFree
    ? await db.taxRate.findFirstOrThrow({ where: { companyId: company.id, code: gstFree.code }, select: { id: true } })
    : null

  if (!freeRow) {
    console.log("     (no zero-rate in the seed; skipped)")
  } else {
    await db.product.update({ where: { id: productId }, data: { taxRateId: freeRow.id } })
    const after = await priceOne()
    check(after.taxRate === 0, "now GST free", `${after.taxRate}%`)
    check(after.taxAmount === 0, "and no tax charged", String(after.taxAmount))
    console.log(`     ${before.taxRate}% -> ${after.taxRate}% without touching Product.gstRate`)

    console.log("\n5. Archiving the rate falls back rather than charging it")
    await db.taxRate.update({ where: { id: freeRow.id }, data: { status: "archived" } })
    const archived = await priceOne()
    check(archived.taxRate === product.gstRate, "back to the bare rate", `${archived.taxRate}%`)
    await db.taxRate.update({ where: { id: freeRow.id }, data: { status: "active" } })
  }

  console.log("\n6. The API guards what would go wrong")
  const dup = await api("/api/tax-rates", {
    method: "POST", body: JSON.stringify({ name: "Dup", code: "AU_GST", rate: 10 }),
  })
  check(dup.status === 409, "a duplicate code is refused", dup.body?.error)

  const bad = await api("/api/tax-rates", {
    method: "POST", body: JSON.stringify({ name: "Silly", code: `X${STAMP}`, rate: 250 }),
  })
  check(bad.status === 400, "a rate above 100 is refused", bad.body?.error)

  const made = await api("/api/tax-rates", {
    method: "POST", body: JSON.stringify({ name: `Probe ${STAMP}`, code: `PROBE${STAMP}`, rate: 7.5 }),
  })
  check(made.status === 201, "a valid rate is created", `status ${made.status}`)
  if (made.body?.data?.id) madeRates.push(made.body.data.id)

  if (made.body?.data?.id) {
    await db.product.update({ where: { id: productId }, data: { taxRateId: made.body.data.id } })
    const inUse = await api(`/api/tax-rates/${made.body.data.id}`, { method: "DELETE" })
    check(inUse.status === 409, "a rate in use cannot be deleted", inUse.body?.error?.slice(0, 70))

    await db.product.update({ where: { id: productId }, data: { taxRateId: null } })
    const freed = await api(`/api/tax-rates/${made.body.data.id}`, { method: "DELETE" })
    check(freed.status === 200, "and can be once nothing uses it", `status ${freed.status}`)
  }

  await cleanup()
  console.log("\n   (probe rate removed, product restored)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
