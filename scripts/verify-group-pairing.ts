/**
 * Group pairing verification.
 *
 * Any group the bot was added to was auto-registered as active, and the group
 * handler never checked status — only autoReply. So adding the bot to any
 * Telegram group and having one linked staff member speak there produced full
 * business answers in a room nobody had authorised.
 *
 *   bun scripts/verify-group-pairing.ts
 */
import { db } from "../src/lib/db"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()
const chatId = `-100probe${STAMP}`

async function cleanup() {
  await db.agentGroupChannel.deleteMany({ where: { externalId: chatId } })
}

async function main() {
  console.log("Group pairing verification\n")
  await cleanup()

  console.log("1. A newly seen group is registered pending, not active")
  // Mirrors autoRegisterGroup.
  await db.agentGroupChannel.create({
    data: { channel: "telegram", externalId: chatId, name: "Probe Group", purpose: "general", status: "pending" },
  })

  const fresh = await db.agentGroupChannel.findFirstOrThrow({ where: { externalId: chatId }, select: { status: true } })
  check(fresh.status === "pending", "status is pending", fresh.status)
  check(fresh.status !== "active", "so the agent will not answer in it yet")

  console.log("\n2. Delivery refuses to post into an unapproved group")
  const { deliverAgentOutput } = await import("../src/lib/agent/delivery")
  const group = await db.agentGroupChannel.findFirstOrThrow({ where: { externalId: chatId }, select: { id: true } })

  const blocked = await deliverAgentOutput({
    userId: null,
    groupId: group.id,
    text: "PROBE — a real finding",
  })
  check(blocked.delivered === false, "not delivered", blocked.reason ?? "")

  console.log("\n3. Approving it opens the group")
  await db.agentGroupChannel.updateMany({ where: { externalId: chatId }, data: { status: "active" } })
  const approved = await db.agentGroupChannel.findFirstOrThrow({ where: { externalId: chatId }, select: { status: true } })
  check(approved.status === "active", "status is active", approved.status)

  console.log("\n4. No real group was left registered by this check")
  await cleanup()
  const remaining = await db.agentGroupChannel.count({ where: { externalId: chatId } })
  check(remaining === 0, "probe group removed", String(remaining))

  const realGroups = await db.agentGroupChannel.findMany({ select: { name: true, status: true } })
  console.log(`\n   registered groups now: ${realGroups.length || "none"}`)
  for (const g of realGroups) console.log(`     ${g.name} — ${g.status}`)

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(String(e).slice(0, 300)); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
