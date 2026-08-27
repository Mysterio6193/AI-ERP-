"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CircleDollarSign,
  Clock,
  Loader2,
  Package,
  PhoneOff,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react"

import { AgentChat } from "@/components/agent/agent-chat"
import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/types"

/**
 * The dashboard.
 *
 * Every figure on this page is computed from the database by /api/ai/briefing.
 * The agent panel beside it explains and acts on those figures - it never
 * produces them, so anything it says can be checked against the cards.
 */

interface Briefing {
  generatedAt: string
  sales: {
    ordersToday: number
    revenueToday: number
    ordersThisMonth: number
    revenueThisMonth: number
    revenueLastMonthToDate: number
    ordersAwaitingAction: number
  }
  receivables: {
    overdueCount: number
    overdueValue: number
    worst: Array<{
      invoiceNumber: string
      customer?: string
      outstanding: number
      daysOverdue: number
    }>
  }
  stock: {
    belowReorderCount: number
    outOfStockCount: number
    items: Array<{ product?: string; sku?: string; available: number; reorderLevel: number }>
  }
  customers: {
    lapsingCount: number
    valueAtRisk: number
    lapsing: Array<{ customer: string; daysSinceLastOrder: number; usualGapDays: number }>
  }
  pipeline: { openCount: number; totalValue: number; weightedValue: number }
  service: { openCases: number }
  focus: Array<{ reason: string; title: string; detail: string; customer: string | null }>
  agent: {
    recentRuns: Array<{
      id: string
      persona: string
      trigger: string
      channel: string | null
      status: string
      startedAt: string
    }>
  }
}

function money(value: number) {
  // Follows the company's country rather than assuming a dollar sign.
  return formatCurrency(value)
}

export default function AiDashboardPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetch("/api/ai/briefing")
      const payload = await response.json()

      if (payload.success) {
        setBriefing(payload.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sales = briefing?.sales
  const monthDelta =
    sales && sales.revenueLastMonthToDate > 0
      ? ((sales.revenueThisMonth - sales.revenueLastMonthToDate) / sales.revenueLastMonthToDate) * 100
      : null

  const cards = [
    {
      label: "Revenue this month",
      value: money(sales?.revenueThisMonth ?? 0),
      hint:
        monthDelta === null
          ? `${sales?.ordersThisMonth ?? 0} orders`
          : `${monthDelta >= 0 ? "+" : ""}${monthDelta.toFixed(0)}% vs same point last month`,
      icon: TrendingUp,
      trend: monthDelta,
    },
    {
      label: "Overdue receivables",
      value: money(briefing?.receivables.overdueValue ?? 0),
      hint: `${briefing?.receivables.overdueCount ?? 0} invoices past due`,
      icon: CircleDollarSign,
      trend: null,
    },
    {
      label: "Accounts going quiet",
      value: String(briefing?.customers.lapsingCount ?? 0),
      hint: `${money(briefing?.customers.valueAtRisk ?? 0)} / month at risk`,
      icon: PhoneOff,
      trend: null,
    },
    {
      label: "Below reorder level",
      value: String(briefing?.stock.belowReorderCount ?? 0),
      hint: `${briefing?.stock.outOfStockCount ?? 0} out of stock`,
      icon: Package,
      trend: null,
    },
  ]

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Live figures from your data, with the agent alongside to explain and act on them.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {briefing ? (
              <span className="text-xs text-muted-foreground">
                as at {new Date(briefing.generatedAt).toLocaleTimeString()}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon

            return (
              <Card key={card.label}>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {card.label}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{card.value}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {card.trend !== null && card.trend !== undefined ? (
                      card.trend >= 0 ? (
                        <ArrowUpRight className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 text-rose-600" />
                      )
                    ) : null}
                    {card.hint}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What needs attention</CardTitle>
                <CardDescription>
                  Ranked across complaints, slipped follow-ups, quiet accounts and money owed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!briefing?.focus.length ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "Nothing outstanding."}
                  </p>
                ) : (
                  briefing.focus.map((item, index) => (
                    <div key={index} className="flex items-start gap-3 rounded-lg border p-3">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.customer ? `${item.customer} · ` : ""}
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <Link href="/crm" className="block pt-1 text-xs text-muted-foreground underline">
                  Open the CRM to act on these
                </Link>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                    Worst debtors
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!briefing?.receivables.worst.length ? (
                    <p className="text-xs text-muted-foreground">Nothing overdue.</p>
                  ) : (
                    briefing.receivables.worst.map((invoice) => (
                      <div
                        key={invoice.invoiceNumber}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="min-w-0 truncate">
                          {invoice.customer}
                          <span className="text-muted-foreground"> · {invoice.daysOverdue}d</span>
                        </span>
                        <span className="shrink-0 font-medium">{money(invoice.outstanding)}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <PhoneOff className="h-3.5 w-3.5 text-orange-600" />
                    Going quiet
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!briefing?.customers.lapsing.length ? (
                    <p className="text-xs text-muted-foreground">
                      Every account is ordering to its usual pattern.
                    </p>
                  ) : (
                    briefing.customers.lapsing.map((account) => (
                      <div key={account.customer} className="text-xs">
                        <span className="font-medium">{account.customer}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · usually every {account.usualGapDays}d, silent {account.daysSinceLastOrder}d
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {briefing?.agent.recentRuns.length ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Bot className="h-3.5 w-3.5" />
                    Recent agent activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {briefing.agent.recentRuns.map((run) => (
                    <div key={run.id} className="flex items-center gap-2 text-xs">
                      <Badge
                        variant={run.status === "succeeded" ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {run.status}
                      </Badge>
                      <span className="text-muted-foreground">
                        {run.persona} · {run.trigger}
                        {run.channel ? ` · ${run.channel}` : ""} ·{" "}
                        {new Date(run.startedAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="flex h-[640px] flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                Ask about any of this
              </CardTitle>
              <CardDescription>
                The agent reads the same data and can act on it.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              <AgentChat
                compact
                threadKey="dashboard"
                suggestions={[
                  "Brief me on today",
                  "Who should I chase first and what do I say?",
                  "What should I reorder this week?",
                  "Draft a win-back for the quietest account",
                ]}
                pageContext="the user is looking at the dashboard, which already shows revenue, overdue receivables, lapsing accounts and stock levels"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
