import { describe, expect, it } from "vitest"

import { defaultsFor } from "@/lib/settings/registry"

import {
  computeWorkCenterLoad,
  materialiseOperations,
  scheduleRouting,
  type RoutingStep,
  type WorkCenterCapacity,
} from "./routing"

const settings = defaultsFor("manufacturing")

const mixer: WorkCenterCapacity = {
  id: "wc-mix",
  code: "MIX-01",
  name: "Mixer 1",
  minutesPerDay: 480,
  parallelCapacity: 1,
  efficiencyPercent: 100,
  costPerHour: 60,
  setupMinutes: 0,
}

const oven: WorkCenterCapacity = {
  id: "wc-oven",
  code: "OVEN-1",
  name: "Oven 1",
  minutesPerDay: 960,
  parallelCapacity: 2,
  efficiencyPercent: 80,
  costPerHour: 120,
  setupMinutes: 15,
}

describe("scheduleRouting", () => {
  it("pays setup once and run time per unit", () => {
    const steps: RoutingStep[] = [
      { sequence: 10, name: "Mix", workCenterId: "wc-mix", setupMinutes: 30, runMinutesPerUnit: 2 },
    ]

    const ten = scheduleRouting(steps, 10, settings, [mixer])
    const hundred = scheduleRouting(steps, 100, settings, [mixer])

    expect(ten.totalWorkMinutes).toBe(50) // 30 setup + 10 x 2
    expect(hundred.totalWorkMinutes).toBe(230) // 30 setup + 100 x 2

    // The point of the split: setup per unit falls away with batch size.
    expect(ten.totalWorkMinutes / 10).toBe(5)
    expect(hundred.totalWorkMinutes / 100).toBe(2.3)
  })

  it("compounds scrap backwards so earlier steps are fed enough", () => {
    const steps: RoutingStep[] = [
      { sequence: 10, name: "Mix", runMinutesPerUnit: 1, scrapPercent: 10 },
      { sequence: 20, name: "Pack", runMinutesPerUnit: 1, scrapPercent: 5 },
    ]

    const result = scheduleRouting(steps, 100, settings, [])

    // Pack must yield 100 after losing 5%, so it takes in 100/0.95.
    expect(result.steps[1].inputQty).toBeCloseTo(105.2632, 3)
    // Mix must yield that after losing 10%.
    expect(result.steps[0].inputQty).toBeCloseTo(116.9591, 3)
    expect(result.requiredInputQty).toBeCloseTo(116.9591, 3)

    // Starting only 100 would finish short — that is the bug this prevents.
    expect(result.requiredInputQty).toBeGreaterThan(100)
  })

  it("treats the order quantity as the input at every step when compounding is off", () => {
    const steps: RoutingStep[] = [
      { sequence: 10, name: "Mix", runMinutesPerUnit: 1, scrapPercent: 10 },
      { sequence: 20, name: "Pack", runMinutesPerUnit: 1, scrapPercent: 5 },
    ]

    const result = scheduleRouting(steps, 100, { ...settings, compoundScrapThroughRouting: false }, [])

    expect(result.steps[0].inputQty).toBe(100)
    expect(result.steps[1].inputQty).toBe(100)
    expect(result.requiredInputQty).toBe(100)
  })

  it("stretches time for a work centre that runs below standard", () => {
    const steps: RoutingStep[] = [
      { sequence: 10, name: "Bake", workCenterId: "wc-oven", setupMinutes: 0, runMinutesPerUnit: 1 },
    ]

    const result = scheduleRouting(steps, 80, settings, [oven])

    // 80 standard minutes at 80% efficiency is 100 real minutes.
    expect(result.steps[0].runMinutes).toBe(80)
    expect(result.steps[0].workMinutes).toBe(100)
  })

  it("never reports an infinite schedule for a nonsensical efficiency", () => {
    const broken: WorkCenterCapacity = { ...oven, id: "wc-dead", efficiencyPercent: 0 }
    const steps: RoutingStep[] = [
      { sequence: 10, name: "Bake", workCenterId: "wc-dead", runMinutesPerUnit: 1 },
    ]

    const result = scheduleRouting(steps, 10, settings, [broken])

    expect(Number.isFinite(result.totalWorkMinutes)).toBe(true)
    // Falls back to 100% efficiency: the oven's inherited 15min setup + 10 run.
    expect(result.totalWorkMinutes).toBe(25)
  })

  it("separates machine time from wall-clock time", () => {
    const steps: RoutingStep[] = [
      { sequence: 10, name: "Mix", workCenterId: "wc-mix", setupMinutes: 0, runMinutesPerUnit: 1, queueMinutes: 60, moveMinutes: 15 },
    ]

    const result = scheduleRouting(steps, 60, settings, [mixer])

    expect(result.totalWorkMinutes).toBe(60)
    // Queue and move are lead time but occupy no machine.
    expect(result.totalElapsedMinutes).toBe(135)
  })

  it("falls back through step, work centre, then settings for setup", () => {
    const withDefaults = { ...settings, defaultSetupMinutes: 7 }

    // Step states its own.
    expect(
      scheduleRouting([{ sequence: 10, name: "A", workCenterId: "wc-oven", setupMinutes: 3 }], 1, withDefaults, [oven])
        .steps[0].setupMinutes
    ).toBe(3)

    // Step says nothing, work centre does.
    expect(
      scheduleRouting([{ sequence: 10, name: "A", workCenterId: "wc-oven" }], 1, withDefaults, [oven])
        .steps[0].setupMinutes
    ).toBe(15)

    // Neither says anything.
    expect(
      scheduleRouting([{ sequence: 10, name: "A" }], 1, withDefaults, []).steps[0].setupMinutes
    ).toBe(7)
  })

  it("distinguishes an explicit zero from an inherited default", () => {
    const withDefaults = { ...settings, defaultSetupMinutes: 7 }

    expect(
      scheduleRouting([{ sequence: 10, name: "A", setupMinutes: 0 }], 1, withDefaults, []).steps[0].setupMinutes
    ).toBe(0)
  })

  it("inherits through null, the shape a stored step actually has", () => {
    // Persisted rows come back as null, not undefined. Storing 0 for an
    // unstated field reads back as a deliberate zero and silently defeats the
    // work centre's figure — which is exactly the bug this guards.
    const stored = {
      sequence: 10,
      name: "Bake",
      workCenterId: "wc-oven",
      setupMinutes: null,
      queueMinutes: null,
      moveMinutes: null,
      runMinutesPerUnit: 1,
      scrapPercent: 0,
    }

    const step = scheduleRouting([stored], 10, settings, [oven]).steps[0]

    expect(step.setupMinutes).toBe(15) // the oven's, not zero
    expect(step.workMinutes).toBe(31.3) // (15 + 10) / 0.8
  })

  it("costs labour at the work centre rate, on real minutes not standard", () => {
    const steps: RoutingStep[] = [
      { sequence: 10, name: "Bake", workCenterId: "wc-oven", setupMinutes: 0, runMinutesPerUnit: 1 },
    ]

    const result = scheduleRouting(steps, 48, settings, [oven])

    // 48 standard / 0.8 = 60 real minutes, at $120/hr.
    expect(result.steps[0].workMinutes).toBe(60)
    expect(result.totalLaborCost).toBe(120)
  })

  it("orders steps by sequence regardless of input order", () => {
    const steps: RoutingStep[] = [
      { sequence: 20, name: "Pack" },
      { sequence: 10, name: "Mix" },
    ]

    expect(scheduleRouting(steps, 1, settings, []).steps.map((s) => s.name)).toEqual(["Mix", "Pack"])
  })

  it("returns an empty schedule rather than throwing on no steps or no quantity", () => {
    expect(scheduleRouting([], 100, settings, []).totalWorkMinutes).toBe(0)
    expect(scheduleRouting([{ sequence: 10, name: "Mix" }], 0, settings, []).steps).toEqual([])
  })
})

describe("computeWorkCenterLoad", () => {
  const ops = [
    { workCenterId: "wc-mix", scheduledStart: new Date(), plannedSetupMinutes: 30, plannedRunMinutes: 200 },
    { workCenterId: "wc-mix", scheduledStart: null, plannedSetupMinutes: 30, plannedRunMinutes: 100 },
    { workCenterId: "wc-oven", scheduledStart: new Date(), plannedSetupMinutes: 15, plannedRunMinutes: 60 },
  ]

  it("counts parallel units as capacity", () => {
    const load = computeWorkCenterLoad([mixer, oven], ops, settings, 1)

    expect(load[0].availableMinutes).toBe(480) // 480 x 1 x 1 day
    expect(load[1].availableMinutes).toBe(1920) // 960 x 2 x 1 day
  })

  it("counts unscheduled work, because that is the work a capacity check is for", () => {
    const load = computeWorkCenterLoad([mixer], ops, settings, 1)

    expect(load[0].operationCount).toBe(2)
    expect(load[0].bookedMinutes).toBe(360) // both mixer operations
  })

  it("flags a centre over the configured threshold", () => {
    const tight = computeWorkCenterLoad([{ ...mixer, minutesPerDay: 300 }], ops, settings, 1)
    expect(tight[0].utilisationPercent).toBe(120)
    expect(tight[0].overloaded).toBe(true)

    // The threshold itself is configurable, so a plant that runs hot can say so.
    const tolerant = computeWorkCenterLoad(
      [{ ...mixer, minutesPerDay: 300 }],
      ops,
      { ...settings, overloadThresholdPercent: 150 },
      1
    )
    expect(tolerant[0].overloaded).toBe(false)
  })

  it("inherits the settings day length when a centre sets none", () => {
    const load = computeWorkCenterLoad(
      [{ ...mixer, minutesPerDay: null }],
      ops,
      { ...settings, defaultMinutesPerDay: 600 },
      1
    )

    expect(load[0].availableMinutes).toBe(600)
  })
})

describe("materialiseOperations", () => {
  it("records what the work cost regardless of whether it will be costed", () => {
    const steps: RoutingStep[] = [
      { sequence: 10, name: "Bake", workCenterId: "wc-oven", setupMinutes: 0, runMinutesPerUnit: 1 },
    ]

    const schedule = scheduleRouting(steps, 48, settings, [oven])

    // Minutes at the centre's rate is a fact; whether it lands in the unit cost
    // is a policy applied at completion. Storing 0 under the off setting would
    // leave every run already in flight valued as though the work were free.
    expect(materialiseOperations(schedule, settings)[0].laborCost).toBe(120)
    expect(
      materialiseOperations(schedule, { ...settings, includeLaborInUnitCost: true })[0].laborCost
    ).toBe(120)
  })

  it("numbers steps from the configured gap when a routing gives none", () => {
    const schedule = scheduleRouting(
      [{ sequence: 0, name: "Mix" }, { sequence: 0, name: "Pack" }],
      1,
      settings,
      []
    )

    const rows = materialiseOperations(schedule, { ...settings, sequenceStep: 10 })
    expect(rows.map((row) => row.sequence)).toEqual([10, 20])
  })
})
