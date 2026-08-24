/**
 * Scheduled delivery verification.
 *
 * runScheduledAgent produced its report and delivered it nowhere — the text
 * went into the cron endpoint's JSON response, which nothing reads. A briefing
 * that runs every weekday morning and reaches no one is the same shape as a
 * discount engine with no callers: it works, and it does not matter.
 *
 *   bun scripts/verify-agent-delivery.ts
 */
import { db } from "../src/lib/db"
import { deliverAgentOutput, isWorthSending } from "../src/lib/agent/delivery"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const madeLogs: string[] = []

async function cleanup() {
  await db.communicationLog.deleteMany({ where: { id: { in: madeLogs } } })
  await db.communicationLog.deleteMany({ where: { subject: { startsWith: "PROBE agent report" } } })
}

async function main() {
  console.log("Scheduled delivery verification\n")

  const ops = await db.agentDefinition.findFirstOrThrow({
    where: { slug: "ops" },
    select: { runAsUserId: true, trigger: true, schedule: true, runPrompt: true },
  })

  console.log("1. The scheduled agent is actually configured to run")
  check(ops.trigger === "schedule", "trigger is schedule", ops.trigger)
  check(Boolean(ops.schedule), "has a cron expression", ops.schedule ?? "—")
  check(Boolean(ops.runPrompt), "has something to do")
  check(Boolean(ops.runAsUserId), "has a user to act as")

  console.log("\n2. A quiet day sends nothing")
  const quiet = await deliverAgentOutput({
    userId: ops.runAsUserId,
    text: "Nothing needs attention.",
    subject: "PROBE agent report",
  })
  check(quiet.delivered === false, "not delivered", quiet.reason ?? "")
  check(quiet.reason === "Nothing worth reporting", "for the right reason", quiet.reason ?? "")
  console.log("     Silence on a normal day is the success condition.")

  console.log("\n3. A real finding is delivered, and says where")
  const real = await deliverAgentOutput({
    userId: ops.runAsUserId,
    text: "PROBE — ignore. 2 invoices went overdue overnight.",
    subject: "PROBE agent report",
  })
  check(real.delivered === true, "delivered", real.channel ?? real.reason ?? "")
  check(real.channel === "telegram", "over Telegram, where staff already are", real.channel ?? "—")

  console.log("\n4. With no channel and no email, it reports the failure rather than pretending")
  const orphan = await deliverAgentOutput({ userId: null, text: "Something urgent" })
  check(orphan.delivered === false, "not delivered", orphan.reason ?? "")

  console.log("\n5. The all-clear phrase and the run prompt agree")
  const promptAsksFor = (ops.runPrompt || "").toLowerCase().includes("nothing needs attention")
  check(promptAsksFor, "the prompt asks for the exact phrase delivery checks for")
  check(!isWorthSending("Nothing needs attention."), "and that phrase is treated as silence")

  await cleanup()
  console.log("\n   (probe logs removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(String(e).slice(0, 400)); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
