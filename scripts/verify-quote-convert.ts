/**
 * Quote → order conversion verification.
 *
 * Converting a quote built the order directly with tx.salesOrder.create, so it
 * never reached checkCreditForOrder: a customer over their limit or on hold
 * could be let through simply by having a quote converted. It also dropped
 * priceListItemId and priceSource, losing the answer to "why was this line
 * this price?" at the moment the quote became an order.
 *
 *   bun scripts/verify-quote-convert.ts
 */
import { db } from "../src/lib/db"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const BASE = process.env.PROBE_BASE_URL || "http://localhost:3000"
const STAMP = Date.now()
const quotes: string[] = []
const orders: string[] = []
let customerId = ""
let restore: { creditLimit: number; creditBalance: number; creditStatus: string } | null = null

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function cleanup() {
  await db.salesOrderItem.deleteMany({ where: { orderId: { in: orders } } })
  await db.salesOrder.deleteMany({ where: { id: { in: orders } } })
  await db.quoteItem.deleteMany({ where: { quoteId: { in: quotes } } })
  await db.quote.deleteMany({ where: { id: { in: quotes } } })
  if (customerId && restore) {
    await db.customer.update({ where: { id: customerId }, data: restore })
  }
}

async function makeQuote(n: number, total: number, withProvenance: boolean) {
  const company = await db.company.findFirstOrThrow({ select: { id: true } })
  const product = await db.product.findFirstOrThrow({ select: { id: true } })
  const item = withProvenance
    ? await db.priceListItem.findFirst({ select: { id: true } })
    : null

  const quote = await db.quote.create({
    data: {
      quoteNumber: `PROBE-QT-${STAMP}-${n}`,
      customerId, companyId: company.id, status: "sent",
      subtotal: total, taxAmount: 0, totalAmount: total,
      items: { create: [{
        productId: product.id, quantity: 1, unitPrice: total,
        taxRate: 0, taxAmount: 0, total,
        priceListItemId: item?.id ?? null,
        priceSource: item ? "priceList" : "wholesale",
      }] },
    },
    select: { id: true },
  })
  quotes.push(quote.id)
  return quote
}

async function main() {
  console.log("Quote → order conversion verification\n")

  const customer = await db.customer.findFirstOrThrow({
    select: { id: true, name: true, creditLimit: true, creditBalance: true, creditStatus: true },
  })
  customerId = customer.id
  restore = {
    creditLimit: customer.creditLimit,
    creditBalance: customer.creditBalance,
    creditStatus: customer.creditStatus,
  }

  console.log("1. A quote that would blow the credit limit is refused")
  await db.customer.update({
    where: { id: customerId },
    data: { creditLimit: 100, creditBalance: 90, creditStatus: "active" },
  })

  const overQuote = await makeQuote(1, 5000, false)
  const refused = await api(`/api/quotes/${overQuote.id}`, {
    method: "PUT", body: JSON.stringify({ action: "convert" }),
  })

  check(refused.status === 409, "refused with 409", `status ${refused.status}`)
  check(refused.body?.code === "credit_limit", "for the right reason", refused.body?.error?.slice(0, 66))

  const leaked = await db.salesOrder.count({ where: { quoteId: overQuote.id } })
  check(leaked === 0, "and no order was created")
  console.log("     Before this, that order went through with no credit check at all.")

  console.log("\n2. Within the limit, conversion still works")
  await db.customer.update({
    where: { id: customerId },
    data: { creditLimit: 100000, creditBalance: 0, creditStatus: "active" },
  })

  const okQuote = await makeQuote(2, 500, true)
  const converted = await api(`/api/quotes/${okQuote.id}`, {
    method: "PUT", body: JSON.stringify({ action: "convert" }),
  })

  check(converted.status === 200, "converted", `status ${converted.status}`)
  if (converted.body?.data?.id) orders.push(converted.body.data.id)

  console.log("\n3. Price provenance survives the conversion")
  const quoteLine = await db.quoteItem.findFirstOrThrow({
    where: { quoteId: okQuote.id }, select: { priceListItemId: true, priceSource: true },
  })
  const orderLine = await db.salesOrderItem.findFirstOrThrow({
    where: { orderId: converted.body.data.id }, select: { priceListItemId: true, priceSource: true },
  })

  check(orderLine.priceSource === quoteLine.priceSource, "priceSource carried across",
    `${quoteLine.priceSource} -> ${orderLine.priceSource}`)
  check(orderLine.priceListItemId === quoteLine.priceListItemId, "priceListItemId carried across",
    orderLine.priceListItemId ? "linked" : "(none on the quote either)")

  console.log("\n4. Converting twice returns the same order")
  const again = await api(`/api/quotes/${okQuote.id}`, {
    method: "PUT", body: JSON.stringify({ action: "convert" }),
  })
  check(again.body?.data?.id === converted.body.data.id, "no duplicate order")

  await cleanup()
  console.log("\n   (probe quotes, orders and credit settings restored)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
