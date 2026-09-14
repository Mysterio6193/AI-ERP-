import type { SettingsOf } from "@/lib/settings/registry"

/**
 * What a company may do right now.
 *
 * Pure, so the awkward cases — a lapsed subscription inside its grace period,
 * a limit of zero versus no limit at all, a self-hosted install whose licence
 * expired last night — are cheap to test and identical in both deployment
 * modes. Nothing here touches the database or the network.
 *
 * Two distinctions carry most of the weight:
 *
 *   - `limit: null` is unlimited; `limit: 0` is "none allowed". Collapsing
 *     them into one field defaulting to 0 would silently lock everyone out.
 *   - Losing a subscription is not the same as being over a limit. An expired
 *     plan stops new work but must never hide data the customer already put
 *     in, so enforcement is about creation, never about reading.
 */

export type SubscriptionSettings = SettingsOf<"subscription">

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired"

export interface Entitlement {
  key: string
  enabled: boolean
  /** Null means unlimited. Zero means none allowed. */
  limit: number | null
}

export interface SubscriptionSnapshot {
  status: SubscriptionStatus
  planCode: string
  planName: string
  seats: number
  currentPeriodEnd: Date | null
  trialEndsAt: Date | null
  cancelAtPeriodEnd: boolean
  entitlements: Entitlement[]
}

export interface AccessVerdict {
  /** Whether the platform should still serve normal work. */
  active: boolean
  /** True while lapsed but inside the configured grace window. */
  inGrace: boolean
  graceDaysRemaining: number
  /** Days until the period ends, negative once past. */
  daysRemaining: number | null
  reason: string
}

const DAY_MS = 86_400_000

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

/**
 * Whether the subscription still entitles the company to work, and why.
 *
 * `past_due` deliberately keeps working for the grace window. A failed card
 * on a Friday should not stop a warehouse dispatching on Saturday; that is a
 * collections problem, not an access problem.
 */
export function evaluateAccess(
  subscription: Pick<
    SubscriptionSnapshot,
    "status" | "currentPeriodEnd" | "trialEndsAt"
  > | null,
  settings: SubscriptionSettings,
  now = new Date()
): AccessVerdict {
  if (!subscription) {
    return {
      active: settings.allowUnlicensedAccess,
      inGrace: false,
      graceDaysRemaining: 0,
      daysRemaining: null,
      reason: settings.allowUnlicensedAccess
        ? "No subscription; running unlicensed because settings allow it"
        : "No subscription",
    }
  }

  const { status, currentPeriodEnd, trialEndsAt } = subscription

  if (status === "trialing") {
    const ends = trialEndsAt ?? currentPeriodEnd
    const remaining = ends ? daysBetween(now, ends) : null

    if (ends && ends.getTime() <= now.getTime()) {
      return {
        active: false,
        inGrace: false,
        graceDaysRemaining: 0,
        daysRemaining: remaining,
        reason: "Trial ended",
      }
    }

    return {
      active: true,
      inGrace: false,
      graceDaysRemaining: 0,
      daysRemaining: remaining,
      reason: remaining === null ? "Trialing" : `Trial ends in ${remaining} day(s)`,
    }
  }

  if (status === "active") {
    const remaining = currentPeriodEnd ? daysBetween(now, currentPeriodEnd) : null

    // A period end in the past with the status still "active" means nothing
    // has reconciled it yet — an unreachable billing server, or a licence that
    // simply ran out. Treat it as lapsed rather than trusting the stale status.
    if (currentPeriodEnd && currentPeriodEnd.getTime() <= now.getTime()) {
      const overdueDays = daysBetween(currentPeriodEnd, now)
      const graceLeft = settings.graceDays - overdueDays

      return {
        active: graceLeft > 0,
        inGrace: graceLeft > 0,
        graceDaysRemaining: Math.max(graceLeft, 0),
        daysRemaining: remaining,
        reason:
          graceLeft > 0
            ? `Period ended; ${graceLeft} grace day(s) left`
            : "Subscription period ended",
      }
    }

    return {
      active: true,
      inGrace: false,
      graceDaysRemaining: 0,
      daysRemaining: remaining,
      reason: "Active",
    }
  }

  if (status === "past_due") {
    const since = currentPeriodEnd ?? now
    const overdueDays = Math.max(daysBetween(since, now), 0)
    const graceLeft = settings.graceDays - overdueDays

    return {
      active: graceLeft > 0,
      inGrace: graceLeft > 0,
      graceDaysRemaining: Math.max(graceLeft, 0),
      daysRemaining: currentPeriodEnd ? daysBetween(now, currentPeriodEnd) : null,
      reason:
        graceLeft > 0
          ? `Payment overdue; ${graceLeft} grace day(s) left`
          : "Payment overdue beyond the grace period",
    }
  }

  if (status === "cancelled") {
    // Cancelled but paid up: keep serving until the period genuinely ends.
    if (currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()) {
      return {
        active: true,
        inGrace: false,
        graceDaysRemaining: 0,
        daysRemaining: daysBetween(now, currentPeriodEnd),
        reason: `Cancelled; access until ${currentPeriodEnd.toISOString().slice(0, 10)}`,
      }
    }

    return {
      active: false,
      inGrace: false,
      graceDaysRemaining: 0,
      daysRemaining: currentPeriodEnd ? daysBetween(now, currentPeriodEnd) : null,
      reason: "Cancelled",
    }
  }

  return {
    active: false,
    inGrace: false,
    graceDaysRemaining: 0,
    daysRemaining: null,
    reason: "Expired",
  }
}

export interface LimitVerdict {
  allowed: boolean
  /** Null when the plan places no ceiling on this. */
  limit: number | null
  usage: number
  remaining: number | null
  /** True when usage is at or above the warning threshold but still allowed. */
  nearLimit: boolean
  reason: string
}

/**
 * Whether one more of something may be created.
 *
 * `usage` is what exists now, so the check is "is there room for one more",
 * which is the question a create endpoint actually asks.
 */
export function checkLimit(
  key: string,
  usage: number,
  entitlements: Entitlement[],
  settings: SubscriptionSettings
): LimitVerdict {
  const entitlement = entitlements.find((item) => item.key === key)

  if (!entitlement) {
    // An unknown key is not a silent deny. A plan that predates a feature
    // should not block it; locking down on absence would break every existing
    // customer the moment a new entitlement key ships.
    return {
      allowed: !settings.denyUnknownEntitlements,
      limit: null,
      usage,
      remaining: null,
      nearLimit: false,
      reason: settings.denyUnknownEntitlements
        ? `No entitlement "${key}" on this plan`
        : `No entitlement "${key}" on this plan; allowed by default`,
    }
  }

  if (!entitlement.enabled) {
    return {
      allowed: false,
      limit: entitlement.limit,
      usage,
      remaining: 0,
      nearLimit: false,
      reason: `"${key}" is not included in this plan`,
    }
  }

  if (entitlement.limit === null) {
    return {
      allowed: true,
      limit: null,
      usage,
      remaining: null,
      nearLimit: false,
      reason: "Unlimited",
    }
  }

  const remaining = entitlement.limit - usage
  const allowed = remaining > 0 || !settings.enforceLimits

  const threshold = entitlement.limit * (settings.warnAtPercent / 100)

  return {
    allowed,
    limit: entitlement.limit,
    usage,
    remaining,
    nearLimit: remaining > 0 && usage >= threshold,
    reason: allowed
      ? remaining > 0
        ? `${remaining} of ${entitlement.limit} remaining`
        : `Over the ${entitlement.limit} limit, allowed because enforcement is off`
      : `Plan limit of ${entitlement.limit} reached`,
  }
}

/** Whether a plan switches a module on at all, ignoring any count. */
export function hasModule(
  moduleKey: string,
  entitlements: Entitlement[],
  settings: SubscriptionSettings
) {
  const entitlement = entitlements.find((item) => item.key === moduleKey)

  if (!entitlement) {
    return !settings.denyUnknownEntitlements
  }

  return entitlement.enabled
}

/**
 * Merges plan entitlements with per-company overrides.
 *
 * Overrides exist because bespoke deals are normal: a customer on the standard
 * plan negotiates one extra warehouse. Encoding that as a private plan per
 * customer would multiply plans without end.
 */
export function resolveEntitlements(
  planEntitlements: Entitlement[],
  overrides: Entitlement[] = []
): Entitlement[] {
  const merged = new Map(planEntitlements.map((item) => [item.key, item]))

  for (const override of overrides) {
    merged.set(override.key, override)
  }

  return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key))
}
