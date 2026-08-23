"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Landmark,
  Plus,
  RefreshCcw,
  Scale,
  Wallet,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { KpiCard } from "@/components/ui/kpi-card"
import { PageHeader } from "@/components/ui/page-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatDate } from "@/lib/types"

interface BankAccountRow {
  id: string
  name: string
  bankName: string
  currentBalance: number
}

interface SessionRow {
  id: string
  statementDate: string
  statementBalance: number
  systemBalance: number
  difference: number
  matchedCount: number
  unmatchedCount: number
  status: string
  bankAccount?: BankAccountRow | null
}

interface TransactionRow {
  id: string
  transactionDate: string
  description: string
  amount: number
  status: string
  bankAccount?: BankAccountRow | null
}

const sessionStatusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  balanced: "default",
  review_required: "destructive",
  in_progress: "secondary",
  draft: "outline",
}

async function fetchJson(path: string) {
  const response = await fetch(path)
  const payload = await response.json()
  return payload.success ? payload.data || [] : []
}

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    bankAccountId: "",
    statementDate: new Date().toISOString().slice(0, 10),
    periodStart: "",
    periodEnd: "",
    statementBalance: "",
    notes: "",
  })

  useEffect(() => {
    async function load() {
      try {
        const [nextAccounts, nextSessions, nextTransactions] = await Promise.all([
          fetchJson("/api/accounting/bank-accounts"),
          fetchJson("/api/accounting/reconciliation"),
          fetchJson("/api/accounting/bank-transactions?status=unmatched"),
        ])
        setAccounts(nextAccounts)
        setSessions(nextSessions)
        setTransactions(nextTransactions)
        setForm((current) => ({
          ...current,
          bankAccountId: current.bankAccountId || nextAccounts[0]?.id || "",
        }))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const totals = useMemo(() => {
    return {
      balanced: sessions.filter((session) => session.status === "balanced").length,
      reviewRequired: sessions.filter((session) => session.status === "review_required").length,
      openDifference: sessions.reduce((sum, session) => sum + Math.abs(Number(session.difference || 0)), 0),
      unmatchedTransactions: transactions.length,
    }
  }, [sessions, transactions])

  async function reload() {
    const [nextSessions, nextTransactions] = await Promise.all([
      fetchJson("/api/accounting/reconciliation"),
      fetchJson("/api/accounting/bank-transactions?status=unmatched"),
    ])
    setSessions(nextSessions)
    setTransactions(nextTransactions)
  }

  async function handleCreateSession() {
    if (!form.bankAccountId || !form.statementBalance) return

    try {
      setSaving(true)
      const response = await fetch("/api/accounting/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          statementBalance: Number(form.statementBalance),
        }),
      })
      const payload = await response.json()
      if (!payload.success) {
        throw new Error(payload.error || "Failed to create reconciliation")
      }
      await reload()
      setForm((current) => ({
        ...current,
        statementBalance: "",
        notes: "",
      }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell
      title="Bank Reconciliation"
      breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Reconciliation" }]}
    >
      <div className="space-y-6">
        <PageHeader
          title="Bank Reconciliation"
          description="Match bank statement entries with invoices, expenses, and ledger postings to ensure accounting accuracy."
          actions={
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          }
        />

        {/* Metrics Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Balanced Sessions"
            value={loading ? "..." : totals.balanced}
            description="Fully matched statements"
            icon={CheckCircle2}
          />
          <KpiCard
            title="Action Required"
            value={loading ? "..." : totals.reviewRequired}
            description="Sessions needing review"
            icon={AlertCircle}
          />
          <KpiCard
            title="Open Difference"
            value={loading ? "..." : formatCurrency(totals.openDifference)}
            description="Total unaligned variance"
            icon={Scale}
          />
          <KpiCard
            title="Unmatched Bank Lines"
            value={loading ? "..." : totals.unmatchedTransactions}
            description="Transactions awaiting match"
            icon={Clock}
          />
        </div>

        {/* Create Reconciliation Form */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Start Reconciliation Run</CardTitle>
            <CardDescription>Initiate a statement balancing session for a designated period and target bank account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bank Account</label>
              <Select
                value={form.bankAccountId}
                onValueChange={(value) => setForm((current) => ({ ...current, bankAccountId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} • {account.bankName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statement Date</label>
              <Input
                type="date"
                value={form.statementDate}
                onChange={(event) => setForm((current) => ({ ...current, statementDate: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Period Start</label>
              <Input
                type="date"
                value={form.periodStart}
                onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Period End</label>
              <Input
                type="date"
                value={form.periodEnd}
                onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statement Balance</label>
              <div className="flex gap-2">
                <Input
                  placeholder="0.00"
                  type="number"
                  value={form.statementBalance}
                  onChange={(event) => setForm((current) => ({ ...current, statementBalance: event.target.value }))}
                />
                <Button onClick={handleCreateSession} disabled={saving} className="shrink-0">
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {saving ? "Creating..." : "Run"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sessions & Unmatched Bank Lines Layout */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Reconciliation Sessions Table */}
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Reconciliation Sessions</CardTitle>
                <CardDescription>Statement balancing runs and audited discrepancy records.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/80 hover:bg-transparent">
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Account & Balances</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="text-right w-28">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8">
                        <EmptyState
                          icon={RefreshCcw}
                          title="Loading sessions..."
                          description="Retrieving reconciliation history."
                          className="min-h-[160px] border-0"
                        />
                      </TableCell>
                    </TableRow>
                  ) : sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8">
                        <EmptyState
                          icon={CheckCircle2}
                          title="No reconciliation sessions"
                          description="Start a reconciliation run using the form above."
                          className="min-h-[160px] border-0"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    sessions.map((session) => (
                      <TableRow key={session.id} className="border-border/60 hover:bg-muted/40">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(session.statementDate)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground text-sm">{session.bankAccount?.name || "Bank Account"}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Statement: {formatCurrency(session.statementBalance)} • System: {formatCurrency(session.systemBalance)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={sessionStatusVariants[session.status] || "secondary"} className="text-[10px] uppercase">
                            {session.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-semibold text-sm ${session.difference === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                          {formatCurrency(session.difference)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Unmatched Bank Lines */}
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Unmatched Bank Transactions</CardTitle>
              <CardDescription>Bank feed rows requiring invoice or expense settlement match.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {transactions.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="All bank transactions matched"
                  description="No unmatched bank transactions found in the feed."
                  className="min-h-[200px]"
                />
              ) : (
                transactions.slice(0, 8).map((transaction) => {
                  const isPositive = transaction.amount >= 0
                  return (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-medium text-foreground">{transaction.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {transaction.bankAccount?.name || "Settlement"} • {formatDate(transaction.transactionDate)}
                        </p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <p className={`text-sm font-semibold whitespace-nowrap ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {isPositive ? `+${formatCurrency(transaction.amount)}` : formatCurrency(transaction.amount)}
                        </p>
                        <Badge variant="outline" className="text-[10px]">
                          {transaction.status}
                        </Badge>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

