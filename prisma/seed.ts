import { seedAu } from "./seed-au"
import { seedSupplyOs } from "./seed-supply-os"
import { seedCarriers } from "./seed-carriers"

async function runFullSeed() {
  console.log("🚀 Starting pristine SupplySure OS Seed...")
  // 1. Australian wholesale distributor base data
  await seedAu()
  // 2. SupplySure OS branding, POs, suppliers, dispatch staging
  await seedSupplyOs()
  // 3. Freight carriers
  await seedCarriers()
  console.log("🎉 Complete SupplySure OS seed successfully populated!")
}

runFullSeed().catch((e) => {
  console.error("Seed failed:", e)
  process.exit(1)
})
