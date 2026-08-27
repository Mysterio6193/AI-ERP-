import { config } from "dotenv"
config({ path: ".env" })

import { PrismaClient } from "@prisma/client"

/**
 * Empty the database and leave a system RDM can sign in to and start using.
 *
 * This exists because there is no other honest way to hand over a system that
 * was developed against demo data. Every product, customer, order and price
 * here was invented to exercise the code, and a business cannot tell which of
 * it is real once they start working — so all of it goes, rather than most of
 * it.
 *
 * What survives is only what the system cannot function without: the companies
 * that raise invoices, and one administrator to sign in as.
 *
 * Refuses to run without --confirm, and refuses in production entirely. Run
 * `npm run backup && npm run backup:verify` first; this cannot be undone.
 */

const db = new PrismaClient()

/**
 * Every table, in the order they can be emptied without tripping a foreign key.
 * Children before parents. Discovered from the schema rather than hardcoded, so
 * a new model cannot be silently left behind holding demo rows.
 */
async function tablesInDeletionOrder(): Promise<string[]> {
  const rows: Array<{ table_name: string }> = await db.$queryRawUnsafe(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name not like '_prisma%'`
  )

  return rows.map((row) => row.table_name)
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing to run without --confirm. This deletes every row in the database.")
    console.error("Take a backup first:  npm run backup && npm run backup:verify")
    process.exit(1)
  }

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run against a production database.")
    process.exit(1)
  }

  const keepCompanies = await db.company.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      name: true, tradingName: true, abn: true, acn: true, country: true, baseCurrency: true,
      email: true, phone: true, website: true, logoUrl: true,
      address: true, city: true, state: true, postcode: true,
      bankName: true, bsb: true, accountNumber: true, accountName: true,
    },
  })

  const keepAdmin = await db.user.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { name: true, email: true, password: true, role: true, phone: true },
  })

  if (!keepAdmin) {
    console.error("No admin user found. Refusing to wipe a system nobody could sign back in to.")
    process.exit(1)
  }

  console.log(`Preserving ${keepCompanies.length} companies and 1 admin (${keepAdmin.email}).`)
  console.log("Everything else will be deleted.\n")

  const tables = await tablesInDeletionOrder()

  // One statement, so foreign keys never need ordering and identity sequences
  // restart — document numbering then begins at one rather than continuing a
  // demo sequence.
  const quoted = tables.map((table) => `"${table}"`).join(", ")
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`)

  console.log(`Truncated ${tables.length} tables.`)

  for (const company of keepCompanies) {
    await db.company.create({ data: company })
  }

  await db.user.create({ data: keepAdmin })

  console.log(`\nRestored ${keepCompanies.length} companies and the admin account.`)
  console.log("Sign in and add products, customers and suppliers from the app.")

  const remaining: Array<[string, number]> = []
  for (const table of tables) {
    const result: Array<{ n: number }> = await db.$queryRawUnsafe(`select count(*)::int n from "${table}"`)
    if (result[0].n > 0) remaining.push([table, result[0].n])
  }

  console.log("\nTables still holding rows:")
  for (const [table, count] of remaining) console.log(`  ${count}  ${table}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
