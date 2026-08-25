/**
 * Put the people the business already knows into the CRM.
 *
 * Idempotent: running it twice corrects rather than duplicates, so it is safe
 * to re-run after importing customers.
 */
import { config } from "dotenv"
config({ path: ".env" })

async function main() {
  const { db } = await import("../src/lib/db")
  const { ensurePrimaryContact } = await import("../src/lib/contact-sync")

  const customers = await db.customer.findMany({
    where: { contactPerson: { not: null } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  console.log(`${customers.length} customer(s) name a contact person\n`)

  const tally = { created: 0, updated: 0, unchanged: 0, skipped: 0 }

  for (const customer of customers) {
    const result = await ensurePrimaryContact(db, customer.id)

    if (!result.ok) {
      tally.skipped++
      console.log(`  skip     ${customer.name} — ${result.reason}`)
      continue
    }

    tally[result.action]++
    if (result.action !== "unchanged") console.log(`  ${result.action.padEnd(8)} ${customer.name}`)
  }

  const total = await db.contact.count()
  console.log(
    `\ncreated ${tally.created}, updated ${tally.updated}, unchanged ${tally.unchanged}, skipped ${tally.skipped}`
  )
  console.log(`${total} contact(s) in the CRM`)

  await db.$disconnect()
}

main()
