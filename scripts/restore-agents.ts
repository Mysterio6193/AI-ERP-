/**
 * Put the agents back after a reseed.
 *
 * A reseed dropped every AgentDefinition, every channel identity and every
 * user, which left the scheduled ops agent gone and its runAsUserId pointing
 * at a user that no longer exists. The built-ins are recreated from
 * ensureSystemDefinitions, and the schedule is re-applied against a user that
 * is actually present.
 *
 *   bun scripts/restore-agents.ts
 */
import { db } from "../src/lib/db"
import { validateCron } from "../src/lib/cron"
import { ensureSystemDefinitions } from "../src/lib/agent/definitions"

const SCHEDULE = "0 7 * * 1-5"

const RUN_PROMPT = `Review the business since yesterday and report only what needs a person to decide today.

Check: invoices now overdue, stock at or below reorder level, orders sitting in pending_approval, deliveries that failed, and customers over their credit limit.

Rules:
- Report only items that need a decision. Skip anything routine or already in hand.
- Lead with the single most urgent item and say what you recommend.
- If nothing needs attention, reply with exactly: "Nothing needs attention."
- Never invent figures. Use the tools and quote what they return.`

async function main() {
  await ensureSystemDefinitions()

  const definitions = await db.agentDefinition.findMany({ select: { slug: true } })
  console.log(`  agent definitions: ${definitions.length} (${definitions.map((d) => d.slug).join(", ")})`)

  const admin = await db.user.findFirst({
    where: { role: "admin", status: "active" },
    select: { id: true, name: true, email: true },
  })

  if (!admin) {
    console.log("  No active admin — cannot set a run-as user.")
    await db.$disconnect()
    return
  }

  const ops = await db.agentDefinition.findFirst({ where: { slug: "ops" }, select: { id: true } })

  if (ops) {
    const check = validateCron(SCHEDULE)
    if (!check.ok) throw new Error(check.error)

    await db.agentDefinition.update({
      where: { id: ops.id },
      data: {
        trigger: "schedule",
        schedule: SCHEDULE,
        runPrompt: RUN_PROMPT,
        runAsUserId: admin.id,
        enabled: true,
        // Null so the scheduler sets the next fire time on first sighting and
        // waits, rather than firing the moment it is restored.
        nextRunAt: null,
      },
    })

    console.log(`  ops scheduled: ${SCHEDULE}, running as ${admin.name} <${admin.email}>`)
    console.log(`  next fire: ${check.next?.toISOString()}`)
  }

  // A dangling runAsUserId points at a deleted user, and the run fails with
  // "No staff user available to run as" long after the reseed is forgotten.
  const all = await db.agentDefinition.findMany({ select: { id: true, slug: true, runAsUserId: true } })
  const userIds = new Set((await db.user.findMany({ select: { id: true } })).map((u) => u.id))

  for (const a of all) {
    if (a.runAsUserId && !userIds.has(a.runAsUserId)) {
      await db.agentDefinition.update({ where: { id: a.id }, data: { runAsUserId: admin.id } })
      console.log(`  repaired dangling runAsUserId on ${a.slug}`)
    }
  }

  console.log(`\n  telegram links: ${await db.channelIdentity.count({ where: { status: "active" } })} (re-link from Settings → Agent)`)
  await db.$disconnect()
}

main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1) })
