import { describe, expect, it } from "vitest"

import {
  cooldownKeyFor,
  matchEvent,
  passesFilter,
  readPath,
  MAX_CHAIN_DEPTH,
  type DomainEvent,
  type EventSubscription,
  type RecentRun,
} from "./match"

const NOW = new Date("2026-09-15T12:00:00Z")

function event(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    type: "order.created",
    id: "evt-1",
    occurredAt: NOW,
    payload: { order: { id: "so-1", total: 500, status: "confirmed" }, customer: { name: "Bella" } },
    ...overrides,
  }
}

function subscription(overrides: Partial<EventSubscription> = {}): EventSubscription {
  return {
    id: "sub-1",
    agentId: "agent-ops",
    agentName: "Ops",
    eventType: "order.created",
    enabled: true,
    filters: [],
    maxPerHour: 60,
    cooldownSeconds: 0,
    ...overrides,
  }
}

const ran = (decisions: ReturnType<typeof matchEvent>) => decisions.filter((d) => d.run)
const refusal = (decisions: ReturnType<typeof matchEvent>) =>
  decisions.find((d) => !d.run) as { run: false; reason: string } | undefined

describe("readPath", () => {
  it("reads a nested value", () => {
    expect(readPath({ order: { total: 5 } }, "order.total")).toBe(5)
  })

  it("returns undefined rather than throwing on a missing branch", () => {
    expect(readPath({ order: {} }, "order.customer.name")).toBeUndefined()
    expect(readPath(null, "order.total")).toBeUndefined()
    expect(readPath({ order: 5 }, "order.total")).toBeUndefined()
    expect(readPath({}, "")).toBeUndefined()
  })
})

describe("passesFilter", () => {
  const payload = { order: { total: 500, status: "confirmed", tags: ["urgent"] } }

  it("compares numbers", () => {
    expect(passesFilter(payload, { path: "order.total", operator: "gt", value: 100 })).toBe(true)
    expect(passesFilter(payload, { path: "order.total", operator: "gt", value: 900 })).toBe(false)
    expect(passesFilter(payload, { path: "order.total", operator: "lte", value: 500 })).toBe(true)
  })

  it("compares a numeric string, because payloads are JSON", () => {
    expect(passesFilter({ n: "500" }, { path: "n", operator: "gte", value: 500 })).toBe(true)
  })

  it("is false when the field is not there, never true", () => {
    // The bug this prevents: a filter on a field that does not exist matching
    // everything, so the agent wakes on every order in the business.
    for (const operator of ["gt", "gte", "lt", "lte"] as const) {
      expect(passesFilter(payload, { path: "order.missing", operator, value: 0 })).toBe(false)
    }
    expect(passesFilter(payload, { path: "order.missing", operator: "contains", value: "x" })).toBe(false)
    expect(passesFilter(payload, { path: "order.missing", operator: "in", value: ["x"] })).toBe(false)
  })

  it("handles equality and its negation", () => {
    expect(passesFilter(payload, { path: "order.status", operator: "eq", value: "confirmed" })).toBe(true)
    expect(passesFilter(payload, { path: "order.status", operator: "ne", value: "draft" })).toBe(true)
  })

  it("tests membership both ways round", () => {
    expect(passesFilter(payload, { path: "order.tags", operator: "contains", value: "urgent" })).toBe(true)
    expect(passesFilter(payload, { path: "order.status", operator: "in", value: ["confirmed", "packed"] })).toBe(true)
    expect(passesFilter(payload, { path: "order.status", operator: "in", value: "confirmed" })).toBe(false)
  })

  it("matches a substring case-insensitively", () => {
    expect(passesFilter({ name: "Bella Napoli" }, { path: "name", operator: "contains", value: "napoli" })).toBe(true)
  })

  it("tests presence explicitly", () => {
    expect(passesFilter(payload, { path: "order.status", operator: "exists" })).toBe(true)
    expect(passesFilter(payload, { path: "order.missing", operator: "exists" })).toBe(false)
    expect(passesFilter(payload, { path: "order.missing", operator: "exists", value: false })).toBe(true)
  })

  it("refuses an operator it does not understand rather than matching", () => {
    // Matching would run an agent on a rule nobody wrote.
    expect(
      passesFilter(payload, { path: "order.total", operator: "spaceship" as never, value: 1 })
    ).toBe(false)
  })
})

describe("matchEvent", () => {
  it("wakes a subscription whose type and filters match", () => {
    const decisions = matchEvent(event(), [subscription()], [], NOW)

    expect(ran(decisions)).toHaveLength(1)
  })

  it("ignores an event of another type", () => {
    const decisions = matchEvent(event({ type: "stock.low" }), [subscription()], [], NOW)

    expect(ran(decisions)).toHaveLength(0)
    expect(refusal(decisions)?.reason).toContain("type")
  })

  it("applies every filter, not just the first", () => {
    const strict = subscription({
      filters: [
        { path: "order.total", operator: "gt", value: 100 },
        { path: "order.status", operator: "eq", value: "draft" },
      ],
    })

    expect(ran(matchEvent(event(), [strict], [], NOW))).toHaveLength(0)
  })

  it("says which filter failed, so a quiet agent can be debugged", () => {
    const strict = subscription({
      filters: [{ path: "order.total", operator: "gt", value: 10_000 }],
    })

    expect(refusal(matchEvent(event(), [strict], [], NOW))?.reason).toContain("order.total")
  })

  it("skips a disabled subscription", () => {
    expect(ran(matchEvent(event(), [subscription({ enabled: false })], [], NOW))).toHaveLength(0)
  })
})

describe("not looping", () => {
  it("does not wake the agent that caused the event", () => {
    // An agent that acts causes events, and one of those can match the agent
    // that caused it. Unbounded, that spends real money and makes real
    // changes to the business on a loop.
    const decisions = matchEvent(
      event({ causedByAgentId: "agent-ops" }),
      [subscription({ agentId: "agent-ops" })],
      [],
      NOW
    )

    expect(ran(decisions)).toHaveLength(0)
    expect(refusal(decisions)?.reason).toContain("loop")
  })

  it("still wakes a different agent for the same event", () => {
    // Ops acting should be able to wake Finance. Only self-triggering loops.
    const decisions = matchEvent(
      event({ causedByAgentId: "agent-ops" }),
      [subscription({ id: "sub-2", agentId: "agent-finance", agentName: "Finance" })],
      [],
      NOW
    )

    expect(ran(decisions)).toHaveLength(1)
  })

  it("cuts a chain that has passed through too many agents", () => {
    // Ops wakes Finance wakes Ops wakes Finance. Nobody is self-triggering,
    // and it still never stops without a depth limit.
    const deep = event({ causedByAgentId: "agent-other", causedByDepth: MAX_CHAIN_DEPTH })
    const decisions = matchEvent(deep, [subscription()], [], NOW)

    expect(ran(decisions)).toHaveLength(0)
    expect(refusal(decisions)?.reason).toContain("hops deep")
  })

  it("allows a chain that is still shallow", () => {
    const shallow = event({ causedByAgentId: "agent-other", causedByDepth: MAX_CHAIN_DEPTH - 1 })

    expect(ran(matchEvent(shallow, [subscription()], [], NOW))).toHaveLength(1)
  })

  it("treats an event nobody caused as depth zero", () => {
    expect(ran(matchEvent(event(), [subscription()], [], NOW))).toHaveLength(1)
  })
})

describe("not running twice", () => {
  const already: RecentRun[] = [
    { subscriptionId: "sub-1", eventId: "evt-1", startedAt: new Date("2026-09-15T11:59:00Z") },
  ]

  it("ignores a redelivery of an event it already ran", () => {
    // Delivery retries, and a run that books stock or emails a customer
    // cannot be repeated.
    const decisions = matchEvent(event(), [subscription()], already, NOW)

    expect(ran(decisions)).toHaveLength(0)
    expect(refusal(decisions)?.reason).toContain("Already ran")
  })

  it("still runs for a different event", () => {
    expect(ran(matchEvent(event({ id: "evt-2" }), [subscription()], already, NOW))).toHaveLength(1)
  })

  it("does not confuse another subscription's history with its own", () => {
    const other: RecentRun[] = [
      { subscriptionId: "sub-other", eventId: "evt-1", startedAt: NOW },
    ]

    expect(ran(matchEvent(event(), [subscription()], other, NOW))).toHaveLength(1)
  })
})

describe("not storming", () => {
  const runsInLastHour = (count: number): RecentRun[] =>
    Array.from({ length: count }, (_, index) => ({
      subscriptionId: "sub-1",
      eventId: `old-${index}`,
      startedAt: new Date(NOW.getTime() - (index + 1) * 60_000),
    }))

  it("stops at the hourly limit", () => {
    // Importing three thousand orders fires three thousand events. Waking the
    // agent for each is useless and expensive.
    const decisions = matchEvent(event(), [subscription({ maxPerHour: 5 })], runsInLastHour(5), NOW)

    expect(ran(decisions)).toHaveLength(0)
    expect(refusal(decisions)?.reason).toContain("Rate limit")
  })

  it("allows the run that reaches but does not exceed the limit", () => {
    expect(
      ran(matchEvent(event(), [subscription({ maxPerHour: 5 })], runsInLastHour(4), NOW))
    ).toHaveLength(1)
  })

  it("does not count runs from more than an hour ago", () => {
    const old: RecentRun[] = [
      { subscriptionId: "sub-1", eventId: "old", startedAt: new Date(NOW.getTime() - 3_700_000) },
    ]

    expect(ran(matchEvent(event(), [subscription({ maxPerHour: 1 })], old, NOW))).toHaveLength(1)
  })

  it("treats a limit of zero as no limit", () => {
    expect(
      ran(matchEvent(event(), [subscription({ maxPerHour: 0 })], runsInLastHour(500), NOW))
    ).toHaveLength(1)
  })
})

describe("cooldown on a subject", () => {
  const withCooldown = subscription({ cooldownSeconds: 600, cooldownKeyPath: "order.id" })

  it("ignores the same subject changing again within the window", () => {
    const recent: RecentRun[] = [
      {
        subscriptionId: "sub-1",
        eventId: "evt-0",
        cooldownKey: "so-1",
        startedAt: new Date(NOW.getTime() - 60_000),
      },
    ]

    const decisions = matchEvent(event({ id: "evt-2" }), [withCooldown], recent, NOW)

    expect(ran(decisions)).toHaveLength(0)
    expect(refusal(decisions)?.reason).toContain("cooldown")
  })

  it("runs for a different subject inside the same window", () => {
    const recent: RecentRun[] = [
      {
        subscriptionId: "sub-1",
        eventId: "evt-0",
        cooldownKey: "so-OTHER",
        startedAt: new Date(NOW.getTime() - 60_000),
      },
    ]

    expect(ran(matchEvent(event({ id: "evt-2" }), [withCooldown], recent, NOW))).toHaveLength(1)
  })

  it("runs once the window has passed", () => {
    const recent: RecentRun[] = [
      {
        subscriptionId: "sub-1",
        eventId: "evt-0",
        cooldownKey: "so-1",
        startedAt: new Date(NOW.getTime() - 700_000),
      },
    ]

    expect(ran(matchEvent(event({ id: "evt-2" }), [withCooldown], recent, NOW))).toHaveLength(1)
  })

  it("does not suppress anything when the event has no key", () => {
    const keyless = event({ id: "evt-2", payload: { order: { total: 1 } } })
    const recent: RecentRun[] = [
      { subscriptionId: "sub-1", eventId: "evt-0", cooldownKey: "so-1", startedAt: NOW },
    ]

    expect(ran(matchEvent(keyless, [withCooldown], recent, NOW))).toHaveLength(1)
  })
})

describe("entity scope", () => {
  it("does not wake an agent belonging to another entity", () => {
    // A cross-entity wake is a data leak, not a missed notification.
    const decisions = matchEvent(
      event({ companyId: "co-a" }),
      [subscription({ companyId: "co-b" })],
      [],
      NOW
    )

    expect(ran(decisions)).toHaveLength(0)
    expect(refusal(decisions)?.reason).toContain("entity")
  })

  it("wakes an agent scoped to the same entity", () => {
    expect(
      ran(matchEvent(event({ companyId: "co-a" }), [subscription({ companyId: "co-a" })], [], NOW))
    ).toHaveLength(1)
  })

  it("wakes a group-wide agent for any entity's event", () => {
    expect(
      ran(matchEvent(event({ companyId: "co-a" }), [subscription({ companyId: null })], [], NOW))
    ).toHaveLength(1)
  })
})

describe("cooldownKeyFor", () => {
  it("reads the key from the payload", () => {
    expect(cooldownKeyFor(event(), subscription({ cooldownKeyPath: "order.id" }))).toBe("so-1")
  })

  it("is null when there is no key path or no value", () => {
    expect(cooldownKeyFor(event(), subscription())).toBeNull()
    expect(cooldownKeyFor(event(), subscription({ cooldownKeyPath: "order.nope" }))).toBeNull()
  })

  it("stringifies a numeric key so it compares consistently", () => {
    const numeric = event({ payload: { order: { id: 42 } } })
    expect(cooldownKeyFor(numeric, subscription({ cooldownKeyPath: "order.id" }))).toBe("42")
  })
})
