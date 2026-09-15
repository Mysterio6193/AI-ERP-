/**
 * Deciding which agents an event should wake.
 *
 * Agents can already be run by hand or on a clock. `trigger: "event"` was
 * accepted by the API, stored on the definition and offered in the UI — and
 * nothing ever fired it. The scheduler skips any definition that is not on a
 * schedule, so an agent set to run on an event sat with `nextRunAt: null` and
 * never ran at all. That is worse than the feature being absent, because it
 * looks configured.
 *
 * The matching itself is small. What makes this worth isolating and testing is
 * everything that has to be true for an event-driven agent not to be a
 * liability:
 *
 *   - It must not loop. An agent that acts causes events, and one of those can
 *     match the agent that caused it. Left alone that is an unbounded loop
 *     spending real money on model calls and real changes to the business.
 *   - It must not storm. Importing three thousand orders fires three thousand
 *     events; waking an agent for each is both useless and expensive.
 *   - It must not run twice for one event. Delivery retries, and a run that
 *     books stock or emails a customer cannot be repeated.
 *
 * Pure: subscriptions and recent history are passed in.
 */

export interface DomainEvent {
  /** Dotted and specific: "order.created", "stock.low", "lot.quarantined". */
  type: string
  /** Stable per real-world occurrence, so a redelivery is recognisable. */
  id: string
  occurredAt: Date
  /** The entity this happened in, when it is entity-specific. */
  companyId?: string | null
  /** Whatever the event is about. Filters read from here. */
  payload: Record<string, unknown>
  /**
   * The agent run that caused this event, when one did.
   *
   * This is the whole of the loop defence: an event an agent caused must not
   * wake that same agent.
   */
  causedByAgentId?: string | null
  /** How many agent hops led here. An event a person caused is 0. */
  causedByDepth?: number
}

export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "in"
  | "exists"

export interface EventFilter {
  /** Dotted path into the payload, e.g. "order.total" or "product.sku". */
  path: string
  operator: FilterOperator
  value?: unknown
}

export interface EventSubscription {
  id: string
  agentId: string
  agentName: string
  eventType: string
  enabled: boolean
  /** All must pass. An empty list matches every event of the type. */
  filters: EventFilter[]
  companyId?: string | null
  /** Most runs to start from this subscription per hour. */
  maxPerHour: number
  /**
   * Ignore a repeat of the same subject within this many seconds.
   *
   * Different from deduplicating one event: this is for a subject that changes
   * five times in a minute, where waking the agent on each is noise.
   */
  cooldownSeconds: number
  /** What identifies "the same subject" for the cooldown, as a payload path. */
  cooldownKeyPath?: string | null
}

export interface RecentRun {
  subscriptionId: string
  /** The event id that started it, so a redelivery can be recognised. */
  eventId: string
  /** The cooldown key that run was for, if any. */
  cooldownKey?: string | null
  startedAt: Date
}

export type MatchDecision =
  | { subscription: EventSubscription; run: true }
  | { subscription: EventSubscription; run: false; reason: string }

/** Maximum agent-caused hops before an event chain is cut. */
export const MAX_CHAIN_DEPTH = 3

/** Reads a dotted path out of a payload. Missing is undefined, not a throw. */
export function readPath(payload: unknown, path: string): unknown {
  if (!path) return undefined

  let current: unknown = payload

  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Tests one filter.
 *
 * A comparison against a value that is not there is false, never true. An
 * absent field must not satisfy "total greater than 10000" — that is how a
 * filter silently matches everything and an agent starts waking on every
 * order in the business.
 */
export function passesFilter(payload: unknown, filter: EventFilter): boolean {
  const actual = readPath(payload, filter.path)

  switch (filter.operator) {
    case "exists":
      // The only operator where absence is a legitimate answer.
      return filter.value === false ? actual === undefined || actual === null : actual !== undefined && actual !== null

    case "eq":
      return actual === filter.value

    case "ne":
      return actual !== filter.value

    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = asNumber(actual)
      const right = asNumber(filter.value)
      if (left === null || right === null) return false

      if (filter.operator === "gt") return left > right
      if (filter.operator === "gte") return left >= right
      if (filter.operator === "lt") return left < right
      return left <= right
    }

    case "contains": {
      if (Array.isArray(actual)) return actual.includes(filter.value)
      if (typeof actual !== "string") return false
      return actual.toLowerCase().includes(String(filter.value ?? "").toLowerCase())
    }

    case "in":
      return Array.isArray(filter.value) && filter.value.includes(actual)

    default:
      // An operator we do not understand must not match. Matching would run
      // an agent on a rule nobody wrote.
      return false
  }
}

/**
 * Which subscriptions this event should start a run for, and why the rest
 * should not.
 *
 * Returns the refusals as well as the matches on purpose: "why did my agent
 * not run" is otherwise unanswerable, and an event system nobody can debug
 * gets turned off.
 */
export function matchEvent(
  event: DomainEvent,
  subscriptions: EventSubscription[],
  recent: RecentRun[] = [],
  now: Date = new Date()
): MatchDecision[] {
  const depth = event.causedByDepth ?? 0

  return subscriptions.map<MatchDecision>((subscription) => {
    const no = (reason: string): MatchDecision => ({ subscription, run: false, reason })

    if (!subscription.enabled) return no("Subscription is disabled")
    if (subscription.eventType !== event.type) return no("Event type does not match")

    // An event scoped to one entity must not wake an agent belonging to
    // another: that is a cross-entity data leak, not a missed notification.
    if (
      subscription.companyId &&
      event.companyId &&
      subscription.companyId !== event.companyId
    ) {
      return no("Event belongs to a different entity")
    }

    if (event.causedByAgentId && event.causedByAgentId === subscription.agentId) {
      return no("This agent caused the event; waking it would loop")
    }

    if (depth >= MAX_CHAIN_DEPTH) {
      return no(`Event is ${depth} agent hops deep; the chain stops at ${MAX_CHAIN_DEPTH}`)
    }

    for (const filter of subscription.filters) {
      if (!passesFilter(event.payload, filter)) {
        return no(`Filter failed: ${filter.path} ${filter.operator} ${JSON.stringify(filter.value)}`)
      }
    }

    const mine = recent.filter((run) => run.subscriptionId === subscription.id)

    if (mine.some((run) => run.eventId === event.id)) {
      return no("Already ran for this event")
    }

    const hourAgo = now.getTime() - 3_600_000
    const inLastHour = mine.filter((run) => run.startedAt.getTime() > hourAgo).length

    if (subscription.maxPerHour > 0 && inLastHour >= subscription.maxPerHour) {
      return no(`Rate limit reached: ${inLastHour} runs in the last hour, limit ${subscription.maxPerHour}`)
    }

    if (subscription.cooldownSeconds > 0 && subscription.cooldownKeyPath) {
      const key = readPath(event.payload, subscription.cooldownKeyPath)

      if (key !== undefined && key !== null) {
        const cutoff = now.getTime() - subscription.cooldownSeconds * 1000
        const recentForKey = mine.find(
          (run) => run.cooldownKey === String(key) && run.startedAt.getTime() > cutoff
        )

        if (recentForKey) {
          return no(`Ran for ${subscription.cooldownKeyPath}=${String(key)} within the cooldown`)
        }
      }
    }

    return { subscription, run: true }
  })
}

/** The cooldown key for an event under a subscription, if it has one. */
export function cooldownKeyFor(event: DomainEvent, subscription: EventSubscription) {
  if (!subscription.cooldownKeyPath) return null
  const key = readPath(event.payload, subscription.cooldownKeyPath)
  return key === undefined || key === null ? null : String(key)
}
