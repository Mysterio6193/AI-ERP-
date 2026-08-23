/**
 * RDM entity setup, re-runnable.
 *
 * A reseed wiped RDM's chart of accounts, tax rates and logo, so this exists
 * as a script rather than something done once by hand — anything that can be
 * lost to a reseed should be restorable in one command.
 *
 *   bun scripts/setup-rdm.ts
 */
import { db } from "../src/lib/db"
import { ensureDefaultChartOfAccounts } from "../src/lib/accounting"
import { ensureDefaultTaxRates } from "../src/lib/tax-rates"

const WEBSITE = "www.rdmpizza.com.au"
const LOGO = "https://www.rdmpizza.com.au/wp-content/uploads/rdm-pizz-logo-2020-125.png"

async function main() {
  const rdm = await db.company.findFirst({
    where: { name: { contains: "RDM" } },
    select: { id: true, name: true, country: true, website: true, logoUrl: true },
  })

  if (!rdm) {
    console.log("  No RDM company found — nothing to set up.")
    await db.$disconnect()
    return
  }

  // Books, so anything RDM invoices can post. Gap-filling, so re-running is safe.
  const chart = (await ensureDefaultChartOfAccounts(rdm.id)) as unknown[]
  const rates = await ensureDefaultTaxRates(db, rdm.id, rdm.country)

  await db.company.update({
    where: { id: rdm.id },
    data: {
      website: rdm.website || WEBSITE,
      // Both confirmed against the live site.
      logoUrl: rdm.logoUrl || LOGO,
    },
  })

  const after = await db.company.findUniqueOrThrow({
    where: { id: rdm.id },
    select: { website: true, logoUrl: true, abn: true, bankName: true, bsb: true, accountNumber: true, accountName: true },
  })

  console.log(`  ${rdm.name}`)
  console.log(`    chart of accounts : ${chart.length}`)
  console.log(`    tax rates         : created ${rates.created}, already there ${rates.existing}`)
  console.log(`    website           : ${after.website}`)
  console.log(`    logo              : ${after.logoUrl ? "set" : "—"}`)
  console.log(`    abn               : ${after.abn}`)

  const missing = (["bankName", "bsb", "accountNumber", "accountName"] as const).filter((k) => !after[k])
  console.log(
    missing.length
      ? `\n    STILL MISSING: ${missing.join(", ")} — only RDM can supply these, and\n    without them their invoices cannot be paid.`
      : "\n    Bank details present — invoices are payable."
  )

  await db.$disconnect()
}

main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1) })
