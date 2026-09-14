import { db } from "@/lib/db"
import { getSettings } from "@/lib/settings/service"

import {
  checkLimit,
  evaluateAccess,
  resolveEntitlements,
  type AccessVerdict,
  type Entitlement,
  type LimitVerdict,
  type SubscriptionStatus,
} from "./entitlements"

/**
 * The database side of subscriptions.
 *
 * Everything that decides anything lives in ./entitlements.ts and is pure;
 * this file only fetches, counts and writes. Keeping the split means the rules
 * are tested without a database and behave identically whether the entitlement
 * came from Stripe or from a signed licence on a disconnected server.
 */

export interface CompanyEntitlementState {
  subscription: {
    id: string
    status: SubscriptionStatus
    source: string
    interval: string
    seats: number
    currentPeriodEnd: Date | null
    trialEndsAt: Date | null
    cancelAtPeriodEnd: boolean
    plan: { id: string; code: string; name: string }
  } | null
  access: AccessVerdict
  entitlements: Entitlement[]
  usage: Record<string, number>
}

/** Keys the platform counts. Adding one here makes it enforceable everywhere. */
export const COUNTED_LIMITS = {
  "limit.users": () => db.user.count({ where: { status: "active" } }),
  "limit.warehouses": () => db.warehouse.count({ where: { status: "active" } }),
  "limit.products": () => db.product.count({ where: { status: "active" } }),
  "limit.workCenters": () => db.workCenter.count({ where: { status: { not: "retired" } } }),
} as const

export type CountedLimit = keyof typeof COUNTED_LIMITS

async function measureUsage(keys: string[]) {
  const usage: Record<string, number> = {}

  await Promise.all(
    keys.map(async (key) => {
      const counter = COUNTED_LIMITS[key as CountedLimit]
      if (counter) {
        usage[key] = await counter()
      }
    })
  )

  return usage
}

/**
 * Everything needed to answer "may they do this", in one round trip.
 *
 * Usage is measured for whichever limits the plan actually carries, rather
 * than counting every table on every request.
 */
export async function getEntitlementState(
  companyId: string | null
): Promise<CompanyEntitlementState> {
  const settings = await getSettings("subscription", { companyId })

  const subscription = companyId
    ? await db.subscription.findUnique({
        where: { companyId },
        include: {
          plan: {
            include: { entitlements: true },
          },
        },
      })
    : null

  const planEntitlements: Entitlement[] =
    subscription?.plan.entitlements.map((item) => ({
      key: item.key,
      enabled: item.enabled,
      limit: item.limit,
    })) ?? []

  const entitlements = resolveEntitlements(planEntitlements)

  const access = evaluateAccess(
    subscription
      ? {
          status: subscription.status as SubscriptionStatus,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
        }
      : null,
    settings
  )

  const usage = await measureUsage(entitlements.map((item) => item.key))

  return {
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status as SubscriptionStatus,
          source: subscription.source,
          interval: subscription.interval,
          seats: subscription.seats,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          plan: {
            id: subscription.plan.id,
            code: subscription.plan.code,
            name: subscription.plan.name,
          },
        }
      : null,
    access,
    entitlements,
    usage,
  }
}

export interface GuardResult {
  allowed: boolean
  status: number
  reason: string
  limit?: LimitVerdict
}

/**
 * The check a create endpoint makes before adding one more of something.
 *
 * Returns rather than throws, so the caller shapes its own response — and
 * deliberately never guards reads. Losing a subscription must not hide data
 * the customer already put in; it stops new work, nothing else.
 */
export async function guardCreate(
  companyId: string | null,
  key: string
): Promise<GuardResult> {
  const settings = await getSettings("subscription", { companyId })
  const state = await getEntitlementState(companyId)

  if (!state.access.active) {
    return {
      allowed: false,
      status: 402,
      reason: state.access.reason,
    }
  }

  const usage = state.usage[key] ?? 0
  const verdict = checkLimit(key, usage, state.entitlements, settings)

  return {
    allowed: verdict.allowed,
    status: verdict.allowed ? 200 : 402,
    reason: verdict.reason,
    limit: verdict,
  }
}

/** Appends to the subscription's audit trail. Rows are never updated. */
export async function recordEvent(input: {
  subscriptionId: string
  type: string
  fromPlanCode?: string | null
  toPlanCode?: string | null
  fromStatus?: string | null
  toStatus?: string | null
  detail?: string | null
  externalEventId?: string | null
}) {
  // A webhook can be redelivered; the unique external id makes replaying one
  // harmless rather than doubling the history.
  if (input.externalEventId) {
    const seen = await db.subscriptionEvent.findUnique({
      where: { externalEventId: input.externalEventId },
      select: { id: true },
    })

    if (seen) return null
  }

  return db.subscriptionEvent.create({
    data: {
      subscriptionId: input.subscriptionId,
      type: input.type,
      fromPlanCode: input.fromPlanCode ?? null,
      toPlanCode: input.toPlanCode ?? null,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      detail: input.detail ?? null,
      externalEventId: input.externalEventId ?? null,
    },
  })
}

/**
 * Starts or replaces a company's subscription.
 *
 * Used by all three sources — a Stripe checkout completing, a licence being
 * activated, or an admin assigning a plan — so the resulting state and its
 * audit trail are identical however it was granted.
 */
export async function setSubscription(input: {
  companyId: string
  planId: string
  status: SubscriptionStatus
  source: "stripe" | "license" | "manual"
  interval?: "monthly" | "yearly"
  seats?: number
  currentPeriodEnd?: Date | null
  trialEndsAt?: Date | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  licenseKeyId?: string | null
  detail?: string
}) {
  const plan = await db.plan.findUnique({
    where: { id: input.planId },
    select: { id: true, code: true },
  })

  if (!plan) {
    return { ok: false as const, error: "Plan not found" }
  }

  const existing = await db.subscription.findUnique({
    where: { companyId: input.companyId },
    include: { plan: { select: { code: true } } },
  })

  const data = {
    planId: input.planId,
    status: input.status,
    source: input.source,
    interval: input.interval ?? existing?.interval ?? "monthly",
    seats: input.seats ?? existing?.seats ?? 1,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    trialEndsAt: input.trialEndsAt ?? null,
    stripeCustomerId: input.stripeCustomerId ?? existing?.stripeCustomerId ?? null,
    stripeSubscriptionId: input.stripeSubscriptionId ?? existing?.stripeSubscriptionId ?? null,
    licenseKeyId: input.licenseKeyId ?? existing?.licenseKeyId ?? null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
  }

  const subscription = existing
    ? await db.subscription.update({ where: { id: existing.id }, data })
    : await db.subscription.create({
        data: { companyId: input.companyId, currentPeriodStart: new Date(), ...data },
      })

  await recordEvent({
    subscriptionId: subscription.id,
    type: existing ? "plan_changed" : "created",
    fromPlanCode: existing?.plan.code ?? null,
    toPlanCode: plan.code,
    fromStatus: existing?.status ?? null,
    toStatus: input.status,
    detail: input.detail ?? `via ${input.source}`,
  })

  return { ok: true as const, subscription }
}
