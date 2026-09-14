import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

/**
 * The starting plan catalogue.
 *
 * Seeded rather than hardcoded so it is a starting point, not the definition:
 * prices, limits and names are all editable afterwards from the admin screens
 * without a deploy.
 *
 * `limit: null` is unlimited. A limit of 0 would mean "none allowed", which is
 * why the two are never collapsed into one field.
 */

const PLANS = [
  {
    code: "starter",
    name: "Starter",
    description: "One site, a small team, the core order-to-invoice flow.",
    monthlyPriceCents: 9900,
    yearlyPriceCents: 99000,
    trialDays: 14,
    includedSeats: 3,
    perSeatCents: 2500,
    sortOrder: 10,
    entitlements: [
      { key: "limit.users", limit: 3 },
      { key: "limit.warehouses", limit: 1 },
      { key: "limit.products", limit: 500 },
      { key: "limit.workCenters", limit: 0, enabled: false },
      { key: "module.manufacturing", enabled: false },
      { key: "module.commerce", enabled: false },
      { key: "module.agents", enabled: false },
    ],
  },
  {
    code: "professional",
    name: "Professional",
    description: "Multi-site distribution with manufacturing and the agent suite.",
    monthlyPriceCents: 29900,
    yearlyPriceCents: 299000,
    trialDays: 14,
    includedSeats: 15,
    perSeatCents: 1900,
    sortOrder: 20,
    entitlements: [
      { key: "limit.users", limit: 15 },
      { key: "limit.warehouses", limit: 5 },
      { key: "limit.products", limit: 10000 },
      { key: "limit.workCenters", limit: 25 },
      { key: "module.manufacturing", enabled: true },
      { key: "module.commerce", enabled: true },
      { key: "module.agents", enabled: true },
    ],
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "Unlimited scale, self-hosting, and a signed perpetual licence.",
    monthlyPriceCents: 99900,
    yearlyPriceCents: 999000,
    trialDays: 30,
    includedSeats: null,
    perSeatCents: 0,
    sortOrder: 30,
    entitlements: [
      { key: "limit.users", limit: null },
      { key: "limit.warehouses", limit: null },
      { key: "limit.products", limit: null },
      { key: "limit.workCenters", limit: null },
      { key: "module.manufacturing", enabled: true },
      { key: "module.commerce", enabled: true },
      { key: "module.agents", enabled: true },
      { key: "module.selfHosted", enabled: true },
    ],
  },
]

async function main() {
  console.log("💳 Seeding plans…")

  for (const plan of PLANS) {
    const { entitlements, ...fields } = plan

    // Upsert so re-running never duplicates, and so editing a price in the
    // seed updates rather than clashing on the unique code.
    const row = await db.plan.upsert({
      where: { code: plan.code },
      create: { ...fields, currency: "AUD" },
      update: { ...fields },
    })

    for (const entitlement of entitlements) {
      await db.planEntitlement.upsert({
        where: { planId_key: { planId: row.id, key: entitlement.key } },
        create: {
          planId: row.id,
          key: entitlement.key,
          enabled: entitlement.enabled ?? true,
          limit: entitlement.limit ?? null,
        },
        update: {
          enabled: entitlement.enabled ?? true,
          limit: entitlement.limit ?? null,
        },
      })
    }

    const limits = entitlements.filter((e) => "limit" in e).length
    console.log(`   ✅ ${plan.name} — ${entitlements.length} entitlements (${limits} limits)`)
  }

  console.log("🎉 Plans seeded")
}

main()
  .catch((error) => {
    console.error("❌ Plan seed failed:", error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
