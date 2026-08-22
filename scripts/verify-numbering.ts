/**
 * Document numbering verification.
 *
 * Three claims, in order of how badly each would hurt if false:
 *
 *   1. With `useCounter: false` — the shipped default — numbers are byte for
 *      byte what the legacy generators produced. Landing this must change
 *      nothing.
 *   2. Flipping a kind on continues the existing sequence rather than
 *      restarting it. A counter that restarts at 1 collides with every number
 *      already issued.
 *   3. Concurrent callers never receive the same number. This is the bug the
 *      counter exists to fix, so it has to be demonstrated under real
 *      parallelism, not asserted.
 *
 *   npx tsx scripts/verify-numbering.ts
 */

import { PrismaClient } from "@prisma/client"

import { nextDocumentNumber } from "../src/lib/numbering"
import { clearSettingsCache, saveSettings } from "../src/lib/settings/service"

const db = new PrismaClient()

let failures = 0

function check(ok: boolean, label: string, detail?: string) {
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`)
}

async function setUseCounter(kind: string, on: boolean) {
  // Through the real save path, with a deliberately partial patch — one field
  // of one kind — because that is what the UI toggle and the agent's settings
  // tool will both send.
  const result = await saveSettings("numbering", { [kind]: { useCounter: on } })

  if (!result.ok) {
    throw new Error(`could not toggle ${kind}: ${result.error}`)
  }

  clearSettingsCache()
}

async function clearNumberingSetting() {
  await db.setting.deleteMany({ where: { key: "numbering" } })
  clearSettingsCache()
}

async function main() {
  console.log("Document numbering verification\n")

  // ---------------------------------------------------------------- claim 1
  console.log("1. Defaults delegate to the legacy generator, unchanged")
  await clearNumberingSetting()

  let legacyCalled = false
  const viaLegacy = await nextDocumentNumber("salesOrder", {
    db,
    legacy: async () => {
      legacyCalled = true
      return "SO-2026-09999"
    },
  })

  check(legacyCalled, "legacy generator was called")
  check(viaLegacy === "SO-2026-09999", "returned the legacy value verbatim", viaLegacy)

  const counterRows = await db.documentCounter.count()
  check(counterRows === 0, "no counter row was created while switched off", `${counterRows} rows`)

  // ---------------------------------------------------------------- claim 2
  console.log("\n2. Switching a kind on continues the existing sequence")

  const highest = await db.salesOrder.findMany({
    where: { orderNumber: { startsWith: "SO-2026-" } },
    select: { orderNumber: true },
  })
  const highestSeq = highest.reduce((max, row) => {
    const tail = Number(row.orderNumber.split("-").at(-1))
    return Number.isFinite(tail) ? Math.max(max, tail) : max
  }, 0)

  console.log(`   highest existing SO-2026-* sequence: ${highestSeq || "(none)"}`)

  await setUseCounter("salesOrder", true)

  const first = await nextDocumentNumber("salesOrder", {
    db,
    legacy: async () => "LEGACY-SHOULD-NOT-BE-CALLED",
  })
  const firstSeq = Number(first.split("-").at(-1))

  check(!first.includes("LEGACY"), "counter path was used, not the legacy one", first)
  check(
    firstSeq === Math.max(highestSeq + 1, 1001),
    "continues from the highest number already issued",
    `${first} (expected sequence ${Math.max(highestSeq + 1, 1001)})`
  )

  const clash = await db.salesOrder.findFirst({ where: { orderNumber: first } })
  check(!clash, "the issued number does not collide with an existing order", first)

  const second = await nextDocumentNumber("salesOrder", { db, legacy: async () => "x" })
  check(
    Number(second.split("-").at(-1)) === firstSeq + 1,
    "the next call increments by exactly one",
    `${first} then ${second}`
  )

  // The salesOrder check above is weak on this database: its orders are
  // numbered RDM-SO-2026-*, so nothing matches the SO-2026- prefix and the
  // seed has nothing to continue from. Invoices do match, so seeding is
  // exercised against real rows here.
  console.log("\n2b. Seeding continues a series that already exists")

  const invoices = await db.invoice.findMany({
    where: { invoiceNumber: { startsWith: "INV-2026-" } },
    select: { invoiceNumber: true },
  })
  const highestInvoice = invoices.reduce((max, row) => {
    const tail = Number(row.invoiceNumber.split("-").at(-1))
    return Number.isFinite(tail) ? Math.max(max, tail) : max
  }, 0)

  if (invoices.length === 0) {
    console.log("   SKIPPED — no INV-2026-* rows to continue from")
    failures += 1
  } else {
    console.log(`   ${invoices.length} existing invoices, highest sequence ${highestInvoice}`)

    await setUseCounter("invoice", true)

    const nextInvoice = await nextDocumentNumber("invoice", {
      db,
      legacy: async () => "LEGACY-SHOULD-NOT-BE-CALLED",
    })

    check(
      Number(nextInvoice.split("-").at(-1)) === highestInvoice + 1,
      "continues from the highest invoice already issued",
      `${nextInvoice} (after ${highestInvoice})`
    )

    const invoiceClash = await db.invoice.findFirst({ where: { invoiceNumber: nextInvoice } })
    check(!invoiceClash, "does not reuse an existing invoice number", nextInvoice)
  }

  // ---------------------------------------------------------------- claim 3
  console.log("\n3. Concurrent callers never collide")

  const CONCURRENT = 25
  const issued = await Promise.all(
    Array.from({ length: CONCURRENT }, () =>
      nextDocumentNumber("salesOrder", { db, legacy: async () => "x" })
    )
  )

  const unique = new Set(issued)
  check(
    unique.size === CONCURRENT,
    `${CONCURRENT} parallel requests produced ${unique.size} distinct numbers`,
    unique.size === CONCURRENT ? undefined : "DUPLICATES ISSUED"
  )

  const sequences = issued.map((n) => Number(n.split("-").at(-1))).sort((a, b) => a - b)
  const contiguous = sequences.every((value, index) => index === 0 || value === sequences[index - 1] + 1)
  check(contiguous, "the numbers form an unbroken run with no gaps")

  // The bug being fixed, demonstrated: count+1 would repeat after a deletion.
  console.log("\n4. The count+1 bug the counter replaces")
  const returnCount = await db.return.count()
  console.log(`   returns in table: ${returnCount} -> legacy would next issue RET-${1000 + returnCount + 1}`)
  console.log("   delete any one return and that number is issued twice.")

  // ------------------------------------------------------------------ reset
  await clearNumberingSetting()
  await db.documentCounter.deleteMany({ where: { kind: { in: ["salesOrder", "invoice"] } } })
  console.log("\n   (settings and test counter rows reset)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)

  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await clearNumberingSetting().catch(() => {})
  await db.$disconnect()
  process.exit(1)
})
