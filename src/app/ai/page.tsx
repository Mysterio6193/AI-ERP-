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
  ExternalLink,
  Loader2,
  Package,
  PhoneOff,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserX,
} from "lucide-react"

import { AgentChat } from "@/components/agent/agent-chat"
import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/ui/kpi-card"
import { PageHeader } from "@/components/ui/page-header"

/**
 * The AI Briefing dashboard.
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
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

  return (
    <AppShell title="AI Briefing" breadcrumbs={[{ label: "AI Copilot" }]}>
      <div className="space-y-6 pb-6">
        {/* Page Header */}
        <PageHeader
          title="Executive Intelligence & Copilot"
          description="Live computed briefing from real-time operations data, with an AI agent alongside to act on findings."
          actions={
            <div className="flex items-center gap-2">
              {briefing ? (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Generated {new Date(briefing.generatedAt).toLocaleTimeString()}
                </span>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          }
        />

        {/* 4 Core Summary KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Revenue This Month"
            value={money(sales?.revenueThisMonth ?? 0)}
            description={
              monthDelta === null
                ? `${sales?.ordersThisMonth ?? 0} orders booked`
                : `${monthDelta >= 0 ? "+" : ""}${monthDelta.toFixed(0)}% vs same point last month`
            }
            icon={TrendingUp}
            change={
              monthDelta !== null
                ? {
                    value: `${monthDelta >= 0 ? "+" : ""}${monthDelta.toFixed(0)}%`,
                    isPositive: monthDelta >= 0,
                  }
                : undefined
            }
          />
          <KpiCard
            title="Overdue Receivables"
            value={money(briefing?.receivables.overdueValue ?? 0)}
            description={`${briefing?.receivables.overdueCount ?? 0} invoices past due terms`}
            icon={CircleDollarSign}
          />
          <KpiCard
            title="Accounts Going Quiet"
            value={String(briefing?.customers.lapsingCount ?? 0)}
            description={`${money(briefing?.customers.valueAtRisk ?? 0)} / mo revenue at risk`}
            icon={PhoneOff}
          />
          <KpiCard
            title="Below Reorder Level"
            value={String(briefing?.stock.belowReorderCount ?? 0)}
            description={`${briefing?.stock.outOfStockCount ?? 0} items completely out of stock`}
            icon={Package}
          />
        </div>

        {/* Two Column Layout: Briefing Insights vs Agent Assistant */}
        <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
          <div className="space-y-6">
            {/* Attention Focus Card */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">Action Required</CardTitle>
                    <CardDescription>
                      Ranked across customer complaints, overdue receivables, and lapsed accounts.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {briefing?.focus.length || 0} items
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {!briefing?.focus.length ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {loading ? "Computing priorities…" : "No urgent action items requiring attention."}
                  </div>
                ) : (
                  briefing.focus.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-xs transition-all hover:bg-muted/30"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{item.title}</p>
                          {item.customer && (
                            <Badge variant="outline" className="text-[10px] font-medium shrink-0">
                              {item.customer}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div className="pt-2 flex justify-end">
                  <Link
                    href="/crm"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Open CRM to take action
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Debtors and Inactive Accounts Row */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Worst Debtors */}
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    Worst Debtors
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!briefing?.receivables.worst.length ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No overdue invoices.</p>
                  ) : (
                    briefing.receivables.worst.map((invoice) => (
                      <div
                        key={invoice.invoiceNumber}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 p-2.5 text-xs transition-all hover:bg-muted/40"
                      >
                        <div className="min-w-0 truncate">
                          <p className="font-medium text-foreground truncate">{invoice.customer || "Unknown Customer"}</p>
                          <p className="text-[11px] text-muted-foreground">{invoice.invoiceNumber} • {invoice.daysOverdue} days overdue</p>
                        </div>
                        <span className="shrink-0 font-bold text-rose-600 dark:text-rose-400">{money(invoice.outstanding)}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Lapsing Accounts */}
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    Going Quiet
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!briefing?.customers.lapsing.length ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      All active accounts ordering on normal cadence.
                    </p>
                  ) : (
                    briefing.customers.lapsing.map((account) => (
                      <div
                        key={account.customer}
                        className="rounded-lg border border-border/50 bg-muted/20 p-2.5 text-xs transition-all hover:bg-muted/40"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{account.customer}</span>
                          <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10">
                            {account.daysSinceLastOrder}d silent
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Cadence was every {account.usualGapDays} days
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Agent Automation History */}
            {briefing?.agent.recentRuns.length ? (
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Bot className="h-4 w-4 text-primary" />
                    Recent Agent Automations & Runs
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {briefing.agent.recentRuns.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 truncate">
                        <Badge
                          variant="outline"
                          className={
                            run.status === "succeeded"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]"
                              : "text-[10px]"
                          }
                        >
                          {run.status}
                        </Badge>
                        <span className="font-medium text-foreground truncate">
                          {run.persona}: {run.trigger}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {new Date(run.startedAt).toLocaleString("en-AU", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Right Column: AI Operations Agent Chat */}
          <Card className="flex h-[720px] flex-col border-border shadow-sm">
            <CardHeader className="p-4 pb-3 border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Ask SupplySure Copilot
              </CardTitle>
              <CardDescription>
                The agent has direct access to live operational context and can execute workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-4">
              <AgentChat
                compact
                threadKey="dashboard"
                suggestions={[
                  "Brief me on today's operations",
                  "Who should I chase for receivables and what do I say?",
                  "What products need reordering immediately?",
                  "Draft a re-engagement email for lapsing customers",
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
