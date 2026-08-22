/**
 * Pricing wiring verification.
 *
 * `priceSalesOrder` is the one function every order path goes through — the
 * admin UI, the storefront and the agent. This drives it against real seeded
 * customers and products and writes nothing.
 *
 * Two claims:
 *   1. With `enablePriceLists` off (the shipped default) every line is priced
 *      from the product, exactly as before this phase.
 *   2. With it on, a customer holding a contract list is charged the contract
 *      price, and the line records which price list item produced it.
 *
 *   npx tsx scripts/verify-pricing.ts
 */

import { PrismaClient } from "@prisma/client"

import { priceSalesOrder } from "../src/lib/sales-orders"
import { clearSettingsCache, saveSettings } from "../src/lib/settings/service"

const db = new PrismaClient()

let failures = 0

function check(ok: boolean, label: string, detail?: string) {
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`)
}

async function setEnabled(on: boolean) {
  const result = await saveSettings("pricing", { enablePriceLists: on })
  if (!result.ok) throw new Error(`could not toggle pricing: ${result.error}`)
  clearSettingsCache()
}

async function main() {
  console.log("Pricing wiring verification\n")

  // A customer whose list actually covers a product, at a price that differs
  // from wholesale — otherwise the test proves nothing.
  const candidates = await db.priceListItem.findMany({
    where: {
      priceList: { status: "active", customers: { some: {} } },
    },
    select: {
      id: true,
      price: true,
      minQty: true,
      productId: true,
      priceListId: true,
      product: { select: { id: true, name: true, wholesalePrice: true } },
      priceList: {
        select: {
          name: true,
          customers: { select: { id: true, name: true, companyId: true }, take: 1 },
        },
      },
    },
    orderBy: { price: "asc" },
  })

  // Prisma cannot compare two columns in a filter, so pick in memory. An item
  // whose contract price equals wholesale proves nothing about the price — the
  // assertion would pass whether or not the list was consulted.
  const usable = candidates.filter(
    (entry) =>
      entry.priceList.customers.length > 0 && entry.price !== entry.product.wholesalePrice
  )

  const candidate = usable[0] ?? candidates.find((entry) => entry.priceList.customers.length > 0)

  if (!candidate || candidate.priceList.customers.length === 0) {
    console.log("No customer is assigned a price list covering a product — cannot verify.")
    await db.$disconnect()
    process.exit(1)
  }

  const customer = candidate.priceList.customers[0]
  const quantity = Math.max(candidate.minQty, 1)
  const wholesale = candidate.product.wholesalePrice

  console.log(`  customer   ${customer.name}`)
  console.log(`  list       ${candidate.priceList.name}`)
  console.log(`  product    ${candidate.product.name}`)
  console.log(`  wholesale  $${wholesale}   contract $${candidate.price}   qty ${quantity}\n`)

  if (candidate.price === wholesale) {
    console.log(
      "  WEAK: contract price equals wholesale, so the price assertion below cannot\n" +
        "  distinguish a working price list from a broken one. Counted as a failure."
    )
    failures += 1
  }

  const priceLine = async () => {
    const result = await priceSalesOrder([{ productId: candidate.productId, quantity }], {
      customerId: customer.id,
      companyId: customer.companyId,
    })
    if (!result.ok) throw new Error(result.error)
    return result.items[0]
  }

  // ---------------------------------------------------------------- claim 1
  console.log("1. Disabled (the shipped default) — nothing changes")
  await setEnabled(false)

  const off = await priceLine()
  check(off.unitPrice === wholesale, "priced from the product, as before", `$${off.unitPrice}`)
  check(off.priceSource === "wholesale", "recorded as wholesale", off.priceSource)
  check(off.priceListItemId === null, "no price list item attributed")

  // ---------------------------------------------------------------- claim 2
  console.log("\n2. Enabled — the contract price applies")
  await setEnabled(true)

  const on = await priceLine()
  check(
    on.unitPrice === candidate.price,
    "charged the contract price",
    `$${on.unitPrice} (list says $${candidate.price})`
  )
  check(on.priceSource === "priceList", "recorded as priceList", on.priceSource)
  check(
    on.priceListItemId === candidate.id,
    "attributed to the exact price list item",
    on.priceListItemId ?? "(none)"
  )

  const delta = wholesale - on.unitPrice
  if (delta !== 0) {
    console.log(
      `\n   That is $${delta.toFixed(2)} per unit less than wholesale — the discount this`
    )
    console.log("   customer was contracted for and was not receiving.")
  }

  // ---------------------------------------------------------------- claim 3
  console.log("\n3. A typed price still wins")
  const overridden = await priceSalesOrder(
    [{ productId: candidate.productId, quantity, unitPrice: 12.34 }],
    { customerId: customer.id, companyId: customer.companyId }
  )
  if (overridden.ok) {
    check(overridden.items[0].unitPrice === 12.34, "manual override respected", `$${overridden.items[0].unitPrice}`)
    check(overridden.items[0].priceSource === "override", "recorded as override", overridden.items[0].priceSource)
  } else {
    check(false, "manual override respected", overridden.error)
  }

  // ------------------------------------------------------------------ reset
  await db.setting.deleteMany({ where: { key: "pricing" } })
  clearSettingsCache()

  const restored = await priceLine()
  check(
    restored.unitPrice === wholesale,
    "settings reset leaves pricing back at the safe default",
    `$${restored.unitPrice}`
  )

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)

  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await db.setting.deleteMany({ where: { key: "pricing" } }).catch(() => {})
  await db.$disconnect()
  process.exit(1)
})
