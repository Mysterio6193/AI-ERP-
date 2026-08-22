/**
 * Autonomy limits verification.
 *
 * `saveThresholds` existed with no caller, so the limits were whatever the
 * defaults said. What matters is not that the API stores a number, but that
 * the stored number reaches `decide()` — the gate that actually stops the
 * agent mid-run.
 *
 *   npx tsx scripts/verify-agent-policy.ts
 */
import { PrismaClient } from "@prisma/client"
import { decide, getThresholds, saveThresholds, DEFAULT_THRESHOLDS } from "../src/lib/agent/policy"

const db = new PrismaClient()
let failures = 0
const check = (ok: boolean, label: string, detail?: string) => {
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`)
}

const principal = { kind: "staff", role: "admin", userId: "verify" } as never
const meta = { risk: "medium" as const, valueField: "total" }

const order = async (value: number) =>
  decide({ toolName: "createSalesOrder", meta, value, principal, thresholds: await getThresholds() })

async function main() {
  console.log("Agent autonomy verification\n")
  const original = await getThresholds()

  console.log("1. A saved limit reaches the gate")
  await saveThresholds({ maxOrderValue: 50 })
  check((await order(20)).type === "allow", "$20 order acts alone under a $50 limit")
  const over = await order(200)
  check(over.type === "approve", "$200 order pauses for a human", over.type)
  if (over.type === "approve") console.log(`         reason: "${over.reason}"`)

  console.log("\n2. Raising the limit changes the outcome for the same order")
  await saveThresholds({ maxOrderValue: 50_000 })
  check((await order(200)).type === "allow", "the same $200 order now acts alone")

  console.log("\n3. Read-only denies every write")
  await saveThresholds({ readOnly: true })
  check((await order(1)).type === "deny", "a $1 order is denied")
  check(
    decide({ toolName: "searchProducts", meta: { risk: "read" }, value: undefined, principal, thresholds: await getThresholds() }).type === "allow",
    "reads still work"
  )

  console.log("\n4. Toggling one field does not reset the others")
  await saveThresholds({ readOnly: false })
  const after = await getThresholds()
  check(after.maxOrderValue === 50_000, "the $50,000 limit survived the read-only toggle", `$${after.maxOrderValue}`)

  await saveThresholds(DEFAULT_THRESHOLDS)
  await db.setting.deleteMany({ where: { key: "agent.thresholds" } })
  const restored = await getThresholds()
  check(restored.maxOrderValue === DEFAULT_THRESHOLDS.maxOrderValue, "reset returns to defaults", `$${restored.maxOrderValue}`)

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  console.log(`   (thresholds restored; were $${original.maxOrderValue})`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
