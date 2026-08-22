/**
 * Agent identity verification.
 *
 * The identity has been stored since it was written and nothing surfaced it.
 * What matters is not that a name saves, but that it reaches the model's
 * instructions, the User row that attributes autonomous work, and outbound copy.
 *
 *   npx tsx scripts/verify-agent-identity.ts
 */
import { PrismaClient } from "@prisma/client"
import { ensureAgentUser, formatIdentity, getAgentIdentity, saveAgentIdentity, signOutbound } from "../src/lib/agent/identity"

const db = new PrismaClient()
let failures = 0
const check = (ok: boolean, label: string, detail?: string) => {
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`)
}

async function main() {
  console.log("Agent identity verification\n")
  const original = await getAgentIdentity()

  console.log("1. Naming it changes what the model is told")
  const before = formatIdentity(await getAgentIdentity())
  await saveAgentIdentity({ name: "Friday", signature: "Friday" })
  const after = formatIdentity(await getAgentIdentity())

  check(!before.includes("Your name is Friday"), "the name was not there before")
  check(after.includes("Your name is Friday"), "and is now in the prompt block")

  console.log("\n2. Attribution follows the name")
  const user = await ensureAgentUser()
  check(user.name === "Friday", "the agent's User row was renamed", user.name)
  check(user.role === "agent", "still the agent role, so audit trails resolve", user.role)

  console.log("\n3. Outbound copy always discloses")
  const signed = await signOutbound("Your order is on the truck.")
  check(signed.includes("Friday"), "signed with the name")
  check(signed.includes(original.disclosure), "and carries the disclosure line")

  console.log("\n4. The no-impersonation rule is stated, not implied")
  check(after.includes("not a person"), "the prompt says it is not a person")
  check(after.includes("say plainly that you are not"), "and what to do when asked directly")

  console.log("\n5. Renaming again does not create a second agent user")
  await saveAgentIdentity({ name: "Nova", signature: "Nova" })
  const agents = await db.user.count({ where: { role: "agent" } })
  check(agents === 1, "exactly one agent user exists", `${agents}`)
  const renamed = await ensureAgentUser()
  check(renamed.name === "Nova", "and it carries the newest name", renamed.name)

  // ---------------------------------------------------------------- restore
  await saveAgentIdentity(original)
  await db.setting.deleteMany({ where: { key: "agent.identity" } })
  console.log(`\n   (identity restored to "${original.name}")`)

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
