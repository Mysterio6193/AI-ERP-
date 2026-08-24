import { db } from "../src/lib/db"
import { execSync } from "child_process"

async function reseedRdm() {
  console.log("🍕 Cleaning old demo tables to prepare for 100% RDM Pizza Group dataset...")

  // Delete in strict foreign key dependency order
  await db.stockReservation.deleteMany()
  await db.wishlistItem.deleteMany()
  await db.customerCartItem.deleteMany()
  await db.quoteItem.deleteMany()
  await db.quote.deleteMany()
  await db.discountRule.deleteMany()
  await db.priceListItem.deleteMany()
  await db.priceList.deleteMany()
  await db.pickListItem.deleteMany()
  await db.pickList.deleteMany()
  await db.delivery.deleteMany()
  await db.deliveryRoute.deleteMany()
  await db.freightBooking.deleteMany()
  await db.carrierZone.deleteMany()
  await db.carrier.deleteMany()
  await db.payment.deleteMany()
  await db.creditNote.deleteMany()
  await db.invoice.deleteMany()
  await db.salesOrderItem.deleteMany()
  await db.salesOrderStatusLog.deleteMany()
  await db.salesOrder.deleteMany()
  await db.purchaseOrderItem.deleteMany()
  await db.purchaseOrder.deleteMany()
  await db.bomLine.deleteMany()
  await db.billOfMaterial.deleteMany()
  await db.productionConsumption.deleteMany()
  await db.productionOrder.deleteMany()
  await db.stockMovement.deleteMany()
  await db.inventoryBatch.deleteMany()
  await db.inventory.deleteMany()
  await db.productUnit.deleteMany()
  await db.productSupplier.deleteMany()
  await db.productVariant.deleteMany()
  await db.product.deleteMany()
  await db.creditTransaction.deleteMany()
  await db.creditApplication.deleteMany()
  await db.communicationLog.deleteMany()
  await db.activity.deleteMany()
  await db.crmTask.deleteMany()
  await db.case.deleteMany()
  await db.lead.deleteMany()
  await db.opportunity.deleteMany()
  await db.customerLocation.deleteMany()
  await db.customer.deleteMany()
  await db.supplier.deleteMany()
  await db.category.deleteMany()
  await db.warehouse.deleteMany()
  await db.approvalAction.deleteMany()
  await db.auditLog.deleteMany()
  await db.agentThread.deleteMany()

  /**
   * Deliberately NOT deleted: users, channel identities and agent definitions.
   *
   * Truncating those cost a working system rather than demo data. Deleting
   * every user removed the account people actually sign in with, so the app
   * became unreachable. Deleting channel identities unlinked every Telegram
   * account, which can only be restored by each person scanning a new QR.
   * And deleting users while agent definitions survive leaves runAsUserId
   * pointing at a row that no longer exists, so a scheduled agent fails at run
   * time with "No staff user available to run as", long after anyone connects
   * it to a reseed.
   *
   * A reseed is for demo data. Access and wiring are not demo data.
   */
  const seededUsers = await db.user.findMany({
    where: { email: { endsWith: "@rdmpizza.com.au" } },
    select: { id: true },
  })

  // Only the accounts this seed owns, so a real operator account added later
  // survives being re-run.
  await db.user.deleteMany({ where: { id: { in: seededUsers.map((u) => u.id) } } })
  await db.company.deleteMany()

  console.log("✅ Database cleared. Running seed-rdm.ts...")
  execSync("npx tsx prisma/seed-rdm.ts", { stdio: "inherit" })

  console.log("✅ Running seed-bom.ts (Recipes & Manufacturing BOMs)...")
  try {
    execSync("npx tsx prisma/seed-bom.ts", { stdio: "inherit" })
  } catch (err) {
    console.warn("BOM seed note:", err)
  }

  console.log("✅ Running seed-skills.ts (13 Hermes Business Skills)...")
  execSync("npx tsx scripts/seed-skills.ts", { stdio: "inherit" })

  console.log("✅ Running sync-hermes-skills.ts (82 Hermes Skills)...")
  execSync("npx tsx scripts/sync-hermes-skills.ts", { stdio: "inherit" })

  /**
   * Leave the system usable.
   *
   * A reseed that finishes with no agents, a dangling runAsUserId and no way
   * to sign in has not reseeded the data — it has broken the install. These
   * two are idempotent, so running them here costs nothing and means the
   * failure cannot survive the script.
   */
  console.log("✅ Restoring agents and repairing references...")
  execSync("npx tsx scripts/restore-agents.ts", { stdio: "inherit" })

  console.log("✅ Restoring RDM entity setup (chart of accounts, tax rates, branding)...")
  execSync("npx tsx scripts/setup-rdm.ts", { stdio: "inherit" })

  const admin = await db.user.findFirst({
    where: { role: "admin", status: "active" },
    select: { email: true },
  })

  console.log("🎉 100% RDM Pizza Group dataset successfully active!")
  console.log(`   Sign in as: ${admin?.email ?? "NO ACTIVE ADMIN — the app is unreachable"}`)
  console.log("   Telegram links are preserved; if any are missing, re-link from Settings → Agent.")
}

reseedRdm()
  .catch(console.error)
  .finally(() => db.$disconnect())
