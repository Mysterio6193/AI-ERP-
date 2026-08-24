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

/**
 * What each agent watches, and when.
 *
 * Staggered rather than all at 7am: each run costs model tokens and they read
 * overlapping data, so firing them together wastes both. Every prompt ends the
 * same way — say nothing on a normal day. A briefing that arrives daily saying
 * "all fine" trains people to stop reading it, and then the one that matters
 * is missed too.
 *
 * Only the four with genuine daily or weekly value are scheduled. The rest are
 * installed and answer when asked, which is what they are for.
 */
const QUIET_RULE = `
Rules:
- Report only what needs a person to decide today. Skip anything routine or already in hand.
- Lead with the single most urgent item and say what you recommend.
- If nothing needs attention, reply with exactly: "Nothing needs attention."
- Never invent figures. Use the tools and quote what they return.`

const SCHEDULED: Array<{ slug: string; schedule: string; prompt: string; why: string }> = [
  {
    slug: "ops",
    schedule: "0 7 * * 1-5",
    why: "weekday mornings, 7am — the overall sweep",
    prompt: `Review the business since yesterday.

Check: invoices now overdue, stock at or below reorder level, orders sitting in pending_approval, deliveries that failed, and customers over their credit limit.${QUIET_RULE}`,
  },
  {
    slug: "warehouse",
    schedule: "15 6 * * 1-6",
    why: "6.15am Mon-Sat, before picking starts",
    prompt: `Check the warehouse before the day starts.

Look at: stock at or below reorder level, batches expiring within 7 days, batches held or quarantined, and pick lists still open from yesterday.

Expiry is the one that costs money quietly — flag anything short-dated with enough notice to sell or use it.${QUIET_RULE}`,
  },
  {
    slug: "accounts",
    schedule: "30 8 * * 1-5",
    why: "8.30am weekdays, when someone can act on it",
    prompt: `Check what is owed and what is at risk.

Look at: invoices that became overdue since yesterday, customers over their credit limit or on hold, payments received but not allocated, and anything in the oldest ageing bucket.

Name the customer and the amount. Say who to chase first and why.${QUIET_RULE}`,
  },
  {
    slug: "purchasing",
    schedule: "0 9 * * 1",
    why: "Monday 9am — a weekly buying decision, not a daily one",
    prompt: `Plan this week's buying.

Look at: products at or below reorder level, what is already on order and when it lands, and the preferred supplier for each along with its lead time and minimum order quantity.

Group by supplier so one order covers several lines. Say what would run out before a replacement arrives.${QUIET_RULE}`,
  },
]

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

  for (const entry of SCHEDULED) {
    const definition = await db.agentDefinition.findFirst({
      where: { slug: entry.slug },
      select: { id: true },
    })

    if (!definition) {
      console.log(`  ${entry.slug.padEnd(11)} not installed — skipped`)
      continue
    }

    const check = validateCron(entry.schedule)
    if (!check.ok) throw new Error(`${entry.slug}: ${check.error}`)

    await db.agentDefinition.update({
      where: { id: definition.id },
      data: {
        trigger: "schedule",
        schedule: entry.schedule,
        runPrompt: entry.prompt,
        runAsUserId: admin.id,
        enabled: true,
        // Null so the scheduler sets the next fire time on first sighting and
        // waits, rather than firing the moment it is restored.
        nextRunAt: null,
      },
    })

    console.log(`  ${entry.slug.padEnd(11)} ${entry.schedule.padEnd(13)} ${entry.why}`)
  }

  console.log(`\n  all scheduled runs act as ${admin.name} <${admin.email}>`)

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
