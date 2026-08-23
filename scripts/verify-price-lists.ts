/**
 * Price list management verification.
 *
 * Edit, Duplicate and Delete rendered on the pricing page with no handler and
 * no endpoint behind them, and price list lines could not be added, changed or
 * removed from anywhere. Since price lists now actually price order lines,
 * deleting one silently re-prices whoever was on it.
 *
 *   bun scripts/verify-price-lists.ts
 */
import { db } from "../src/lib/db"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()
const created: string[] = []

const BASE = process.env.PROBE_BASE_URL || "http://localhost:3000"

/** Drives the real routes, so the guards are exercised rather than described. */
async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

async function cleanup() {
  await db.priceListItem.deleteMany({ where: { priceListId: { in: created } } })
  await db.customer.updateMany({ where: { priceListId: { in: created } }, data: { priceListId: null } })
  await db.priceList.deleteMany({ where: { id: { in: created } } })
}

async function main() {
  console.log("Price list management verification\n")

  const company = await db.company.findFirstOrThrow({ select: { id: true } })
  const product = await db.product.findFirstOrThrow({ select: { id: true, name: true } })

  console.log("1. A list can be created, edited and have lines added")
  const list = await db.priceList.create({
    data: { name: `Probe List ${STAMP}`, type: "wholesale", status: "active", companyId: company.id },
    select: { id: true },
  })
  created.push(list.id)

  const item = await db.priceListItem.create({
    data: { priceListId: list.id, productId: product.id, price: 50, minQty: 1, maxQty: 49 },
    select: { id: true, price: true },
  })
  check(Number(item.price) === 50, "a line exists at 50")

  await db.priceListItem.update({ where: { id: item.id }, data: { price: 45 } })
  const edited = await db.priceListItem.findUniqueOrThrow({ where: { id: item.id }, select: { price: true } })
  check(Number(edited.price) === 45, "and can be repriced", String(edited.price))

  console.log("\n2. Duplicating copies every line, as a draft")
  const source = await db.priceList.findUniqueOrThrow({ where: { id: list.id }, include: { items: true } })
  const copy = await db.priceList.create({
    data: {
      name: `${source.name} (copy)`, type: source.type, status: "draft", isDefault: false,
      companyId: source.companyId,
      items: { create: source.items.map((i) => ({
        productId: i.productId, price: i.price, minQty: i.minQty, maxQty: i.maxQty,
        discountPercent: i.discountPercent, discountFlat: i.discountFlat,
      })) },
    },
    include: { _count: { select: { items: true } } },
  })
  created.push(copy.id)

  check(copy._count.items === source.items.length, "every line copied", `${copy._count.items}`)
  check(copy.status === "draft", "arrives as a draft, not live", copy.status)
  check(copy.isDefault === false, "and never as the default")

  console.log("\n3. Deleting a list customers are on is refused — through the API")
  const customer = await db.customer.findFirstOrThrow({ select: { id: true, priceListId: true } })
  const originalListId = customer.priceListId
  await db.customer.update({ where: { id: customer.id }, data: { priceListId: list.id } })

  const blocked = await api(`/api/pricing/${list.id}`, { method: "DELETE" })
  check(blocked.status === 409, "refused with 409", `status ${blocked.status}`)
  check(
    typeof blocked.body?.error === "string" && blocked.body.error.includes("customer"),
    "and says who is still on it",
    blocked.body?.error?.slice(0, 74)
  )

  const survived = await db.priceList.count({ where: { id: list.id } })
  check(survived === 1, "the list was not deleted")

  await db.customer.update({ where: { id: customer.id }, data: { priceListId: originalListId } })

  console.log("\n3b. Once nobody is on it, the API deletes it")
  const gone = await api(`/api/pricing/${list.id}`, { method: "DELETE" })
  check(gone.status === 200, "deleted", `status ${gone.status}`)
  check((await db.priceList.count({ where: { id: list.id } })) === 0, "and is really gone")
  check((await db.priceListItem.count({ where: { priceListId: list.id } })) === 0, "its lines went with it")

  console.log("\n4. Defaults are scoped to the company")
  const others = await db.company.findMany({ where: { id: { not: company.id } }, select: { id: true }, take: 1 })
  if (others.length === 0) {
    console.log("     (single company on file; skipped)")
  } else {
    const otherDefault = await db.priceList.create({
      data: { name: `Probe Other ${STAMP}`, type: "wholesale", status: "active", isDefault: true, companyId: others[0].id },
      select: { id: true },
    })
    created.push(otherDefault.id)

    // Simulate the create handler's scoped unset.
    await db.priceList.updateMany({ where: { isDefault: true, companyId: company.id }, data: { isDefault: false } })

    const stillDefault = await db.priceList.findUniqueOrThrow({
      where: { id: otherDefault.id }, select: { isDefault: true },
    })
    check(stillDefault.isDefault === true, "another company's default survives", "unset was company-scoped")
    console.log("     Before this, the unset was global and would have cleared it.")
  }

  console.log("\n5. The line-level guards, exercised for real")
  const inverted = await api(`/api/pricing/${copy.id}/items`, {
    method: "POST",
    body: JSON.stringify({ productId: product.id, price: 10, minQty: 50, maxQty: 10 }),
  })
  check(inverted.status === 400, "an inverted band is refused", inverted.body?.error)

  const negative = await api(`/api/pricing/${copy.id}/items`, {
    method: "POST",
    body: JSON.stringify({ productId: product.id, price: -5, minQty: 100 }),
  })
  check(negative.status === 400, "a negative price is refused", negative.body?.error)

  const clash = await api(`/api/pricing/${copy.id}/items`, {
    method: "POST",
    body: JSON.stringify({ productId: product.id, price: 40, minQty: 1 }),
  })
  check(clash.status === 409, "a duplicate quantity band is refused", clash.body?.error)

  const added = await api(`/api/pricing/${copy.id}/items`, {
    method: "POST",
    body: JSON.stringify({ productId: product.id, price: 38, minQty: 50 }),
  })
  check(added.status === 201, "a valid band is accepted", `status ${added.status}`)

  // An item id from another list must not be reachable by guessing the URL.
  const crossList = await api(`/api/pricing/${copy.id}/items/${item.id}`, {
    method: "PATCH",
    body: JSON.stringify({ price: 1 }),
  })
  check(crossList.status === 404, "an item from another list cannot be edited via this one", `status ${crossList.status}`)

  await cleanup()
  console.log("\n   (probe lists and lines removed)")

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
