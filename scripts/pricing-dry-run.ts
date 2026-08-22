/**
 * What would change if price lists were switched on.
 *
 * `enablePriceLists` changes what customers are charged. Turning it on and
 * hearing about it from a customer is not acceptable, so this reprices real
 * historical orders through `resolveLinePrice` and reports the deltas. It
 * writes nothing.
 *
 *   npx tsx scripts/pricing-dry-run.ts            # last 90 days
 *   npx tsx scripts/pricing-dry-run.ts --days 365
 *   npx tsx scripts/pricing-dry-run.ts --all
 *   npx tsx scripts/pricing-dry-run.ts --csv > deltas.csv
 *   npx tsx scripts/pricing-dry-run.ts --with-defaults   # also price
 *       customers who have no list assigned, from the default list
 */

import { PrismaClient } from "@prisma/client"

import { resolveLinePrice, type CandidatePriceItem, type CandidatePriceList } from "../src/lib/pricing"
import { getSettings } from "../src/lib/settings/service"

const db = new PrismaClient()

const argv = process.argv.slice(2)
const asCsv = argv.includes("--csv")
const allTime = argv.includes("--all")
const withDefaults = argv.includes("--with-defaults")
const daysArg = argv.indexOf("--days")
const days = daysArg !== -1 ? Number(argv[daysArg + 1]) || 90 : 90

const money = (value: number) =>
  `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`

function pct(part: number, whole: number) {
  if (whole === 0) return "0.0%"
  return `${((part / whole) * 100).toFixed(1)}%`
}

async function main() {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const orders = await db.salesOrder.findMany({
    where: {
      status: { notIn: ["draft", "cancelled"] },
      ...(allTime ? {} : { createdAt: { gte: since } }),
    },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      companyId: true,
      customer: {
        select: { id: true, name: true, priceListId: true, customerType: true },
      },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          product: {
            select: { id: true, name: true, wholesalePrice: true, retailPrice: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  if (orders.length === 0) {
    console.log(
      `No orders in the last ${days} days. Re-run with --all to cover the whole history.`
    )
    await db.$disconnect()
    return
  }

  // Every list and item once, rather than per line.
  const lists: CandidatePriceList[] = await db.priceList.findMany({
    select: {
      id: true,
      isDefault: true,
      type: true,
      status: true,
      validFrom: true,
      validTo: true,
      createdAt: true,
    },
  })

  const allItems = await db.priceListItem.findMany({
    select: {
      id: true,
      priceListId: true,
      productId: true,
      price: true,
      minQty: true,
      maxQty: true,
      discountPercent: true,
      discountFlat: true,
    },
  })

  const itemsByProduct = new Map<string, CandidatePriceItem[]>()
  for (const item of allItems) {
    const bucket = itemsByProduct.get(item.productId) ?? []
    bucket.push(item)
    itemsByProduct.set(item.productId, bucket)
  }

  // The real saved settings, but with the switch forced on — that is the
  // scenario being previewed.
  const saved = await getSettings("pricing")
  const proposed = {
    ...saved,
    enablePriceLists: true,
    useDefaultPriceListWhenCustomerHasNone:
      withDefaults || saved.useDefaultPriceListWhenCustomerHasNone,
  }

  interface Row {
    order: string
    date: Date
    customer: string
    product: string
    quantity: number
    was: number
    now: number
    source: string
  }

  const changed: Row[] = []
  let linesTotal = 0
  let currentRevenue = 0
  let proposedRevenue = 0
  const perCustomer = new Map<string, { was: number; now: number; lines: number }>()
  const bySource = new Map<string, number>()
  const byReason = new Map<string, number>()

  for (const order of orders) {
    for (const line of order.items) {
      linesTotal += 1

      const resolved = resolveLinePrice(
        {
          quantity: line.quantity,
          // Deliberately NOT passing the stored unitPrice as an override: the
          // question is what the engine would charge on its own. Passing it
          // would make every line an "override" and report zero change.
          product: {
            wholesalePrice: line.product.wholesalePrice,
            retailPrice: line.product.retailPrice,
          },
          customer: order.customer,
          items: itemsByProduct.get(line.product.id) ?? [],
          lists,
          asOf: order.createdAt,
        },
        proposed
      )

      const wasLine = line.unitPrice * line.quantity
      const nowLine = resolved.unitPrice * line.quantity

      currentRevenue += wasLine
      proposedRevenue += nowLine

      bySource.set(resolved.source, (bySource.get(resolved.source) ?? 0) + 1)
      if (resolved.reason) {
        byReason.set(resolved.reason, (byReason.get(resolved.reason) ?? 0) + 1)
      }

      const entry = perCustomer.get(order.customer.name) ?? { was: 0, now: 0, lines: 0 }
      entry.was += wasLine
      entry.now += nowLine
      entry.lines += 1
      perCustomer.set(order.customer.name, entry)

      if (Math.abs(resolved.unitPrice - line.unitPrice) > 0.005) {
        changed.push({
          order: order.orderNumber,
          date: order.createdAt,
          customer: order.customer.name,
          product: line.product.name,
          quantity: line.quantity,
          was: line.unitPrice,
          now: resolved.unitPrice,
          source: resolved.source,
        })
      }
    }
  }

  if (asCsv) {
    console.log("order,date,customer,product,quantity,unitPriceNow,unitPriceProposed,delta,source")
    for (const row of changed) {
      console.log(
        [
          row.order,
          row.date.toISOString().slice(0, 10),
          `"${row.customer.replace(/"/g, '""')}"`,
          `"${row.product.replace(/"/g, '""')}"`,
          row.quantity,
          row.was.toFixed(2),
          row.now.toFixed(2),
          (row.now - row.was).toFixed(2),
          row.source,
        ].join(",")
      )
    }
    await db.$disconnect()
    return
  }

  const window = allTime ? "all time" : `last ${days} days`
  const scenario = proposed.useDefaultPriceListWhenCustomerHasNone
    ? "price lists ON, unassigned customers priced from the default list"
    : "price lists ON"
  const delta = proposedRevenue - currentRevenue

  console.log(`\nPricing dry run — ${window}`)
  console.log(scenario)
  console.log("=".repeat(72))
  console.log(`Orders            ${orders.length}`)
  console.log(`Lines             ${linesTotal}`)
  console.log(`Lines changed     ${changed.length}  (${pct(changed.length, linesTotal)})`)
  console.log()
  console.log(`Charged today     ${money(currentRevenue)}`)
  console.log(`With price lists  ${money(proposedRevenue)}`)
  console.log(
    `Difference        ${money(delta)}  (${pct(delta, currentRevenue)} ${delta < 0 ? "LESS revenue" : delta > 0 ? "MORE revenue" : "no change"})`
  )

  console.log("\nWhere each line's price came from:")
  for (const [source, count] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source.padEnd(18)} ${String(count).padStart(5)}  ${pct(count, linesTotal)}`)
  }

  if (byReason.size > 0) {
    const explain: Record<string, string> = {
      lists_disabled: "price lists switched off",
      no_list_assigned: "customer has no price list",
      product_not_in_list: "product is missing from the customer's list",
      no_band_for_quantity: "list covers the product, but no band covers that quantity",
      list_inactive: "the list is archived or outside its validity window",
    }

    console.log("\nWhy lines did NOT use a price list:")
    for (const [code, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(5)}  ${explain[code] ?? code}`)
    }
    console.log(
      "\n  These lines are priced from the product, not a contract. Each is a gap\n" +
        "  in the price lists rather than a pricing change — worth closing before\n" +
        "  anyone relies on list pricing being complete."
    )
  }

  if (changed.length === 0) {
    console.log("\nNo line would change price. Safe to enable.")
    await db.$disconnect()
    return
  }

  const affected = [...perCustomer.entries()]
    .map(([name, value]) => ({ name, ...value, delta: value.now - value.was }))
    .filter((entry) => Math.abs(entry.delta) > 0.005)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  console.log(`\nCustomers affected: ${affected.length}`)
  console.log("-".repeat(72))
  for (const entry of affected.slice(0, 15)) {
    console.log(
      `  ${entry.name.slice(0, 30).padEnd(31)} ${money(entry.was).padStart(12)} -> ${money(entry.now).padStart(12)}` +
        `  ${money(entry.delta).padStart(11)}  ${pct(entry.delta, entry.was).padStart(7)}`
    )
  }
  if (affected.length > 15) {
    console.log(`  ... and ${affected.length - 15} more`)
  }

  console.log(`\nLargest per-line moves (of ${changed.length}):`)
  console.log("-".repeat(72))
  const worst = [...changed]
    .sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was))
    .slice(0, 15)

  for (const row of worst) {
    console.log(
      `  ${row.order.padEnd(18)} ${row.product.slice(0, 24).padEnd(25)} x${String(row.quantity).padStart(4)}` +
        `  ${money(row.was).padStart(9)} -> ${money(row.now).padStart(9)}  ${row.source}`
    )
  }

  console.log(
    "\nRead this before setting enablePriceLists to true. Re-run with --csv for the full list."
  )

  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
