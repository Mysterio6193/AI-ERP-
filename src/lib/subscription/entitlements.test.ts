import { describe, expect, it } from "vitest"

import { defaultsFor } from "@/lib/settings/registry"

import {
  checkLimit,
  evaluateAccess,
  hasModule,
  resolveEntitlements,
  type Entitlement,
} from "./entitlements"

const settings = defaultsFor("subscription")
const now = new Date("2026-06-15T12:00:00Z")
const days = (n: number) => new Date(now.getTime() + n * 86_400_000)

describe("evaluateAccess", () => {
  it("serves a trial until the day it ends", () => {
    const live = evaluateAccess(
      { status: "trialing", trialEndsAt: days(3), currentPeriodEnd: days(3) },
      settings,
      now
    )
    expect(live.active).toBe(true)
    expect(live.daysRemaining).toBe(3)

    const done = evaluateAccess(
      { status: "trialing", trialEndsAt: days(-1), currentPeriodEnd: days(-1) },
      settings,
      now
    )
    expect(done.active).toBe(false)
    expect(done.reason).toBe("Trial ended")
  })

  it("keeps a past-due account working through the grace window", () => {
    const fresh = evaluateAccess(
      { status: "past_due", currentPeriodEnd: days(-2), trialEndsAt: null },
      settings,
      now
    )
    expect(fresh.active).toBe(true)
    expect(fresh.inGrace).toBe(true)
    expect(fresh.graceDaysRemaining).toBe(12) // 14 default - 2 overdue

    const stale = evaluateAccess(
      { status: "past_due", currentPeriodEnd: days(-30), trialEndsAt: null },
      settings,
      now
    )
    expect(stale.active).toBe(false)
    expect(stale.graceDaysRemaining).toBe(0)
  })

  it("treats an active subscription whose period already ended as lapsed", () => {
    // Nothing reconciled it — an unreachable billing server, or a licence that
    // ran out. Trusting the stale status would grant access forever.
    const verdict = evaluateAccess(
      { status: "active", currentPeriodEnd: days(-3), trialEndsAt: null },
      settings,
      now
    )

    expect(verdict.inGrace).toBe(true)
    expect(verdict.active).toBe(true)
    expect(verdict.graceDaysRemaining).toBe(11)

    const longGone = evaluateAccess(
      { status: "active", currentPeriodEnd: days(-60), trialEndsAt: null },
      settings,
      now
    )
    expect(longGone.active).toBe(false)
  })

  it("honours a cancellation that is paid to the end of the period", () => {
    const paidUp = evaluateAccess(
      { status: "cancelled", currentPeriodEnd: days(10), trialEndsAt: null },
      settings,
      now
    )
    expect(paidUp.active).toBe(true)
    expect(paidUp.reason).toContain("access until")

    const over = evaluateAccess(
      { status: "cancelled", currentPeriodEnd: days(-1), trialEndsAt: null },
      settings,
      now
    )
    expect(over.active).toBe(false)
  })

  it("respects the configured grace length rather than a fixed one", () => {
    const strict = { ...settings, graceDays: 0 }
    expect(
      evaluateAccess({ status: "past_due", currentPeriodEnd: days(-1), trialEndsAt: null }, strict, now).active
    ).toBe(false)

    const lenient = { ...settings, graceDays: 60 }
    expect(
      evaluateAccess({ status: "past_due", currentPeriodEnd: days(-30), trialEndsAt: null }, lenient, now).active
    ).toBe(true)
  })

  it("falls back to the unlicensed setting when there is no subscription", () => {
    expect(evaluateAccess(null, settings, now).active).toBe(true)
    expect(evaluateAccess(null, { ...settings, allowUnlicensedAccess: false }, now).active).toBe(false)
  })
})

describe("checkLimit", () => {
  const entitlements: Entitlement[] = [
    { key: "limit.users", enabled: true, limit: 10 },
    { key: "limit.warehouses", enabled: true, limit: null }, // unlimited
    { key: "limit.companies", enabled: true, limit: 0 }, // none allowed
    { key: "module.manufacturing", enabled: false, limit: null },
  ]

  const enforcing = { ...settings, enforceLimits: true }

  it("separates unlimited from none allowed", () => {
    const unlimited = checkLimit("limit.warehouses", 999, entitlements, enforcing)
    expect(unlimited.allowed).toBe(true)
    expect(unlimited.limit).toBeNull()

    // A limit of 0 is a real limit, not an absent one.
    const none = checkLimit("limit.companies", 0, entitlements, enforcing)
    expect(none.allowed).toBe(false)
    expect(none.limit).toBe(0)
  })

  it("asks whether there is room for one more", () => {
    expect(checkLimit("limit.users", 9, entitlements, enforcing).allowed).toBe(true)
    expect(checkLimit("limit.users", 10, entitlements, enforcing).allowed).toBe(false)
    expect(checkLimit("limit.users", 9, entitlements, enforcing).remaining).toBe(1)
  })

  it("reports usage but permits it while enforcement is off", () => {
    const verdict = checkLimit("limit.users", 25, entitlements, settings)

    expect(verdict.allowed).toBe(true)
    expect(verdict.remaining).toBe(-15)
    expect(verdict.reason).toContain("enforcement is off")
  })

  it("flags approaching a limit before refusing it", () => {
    expect(checkLimit("limit.users", 7, entitlements, enforcing).nearLimit).toBe(false)
    expect(checkLimit("limit.users", 8, entitlements, enforcing).nearLimit).toBe(true) // 80%
    expect(checkLimit("limit.users", 10, entitlements, enforcing).nearLimit).toBe(false) // refused, not near
  })

  it("refuses a capability the plan switches off regardless of count", () => {
    expect(checkLimit("module.manufacturing", 0, entitlements, enforcing).allowed).toBe(false)
    expect(hasModule("module.manufacturing", entitlements, settings)).toBe(false)
  })

  it("allows an unknown key by default so old plans survive new features", () => {
    // A plan sold last year cannot list a key that shipped this morning.
    const verdict = checkLimit("limit.somethingNew", 5, entitlements, enforcing)
    expect(verdict.allowed).toBe(true)

    const locked = checkLimit("limit.somethingNew", 5, entitlements, {
      ...enforcing,
      denyUnknownEntitlements: true,
    })
    expect(locked.allowed).toBe(false)
  })
})

describe("resolveEntitlements", () => {
  it("lets a per-company override beat the plan", () => {
    const plan: Entitlement[] = [
      { key: "limit.users", enabled: true, limit: 10 },
      { key: "limit.warehouses", enabled: true, limit: 2 },
    ]
    const overrides: Entitlement[] = [{ key: "limit.warehouses", enabled: true, limit: 5 }]

    const merged = resolveEntitlements(plan, overrides)

    expect(merged.find((e) => e.key === "limit.warehouses")?.limit).toBe(5)
    expect(merged.find((e) => e.key === "limit.users")?.limit).toBe(10)
  })

  it("lets an override add a key the plan never had", () => {
    const merged = resolveEntitlements([], [{ key: "module.manufacturing", enabled: true, limit: null }])
    expect(merged).toHaveLength(1)
  })
})
