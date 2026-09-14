import type { SettingsOf } from "@/lib/settings/registry"

/**
 * Routing maths.
 *
 * Everything here is pure: given the steps, a quantity and the settings, work
 * out how long a run takes, how much must enter each step, and what the time
 * costs. No database, so the awkward cases — compounding scrap, a step with no
 * work centre, an efficiency of 40% — are cheap to test.
 *
 * Two ideas do most of the work:
 *
 *   - Setup is paid once per run, run time is paid per unit. That single split
 *     is why a 10-unit batch and a 1000-unit batch have very different unit
 *     costs, and why asking for the lead time of "one" is misleading.
 *   - Scrap compounds backwards. If packing loses 5% and packing must yield
 *     100, packing must be fed 105.3, and mixing must be fed more than that
 *     again. Applying the order quantity at every step quietly under-buys
 *     materials for anything with real losses.
 */

export type ManufacturingSettings = SettingsOf<"manufacturing">

export interface RoutingStep {
  sequence: number
  name: string
  workCenterId?: string | null
  /** Null means "use the settings default", not "zero". */
  setupMinutes?: number | null
  runMinutesPerUnit?: number | null
  queueMinutes?: number | null
  moveMinutes?: number | null
  scrapPercent?: number | null
}

export interface WorkCenterCapacity {
  id: string
  code: string
  name: string
  /** Null inherits the settings default. */
  minutesPerDay?: number | null
  parallelCapacity?: number | null
  efficiencyPercent?: number | null
  costPerHour?: number | null
  setupMinutes?: number | null
}

export interface ScheduledStep {
  sequence: number
  name: string
  workCenterId: string | null
  workCenter: string | null
  /** Units that must enter this step for the run to finish its target. */
  inputQty: number
  /** Units this step is expected to pass on, after its own scrap. */
  outputQty: number
  scrapQty: number
  setupMinutes: number
  runMinutes: number
  queueMinutes: number
  moveMinutes: number
  /** Setup + run, after the work centre's efficiency. The time that occupies
   *  the machine, and the basis for both capacity and labour cost. */
  workMinutes: number
  /** Work + queue + move. What the calendar actually loses to this step. */
  elapsedMinutes: number
  laborCost: number
}

export interface RoutingSchedule {
  steps: ScheduledStep[]
  /** Machine time across every step. Drives capacity, not the promised date. */
  totalWorkMinutes: number
  /** Wall-clock time from starting step one to finishing the last. */
  totalElapsedMinutes: number
  totalLaborCost: number
  /** What must be started to finish `targetQty` — more than the target when
   *  any step scraps. */
  requiredInputQty: number
  /** Working days the run occupies, at the configured day length. */
  leadTimeDays: number
}

function round(value: number, places: number) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * Resolves a step's timings against its work centre and the company defaults.
 *
 * The precedence is the same everywhere: what the step says, else what the work
 * centre says, else what settings say. A step that means "no setup" stores 0,
 * which is different from storing null and inheriting.
 */
function resolve(
  step: RoutingStep,
  center: WorkCenterCapacity | undefined,
  settings: ManufacturingSettings
) {
  const setupMinutes =
    step.setupMinutes ?? center?.setupMinutes ?? settings.defaultSetupMinutes
  const efficiency =
    center?.efficiencyPercent ?? settings.defaultEfficiencyPercent

  return {
    setupMinutes,
    runMinutesPerUnit: step.runMinutesPerUnit ?? 0,
    queueMinutes: step.queueMinutes ?? settings.defaultQueueMinutes,
    moveMinutes: step.moveMinutes ?? settings.defaultMoveMinutes,
    scrapPercent: step.scrapPercent ?? 0,
    // Guard against a zero or negative efficiency turning into a division by
    // zero and reporting an infinite schedule.
    efficiency: efficiency > 0 ? efficiency : 100,
    costPerHour: center?.costPerHour ?? 0,
  }
}

/**
 * Schedules a routing for a quantity.
 *
 * Steps are processed last-to-first to size the quantities — each step must be
 * fed enough to cover its own scrap plus whatever the next step needs — then
 * first-to-last to accumulate time.
 */
export function scheduleRouting(
  steps: RoutingStep[],
  targetQty: number,
  settings: ManufacturingSettings,
  workCenters: WorkCenterCapacity[] = []
): RoutingSchedule {
  const dp = settings.roundMinutesTo
  const byId = new Map(workCenters.map((center) => [center.id, center]))
  const ordered = [...steps].sort((a, b) => a.sequence - b.sequence)

  if (!ordered.length || targetQty <= 0) {
    return {
      steps: [],
      totalWorkMinutes: 0,
      totalElapsedMinutes: 0,
      totalLaborCost: 0,
      requiredInputQty: Math.max(targetQty, 0),
      leadTimeDays: 0,
    }
  }

  // Backwards pass: how many units each step must take in.
  const inputQty = new Array<number>(ordered.length)
  let needed = targetQty

  for (let i = ordered.length - 1; i >= 0; i--) {
    const { scrapPercent } = resolve(ordered[i], byId.get(ordered[i].workCenterId ?? ""), settings)

    if (settings.compoundScrapThroughRouting && scrapPercent > 0 && scrapPercent < 100) {
      needed = needed / (1 - scrapPercent / 100)
    }

    inputQty[i] = needed
  }

  // Forwards pass: time and money.
  const scheduled: ScheduledStep[] = ordered.map((step, i) => {
    const center = byId.get(step.workCenterId ?? "")
    const r = resolve(step, center, settings)

    const input = inputQty[i]
    const scrapQty = r.scrapPercent > 0 ? input * (r.scrapPercent / 100) : 0
    const output = input - scrapQty

    const rawRun = r.runMinutesPerUnit * input
    // Efficiency stretches the time actually spent, it does not change the
    // standard. A centre running at 80% takes 125% of standard.
    const workMinutes = (r.setupMinutes + rawRun) * (100 / r.efficiency)
    const elapsed = workMinutes + r.queueMinutes + r.moveMinutes

    return {
      sequence: step.sequence,
      name: step.name,
      workCenterId: step.workCenterId ?? null,
      workCenter: center?.name ?? null,
      inputQty: round(input, 4),
      outputQty: round(output, 4),
      scrapQty: round(scrapQty, 4),
      setupMinutes: r.setupMinutes,
      runMinutes: round(rawRun, dp),
      queueMinutes: r.queueMinutes,
      moveMinutes: r.moveMinutes,
      workMinutes: round(workMinutes, dp),
      elapsedMinutes: round(elapsed, dp),
      laborCost: round((workMinutes / 60) * r.costPerHour, 2),
    }
  })

  const totalWork = scheduled.reduce((sum, step) => sum + step.workMinutes, 0)
  const totalElapsed = scheduled.reduce((sum, step) => sum + step.elapsedMinutes, 0)

  return {
    steps: scheduled,
    totalWorkMinutes: round(totalWork, dp),
    totalElapsedMinutes: round(totalElapsed, dp),
    totalLaborCost: round(scheduled.reduce((sum, step) => sum + step.laborCost, 0), 2),
    requiredInputQty: round(inputQty[0], 4),
    leadTimeDays: round(totalElapsed / settings.defaultMinutesPerDay, 2),
  }
}

export interface LoadedOperation {
  workCenterId: string | null
  scheduledStart: Date | null
  plannedSetupMinutes: number
  plannedRunMinutes: number
}

export interface WorkCenterLoad {
  workCenterId: string
  code: string
  name: string
  /** Minutes of work booked onto this centre inside the horizon. */
  bookedMinutes: number
  /** Minutes it can actually supply over the same horizon. */
  availableMinutes: number
  utilisationPercent: number
  overloaded: boolean
  operationCount: number
}

/**
 * Utilisation per work centre over a horizon.
 *
 * Capacity is `minutes per day x parallel units x days`. Operations with no
 * scheduled start are still counted — work that exists but has not been given
 * a date is exactly the work a capacity check is supposed to surface, and
 * dropping it would report a comfortable plant that is actually full.
 */
export function computeWorkCenterLoad(
  centers: WorkCenterCapacity[],
  operations: LoadedOperation[],
  settings: ManufacturingSettings,
  horizonDays = settings.capacityHorizonDays
): WorkCenterLoad[] {
  const dp = settings.roundMinutesTo

  return centers.map((center) => {
    const mine = operations.filter((op) => op.workCenterId === center.id)
    const booked = mine.reduce(
      (sum, op) => sum + op.plannedSetupMinutes + op.plannedRunMinutes,
      0
    )

    const minutesPerDay = center.minutesPerDay ?? settings.defaultMinutesPerDay
    const parallel = Math.max(center.parallelCapacity ?? 1, 1)
    const available = minutesPerDay * parallel * horizonDays

    const utilisation = available > 0 ? (booked / available) * 100 : 0

    return {
      workCenterId: center.id,
      code: center.code,
      name: center.name,
      bookedMinutes: round(booked, dp),
      availableMinutes: available,
      utilisationPercent: round(utilisation, 1),
      overloaded: utilisation > settings.overloadThresholdPercent,
      operationCount: mine.length,
    }
  })
}

/**
 * Turns a recipe's routing into the operations stored against one run.
 *
 * Copied rather than referenced, so editing the recipe later does not rewrite
 * what a finished run was made to.
 */
export function materialiseOperations(
  schedule: RoutingSchedule,
  settings: ManufacturingSettings
) {
  return schedule.steps.map((step, index) => ({
    sequence: step.sequence || (index + 1) * settings.sequenceStep,
    name: step.name,
    workCenterId: step.workCenterId,
    plannedSetupMinutes: step.setupMinutes,
    plannedRunMinutes: step.runMinutes,
    laborCost: settings.includeLaborInUnitCost ? step.laborCost : 0,
    status: "pending" as const,
  }))
}
