/**
 * Settings-as-tools guard verification.
 *
 * Letting the agent reshape how the business works is the most dangerous thing
 * in the platform. Four guards stand in front of it, and each is asserted here
 * against the real tool bodies rather than trusted to policy metadata.
 *
 *   npx tsx scripts/verify-agent-settings.ts
 */

import { PrismaClient } from "@prisma/client"

import { buildSettingsTools, describeSettingProposal } from "../src/lib/agent/tools/settings"
import { clearSettingsCache } from "../src/lib/settings/service"

const db = new PrismaClient()

let failures = 0
function check(ok: boolean, label: string, detail?: string) {
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`)
}

const admin = { kind: "staff", role: "admin", userId: "verify-admin", name: "Verify" } as never
const sales = { kind: "staff", role: "sales", userId: "verify-sales", name: "Verify" } as never
const customer = { kind: "customer", customerId: "verify-cust" } as never

async function setWrites(enabled: boolean) {
  await db.setting.upsert({
    where: { key: "agent.allowSettingWrites" },
    create: { key: "agent.allowSettingWrites", value: JSON.stringify(enabled), category: "agent" },
    update: { value: JSON.stringify(enabled) },
  })
  clearSettingsCache()
}

/** Call a tool's execute the way the runtime does. */
async function run(tools: Record<string, unknown>, name: string, args: unknown) {
  const tool = tools[name] as { execute: (a: unknown, o: unknown) => Promise<unknown> }
  return (await tool.execute(args, {} as never)) as { ok: boolean; error?: string }
}

async function main() {
  console.log("Agent settings tools — guard verification\n")

  // ------------------------------------------------------------- guard 2
  console.log("Guard 2: who gets the tools at all")
  check(Object.keys(buildSettingsTools(customer)).length === 0, "a customer gets no settings tools")
  check(Object.keys(buildSettingsTools(sales)).length === 0, "non-admin staff get no settings tools")

  const tools = buildSettingsTools(admin) as Record<string, unknown>
  check(
    ["listSettings", "getSetting", "proposeSettingChange", "resetSetting"].every((n) => n in tools),
    "an admin gets all four",
    Object.keys(tools).join(", ")
  )

  // ------------------------------------------------------------- guard 1
  console.log("\nGuard 1: the agent can never change its own limits")
  await setWrites(true) // deliberately permissive, to prove the refusal is not the flag

  for (const namespace of [
    "agent.thresholds",
    "agent.identity",
    "agent.allowSettingWrites",
    "AGENT.thresholds",
    "agent_thresholds",
  ]) {
    const result = await run(tools, "proposeSettingChange", {
      namespace,
      changes: { maxOrderValue: 999999 },
      reason: "verification",
    })
    check(result.ok === false, `refused "${namespace}"`, result.error?.slice(0, 52))
  }

  const readBack = await run(tools, "getSetting", { namespace: "agent.thresholds" })
  check(readBack.ok === false, "cannot even read its own thresholds through getSetting")

  const card = await describeSettingProposal({
    namespace: "agent.thresholds",
    changes: { maxOrderValue: 999999 },
  })
  check(card.startsWith("REFUSED"), "the approval card says REFUSED rather than inviting a yes", card)

  // Prove the ceiling really is untouched.
  const stored = await db.setting.findUnique({ where: { key: "agent.thresholds" } })
  check(stored === null, "no agent.thresholds row was written")

  // ------------------------------------------------------------- guard 3
  console.log("\nGuard 3: the card shows a real diff, and catches invalid changes early")

  const good = await describeSettingProposal({ namespace: "tax", changes: { defaultRate: 15 } })
  check(
    good.includes("→") && good.includes("15%"),
    "a valid change renders before → after",
    good
  )

  const invalid = await describeSettingProposal({ namespace: "tax", changes: { defaultRate: 150 } })
  check(
    invalid.includes("INVALID"),
    "an out-of-range change is marked invalid before anyone approves it",
    invalid
  )

  const noop = await describeSettingProposal({ namespace: "tax", changes: { roundingDp: 2 } })
  check(noop.includes("nothing would actually change"), "a no-op change says so", noop)

  const unknown = await describeSettingProposal({ namespace: "nonsense", changes: {} })
  check(unknown.includes("will be refused"), "an unknown area is flagged on the card", unknown)

  // The invalid change must also be refused at execute, not only on the card.
  const rejected = await run(tools, "proposeSettingChange", {
    namespace: "tax",
    changes: { defaultRate: 150 },
    reason: "verification",
  })
  check(rejected.ok === false, "and refused at execute too", rejected.error?.slice(0, 52))

  // ------------------------------------------------------------- guard 4
  console.log("\nGuard 4: writes are off unless a human turns them on")
  await setWrites(false)

  const blocked = await run(tools, "proposeSettingChange", {
    namespace: "tax",
    changes: { defaultRate: 12 },
    reason: "verification",
  })
  check(blocked.ok === false, "a valid change is refused while writes are off", blocked.error?.slice(0, 46))

  const blockedReset = await run(tools, "resetSetting", { namespace: "tax" })
  check(blockedReset.ok === false, "reset is refused too")

  // ------------------------------------------------------- the happy path
  console.log("\nWith writes enabled, a legitimate change applies")
  await setWrites(true)

  const applied = await run(tools, "proposeSettingChange", {
    namespace: "tax",
    changes: { defaultRate: 12 },
    reason: "verification run",
  })
  check(applied.ok === true, "the change was saved", applied.error)

  const after = await db.setting.findUnique({ where: { key: "tax" } })
  check(
    after !== null && JSON.parse(after.value).defaultRate === 12,
    "and is readable from the database"
  )

  const audit = await db.auditLog.findFirst({
    where: { entityType: "setting", entityId: "tax" },
    orderBy: { createdAt: "desc" },
  })
  check(audit !== null, "an audit row records who changed it")

  // ------------------------------------------------------------------ reset
  await db.setting.deleteMany({
    where: { key: { in: ["tax", "agent.allowSettingWrites"] } },
  })
  clearSettingsCache()
  console.log("\n   (test settings removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await db.setting
    .deleteMany({ where: { key: { in: ["tax", "agent.allowSettingWrites"] } } })
    .catch(() => {})
  await db.$disconnect()
  process.exit(1)
})
