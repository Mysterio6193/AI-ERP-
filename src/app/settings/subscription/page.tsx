"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, KeyRound, Server, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

/**
 * Subscription and licensing.
 *
 * Shows the same thing in both deployment modes — plan, entitlements, usage —
 * and changes only how a plan is granted: a licence key when self-hosted,
 * a plan assignment when we run it.
 */

interface Entitlement {
  key: string
  enabled: boolean
  limit: number | null
}

interface State {
  subscription: {
    status: string
    source: string
    interval: string
    seats: number
    currentPeriodEnd: string | null
    trialEndsAt: string | null
    cancelAtPeriodEnd: boolean
    plan: { id: string; code: string; name: string }
  } | null
  access: { active: boolean; inGrace: boolean; graceDaysRemaining: number; daysRemaining: number | null; reason: string }
  entitlements: Entitlement[]
  usage: Record<string, number>
  deploymentMode: "cloud" | "self_hosted"
  canSeePlans: boolean
}

interface Plan {
  id: string
  code: string
  name: string
  description: string | null
  monthlyPriceCents: number
  yearlyPriceCents: number
  currency: string
  trialDays: number
  includedSeats: number | null
  isPublic: boolean
  entitlements: Entitlement[]
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  trialing: "bg-sky-100 text-sky-700",
  past_due: "bg-amber-100 text-amber-700",
  cancelled: "bg-slate-200 text-slate-600",
  expired: "bg-red-100 text-red-700",
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    cents / 100
  )
}

/** Turns "limit.workCenters" into "Work centres". */
function label(key: string) {
  const tail = key.split(".").at(-1) ?? key
  return tail.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())
}

export default function SubscriptionSettingsPage() {
  const { toast } = useToast()
  const [state, setState] = useState<State | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [licenseKey, setLicenseKey] = useState("")
  const [licenseInfo, setLicenseInfo] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [sub, plan, lic] = await Promise.all([
        fetch("/api/subscription").then((r) => r.json()),
        fetch("/api/plans").then((r) => r.json()),
        fetch("/api/subscription/license").then((r) => r.json()),
      ])
      if (sub.success) setState(sub.data)
      if (plan.success) setPlans(plan.data)
      if (lic.success) setLicenseInfo(lic.data)
    } catch {
      toast({ title: "Could not load subscription", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const assignPlan = async (planId: string) => {
    setBusy(true)
    try {
      const result = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      }).then((r) => r.json())

      if (!result.success) {
        toast({ title: result.error || "Could not change plan", variant: "destructive" })
        return
      }
      toast({ title: "Plan updated" })
      load()
    } finally {
      setBusy(false)
    }
  }

  const activate = async () => {
    setBusy(true)
    try {
      const result = await fetch("/api/subscription/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: licenseKey }),
      }).then((r) => r.json())

      if (!result.success) {
        toast({ title: result.error || "Could not activate licence", variant: "destructive" })
        return
      }

      toast({
        title: result.data.expired
          ? `Licence accepted but expired ${Math.abs(result.data.daysRemaining)} day(s) ago`
          : `Activated on ${result.data.plan.name}`,
      })
      setLicenseKey("")
      load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading subscription…</div>
  }

  const sub = state?.subscription
  const limits = (state?.entitlements ?? []).filter((e) => e.key.startsWith("limit."))
  const modules = (state?.entitlements ?? []).filter((e) => e.key.startsWith("module."))

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Subscription & Licensing</h1>
        <p className="text-sm text-muted-foreground">
          What this install is entitled to, and how much of it is in use.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {sub ? sub.plan.name : "No plan"}
                {sub && <Badge className={STATUS_COLORS[sub.status] || ""}>{sub.status}</Badge>}
                {state?.access.inGrace && (
                  <Badge className="bg-amber-100 text-amber-700">
                    grace: {state.access.graceDaysRemaining}d
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{state?.access.reason}</CardDescription>
            </div>
            <Badge variant="outline" className="gap-1">
              <Server className="h-3 w-3" />
              {state?.deploymentMode === "self_hosted" ? "Self-hosted" : "Cloud"}
            </Badge>
          </div>
        </CardHeader>
        {sub && (
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">Granted by</p>
              <p className="font-medium">{sub.source}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">Seats</p>
              <p className="font-medium">{sub.seats}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">Billing</p>
              <p className="font-medium">{sub.interval}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground">Renews</p>
              <p className="font-medium">
                {sub.currentPeriodEnd ? sub.currentPeriodEnd.slice(0, 10) : "—"}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      <Tabs defaultValue="usage">
        <TabsList className="grid w-full grid-cols-2 sm:max-w-lg sm:grid-cols-3">
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="license">Licence</TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Limits</CardTitle>
              <CardDescription>
                Usage is always shown. Whether hitting a limit refuses the action is a setting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {limits.length === 0 ? (
                <p className="text-sm text-muted-foreground">This plan sets no countable limits.</p>
              ) : (
                limits.map((entitlement) => {
                  const used = state?.usage[entitlement.key] ?? 0
                  const unlimited = entitlement.limit === null
                  const pct = unlimited ? 0 : Math.min((used / Math.max(entitlement.limit!, 1)) * 100, 100)
                  const over = !unlimited && used >= entitlement.limit!

                  return (
                    <div key={entitlement.key} className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{label(entitlement.key)}</span>
                        <span className={`text-sm ${over ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                          {used} / {unlimited ? "unlimited" : entitlement.limit}
                        </span>
                      </div>
                      {!unlimited && <Progress value={pct} className={over ? "[&>div]:bg-red-500" : ""} />}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Modules</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {modules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No module entitlements on this plan.</p>
              ) : (
                modules.map((entitlement) => (
                  <Badge
                    key={entitlement.key}
                    className={entitlement.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}
                  >
                    {entitlement.enabled && <CheckCircle2 className="mr-1 h-3 w-3" />}
                    {label(entitlement.key)}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {plans.map((plan) => {
              const current = sub?.plan.code === plan.code

              return (
                <Card key={plan.id} className={current ? "border-sky-500 ring-1 ring-sky-500" : ""}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      {plan.name}
                      {current && <Badge className="bg-sky-100 text-sky-700">current</Badge>}
                    </CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-2xl font-bold">
                        {money(plan.monthlyPriceCents, plan.currency)}
                        <span className="text-sm font-normal text-muted-foreground">/mo</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {money(plan.yearlyPriceCents, plan.currency)}/yr ·{" "}
                        {plan.includedSeats === null ? "unlimited seats" : `${plan.includedSeats} seats`}
                        {plan.trialDays > 0 && ` · ${plan.trialDays}-day trial`}
                      </p>
                    </div>
                    <Separator />
                    <ul className="space-y-1 text-xs">
                      {plan.entitlements.slice(0, 6).map((entitlement) => (
                        <li key={entitlement.key} className="flex items-center justify-between gap-2">
                          <span className={entitlement.enabled ? "" : "text-muted-foreground line-through"}>
                            {label(entitlement.key)}
                          </span>
                          <span className="text-muted-foreground">
                            {entitlement.key.startsWith("limit.")
                              ? entitlement.limit === null
                                ? "unlimited"
                                : entitlement.limit
                              : entitlement.enabled
                                ? "included"
                                : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={current ? "outline" : "default"}
                      disabled={current || busy}
                      onClick={() => assignPlan(plan.id)}
                    >
                      {current ? "Current plan" : "Switch to this plan"}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="license" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" />
                Activate a licence
              </CardTitle>
              <CardDescription>
                Checked by signature against a key built into this install — no internet needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!licenseInfo?.configured && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  This install has no <code className="font-mono text-xs">LICENSE_PUBLIC_KEY</code> set,
                  so licences cannot be verified here.
                </div>
              )}

              {licenseInfo?.license && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    {licenseInfo.license.plan?.name} · {licenseInfo.license.seats} seat(s)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {licenseInfo.license.hint} · issued to {licenseInfo.license.issuedTo} ·{" "}
                    {licenseInfo.license.expiresAt
                      ? `expires ${String(licenseInfo.license.expiresAt).slice(0, 10)}`
                      : "perpetual"}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Licence key</Label>
                <Input
                  placeholder="SSOS.…"
                  className="font-mono text-xs"
                  value={licenseKey}
                  onChange={(event) => setLicenseKey(event.target.value)}
                />
              </div>
              <Button onClick={activate} disabled={!licenseKey || busy}>
                {busy ? "Checking…" : "Activate"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
