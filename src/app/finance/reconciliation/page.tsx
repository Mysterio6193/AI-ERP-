"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, RefreshCcw } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import { describeLoadError, fetchList } from "@/lib/client/fetch-list"
import { LoadError } from "@/components/ui/load-error"

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

const statusColors: Record<string, string> = {
  balanced: "bg-emerald-100 text-emerald-700",
  review_required: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  draft: "bg-slate-100 text-slate-700",
}

// Throws on failure rather than returning an empty list, so a page
// cannot show "nothing here" when it means "could not ask".
const fetchJson = (path: string) => fetchList<any>(path)

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
      } catch (error) {
        // The helper throws now, so a failed load lands here instead of
        // painting an empty ledger that looks like real data.
        setLoadError(describeLoadError(error))
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
        {loadError ? <LoadError message={loadError} /> : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bank Reconciliation</h1>
            <p className="text-muted-foreground">
              Match imported or manually-entered bank transactions against invoices, expenses, and statement balances.
            </p>
          </div>
          <Card className="w-full lg:max-w-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Start reconciliation</CardTitle>
              <CardDescription>Create a balancing session for a statement date or period.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Select
                value={form.bankAccountId}
                onValueChange={(value) => setForm((current) => ({ ...current, bankAccountId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bank account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {account.bankName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={form.statementDate}
                onChange={(event) => setForm((current) => ({ ...current, statementDate: event.target.value }))}
              />
              <Input
                type="date"
                value={form.periodStart}
                onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))}
              />
              <Input
                type="date"
                value={form.periodEnd}
                onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value }))}
              />
              <Input
                placeholder="Statement balance"
                value={form.statementBalance}
                onChange={(event) => setForm((current) => ({ ...current, statementBalance: event.target.value }))}
              />
              <Button onClick={handleCreateSession} disabled={saving}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {saving ? "Creating..." : "Create Session"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Balanced sessions</p><p className="text-2xl font-bold">{totals.balanced}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Need review</p><p className="text-2xl font-bold">{totals.reviewRequired}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Open difference</p><p className="text-2xl font-bold">{formatCurrency(totals.openDifference)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Unmatched transactions</p><p className="text-2xl font-bold">{totals.unmatchedTransactions}</p></CardContent></Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Reconciliation sessions</CardTitle>
                <CardDescription>Every statement balancing run is tracked here.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => void reload()}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        Loading reconciliation...
                      </TableCell>
                    </TableRow>
                  ) : sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        No reconciliation sessions yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>{formatDate(session.statementDate)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{session.bankAccount?.name || "Bank account"}</div>
                          <div className="text-xs text-muted-foreground">
                            Statement {formatCurrency(session.statementBalance)} · System {formatCurrency(session.systemBalance)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[session.status] || "bg-slate-100 text-slate-700"}>
                            {session.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(session.difference)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Unmatched bank lines</CardTitle>
              <CardDescription>These transactions still need invoice or expense matching.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {transactions.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No unmatched transactions right now.
                </div>
              ) : (
                transactions.slice(0, 8).map((transaction) => (
                  <div key={transaction.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {transaction.bankAccount?.name || "Bank account"} · {formatDate(transaction.transactionDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${transaction.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {formatCurrency(transaction.amount)}
                        </p>
                        <Badge variant="outline">{transaction.status}</Badge>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
