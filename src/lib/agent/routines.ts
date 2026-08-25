import { db } from "@/lib/db"
import { validateCron, nextRun } from "@/lib/cron"

/**
 * Turning "run this every week" into something that actually runs every week.
 *
 * Scheduling existed and was unreachable from a conversation: the scheduler
 * runs agents whose `trigger` is "schedule" and which carry a cron expression
 * and a run prompt, and the only way to set those was to edit a definition by
 * hand. `createRecurringReport` claimed to set up a recurring report and wrote
 * an AgentSkill — it never touched AgentDefinition, so nothing recurred and the
 * agent said it had.
 *
 * A routine is a scheduled agent with a prompt. Nothing new is needed to run
 * one; what was missing was a way to ask for one.
 */

/** Plain-language schedules, so nobody has to write cron to get a routine. */
export const SCHEDULE_PRESETS: Record<string, { cron: string; describes: string }> = {
  hourly: { cron: "0 * * * *", describes: "every hour, on the hour" },
  daily: { cron: "0 7 * * *", describes: "every day at 7am" },
  weekdays: { cron: "0 7 * * 1-5", describes: "weekday mornings at 7am" },
  weekly: { cron: "0 9 * * 1", describes: "Monday mornings at 9am" },
  fortnightly: { cron: "0 9 1,15 * *", describes: "the 1st and 15th at 9am" },
  monthly: { cron: "0 9 1 * *", describes: "the 1st of the month at 9am" },
  end_of_month: { cron: "0 17 28-31 * *", describes: "the last days of the month at 5pm" },
}

export type SchedulePreset = keyof typeof SCHEDULE_PRESETS

export interface RoutineInput {
  /** What it is called, used as the slug and shown in settings. */
  name: string
  /** What the agent should do each time, in its own words. */
  instruction: string
  /** A preset, or a raw cron expression for anything unusual. */
  schedule: string
  /** Which persona runs it — its tools and limits apply. */
  persona?: string
  /** Whose permissions it acts with. */
  runAsUserId: string
  /** A group channel to report into, rather than a private message. */
  deliverToGroupId?: string | null
}

export type RoutineResult =
  | { ok: false; error: string }
  | {
      ok: true
      slug: string
      name: string
      cron: string
      describes: string
      nextRunAt: Date | null
      created: boolean
    }

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

/** Every prompt ends the same way, so a routine that finds nothing says nothing. */
const QUIET_RULE = `

Rules:
- Report only what needs a person to decide. Skip anything routine or already in hand.
- If nothing needs attention, reply with exactly: "Nothing needs attention."
- Never invent figures. Use the tools and quote what they return.`

export async function createRoutine(input: RoutineInput): Promise<RoutineResult> {
  const name = input.name.trim()
  const instruction = input.instruction.trim()

  if (!name) return { ok: false, error: "A routine needs a name." }

  if (!instruction) {
    // A schedule with nothing to do fires forever and achieves nothing.
    return { ok: false, error: "A routine needs to say what to do each time it runs." }
  }

  const preset = SCHEDULE_PRESETS[input.schedule]
  const cron = preset?.cron ?? input.schedule

  const check = validateCron(cron)
  if (!check.ok) {
    return {
      ok: false,
      error: `${check.error} Use one of: ${Object.keys(SCHEDULE_PRESETS).join(", ")}, or a five-field cron expression.`,
    }
  }

  const runner = await db.user.findUnique({
    where: { id: input.runAsUserId },
    select: { id: true, status: true },
  })

  if (!runner || runner.status !== "active") {
    // The run would fail later with "no staff user available", long after
    // anyone connects it to this.
    return { ok: false, error: "The user this routine would run as is not an active staff member." }
  }

  const slug = slugify(name)
  if (!slug) return { ok: false, error: "That name has no letters or numbers to make a slug from." }

  const existing = await db.agentDefinition.findFirst({ where: { slug }, select: { id: true, isSystem: true } })

  if (existing?.isSystem) {
    // Overwriting a built-in persona's prompt would silently change what the
    // ops or accounts agent does everywhere else.
    return { ok: false, error: `"${name}" is a built-in agent. Choose a different name for the routine.` }
  }

  const data = {
    name,
    trigger: "schedule",
    schedule: cron,
    runPrompt: `${instruction}${QUIET_RULE}`,
    runAsUserId: runner.id,
    enabled: true,
    deliverToGroupId: input.deliverToGroupId ?? null,
    // Left null so the scheduler sets the fire time on first sighting and
    // waits, rather than running the moment it is created.
    nextRunAt: null,
  }

  if (existing) {
    await db.agentDefinition.update({ where: { id: existing.id }, data })
  } else {
    const base = await db.agentDefinition.findFirst({
      where: { slug: input.persona ?? "ops" },
      select: { instructions: true, toolsJson: true, audience: true, model: true, maxSteps: true },
    })

    await db.agentDefinition.create({
      data: {
        ...data,
        slug,
        description: `Routine: ${instruction.slice(0, 120)}`,
        avatar: "🔁",
        // Inherits the persona's instructions and tool allowlist, so a routine
        // is as capable and as limited as the agent it is based on.
        instructions: base?.instructions ?? "",
        toolsJson: base?.toolsJson ?? null,
        audience: base?.audience ?? "staff",
        model: base?.model ?? null,
        maxSteps: base?.maxSteps ?? 12,
        isSystem: false,
      },
    })
  }

  return {
    ok: true,
    slug,
    name,
    cron,
    describes: preset?.describes ?? `on the schedule ${cron}`,
    nextRunAt: nextRun(cron) ?? null,
    created: !existing,
  }
}

export interface RoutineSummary {
  slug: string
  name: string
  schedule: string
  enabled: boolean
  nextRunAt: Date | null
  lastRunAt: Date | null
  lastRunStatus: string | null
  isSystem: boolean
}

export async function listRoutines(): Promise<RoutineSummary[]> {
  const rows = await db.agentDefinition.findMany({
    where: { trigger: "schedule" },
    orderBy: { nextRunAt: "asc" },
    select: {
      slug: true, name: true, schedule: true, enabled: true,
      nextRunAt: true, lastRunAt: true, lastRunStatus: true, isSystem: true,
    },
  })

  return rows.map((r) => ({ ...r, schedule: r.schedule ?? "" }))
}

/**
 * Stop a routine without destroying it.
 *
 * Disabling is almost always what someone means by "stop doing that" — the
 * prompt and its history are worth keeping, and a routine deleted by mistake
 * has to be described from memory to get it back.
 */
export async function stopRoutine(slug: string): Promise<{ ok: boolean; error?: string }> {
  const definition = await db.agentDefinition.findFirst({
    where: { slug },
    select: { id: true, isSystem: true, trigger: true },
  })

  if (!definition) return { ok: false, error: `No routine named "${slug}".` }

  if (definition.trigger !== "schedule") {
    return { ok: false, error: `"${slug}" is not a scheduled routine.` }
  }

  await db.agentDefinition.update({
    where: { id: definition.id },
    data: { enabled: false, nextRunAt: null },
  })

  return { ok: true }
}
