"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  RefreshCcw,
  Scale,
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

interface AccountRow {
  id: string
  code: string
  name: string
  accountType: string
  balance: number
}

interface JournalLineRow {
  id: string
  debit: number
  credit: number
  account?: {
    id: string
    code: string
    name: string
  } | null
}

interface JournalRow {
  id: string
  entryNumber: string
  date: string
  description: string
  status: string
  totalDebit: number
  totalCredit: number
  lines: JournalLineRow[]
}

const typeBadgeStyles: Record<string, { bg: string; text: string; border: string }> = {
  asset: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20" },
  liability: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
  equity: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/20" },
  revenue: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" },
  expense: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/20" },
}

async function fetchJson(path: string) {
  const response = await fetch(path)
  const payload = await response.json()
  return payload.success ? payload.data || [] : []
}

export default function LedgerPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [journals, setJournals] = useState<JournalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    description: "",
    date: new Date().toISOString().slice(0, 10),
    debitAccountId: "",
    creditAccountId: "",
    amount: "",
  })

  useEffect(() => {
    async function load() {
      try {
        const [nextAccounts, nextJournals] = await Promise.all([
          fetchJson("/api/accounting/chart-of-accounts"),
          fetchJson("/api/accounting/journals"),
        ])
        setAccounts(nextAccounts)
        setJournals(nextJournals)
        setForm((current) => ({
          ...current,
          debitAccountId: current.debitAccountId || nextAccounts[0]?.id || "",
          creditAccountId: current.creditAccountId || nextAccounts[1]?.id || nextAccounts[0]?.id || "",
        }))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const metrics = useMemo(() => {
    const posted = journals.filter((journal) => journal.status === "posted")
    const totalDebits = posted.reduce((sum, journal) => sum + Number(journal.totalDebit || 0), 0)
    const totalCredits = posted.reduce((sum, journal) => sum + Number(journal.totalCredit || 0), 0)
    const activeAccounts = accounts.filter((account) => Math.abs(Number(account.balance || 0)) > 0)

    return {
      totalDebits,
      totalCredits,
      activeAccounts: activeAccounts.length,
      netMovement: totalCredits - totalDebits,
      isBalanced: totalDebits === totalCredits,
    }
  }, [accounts, journals])

  async function reload() {
    const [nextAccounts, nextJournals] = await Promise.all([
      fetchJson("/api/accounting/chart-of-accounts"),
      fetchJson("/api/accounting/journals"),
    ])
    setAccounts(nextAccounts)
    setJournals(nextJournals)
  }

  async function createJournal() {
    if (
      !form.description.trim() ||
      !form.debitAccountId ||
      !form.creditAccountId ||
      !form.amount ||
      form.debitAccountId === form.creditAccountId
    ) {
      return
    }

    try {
      setSaving(true)
      const amount = Number(form.amount)
      const response = await fetch("/api/accounting/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          date: form.date,
          status: "posted",
          lines: [
            { accountId: form.debitAccountId, debit: amount, credit: 0 },
            { accountId: form.creditAccountId, debit: 0, credit: amount },
          ],
        }),
      })
      const payload = await response.json()
      if (!payload.success) {
        throw new Error(payload.error || "Failed to create journal")
      }

      await reload()
      setForm((current) => ({
        ...current,
        description: "",
        amount: "",
      }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title="General Ledger" breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "General Ledger" }]}>
      <div className="space-y-6">
        <PageHeader
          title="General Ledger"
          description="Posted double-entry journal entries, real-time chart balances, and manual adjustments."
          actions={
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Ledger
            </Button>
          }
        />

        {/* Metrics Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Posted Debits"
            value={loading ? "..." : formatCurrency(metrics.totalDebits)}
            description="Total debits in posted journals"
            icon={ArrowDownLeft}
          />
          <KpiCard
            title="Posted Credits"
            value={loading ? "..." : formatCurrency(metrics.totalCredits)}
            description="Total credits in posted journals"
            icon={ArrowUpRight}
          />
          <KpiCard
            title="Active Accounts"
            value={loading ? "..." : metrics.activeAccounts}
            description={`Out of ${accounts.length} total accounts`}
            icon={BookOpen}
          />
          <KpiCard
            title="Ledger Balance"
            value={loading ? "..." : (metrics.isBalanced ? "In Balance" : formatCurrency(metrics.netMovement))}
            description={metrics.isBalanced ? "Debits equal Credits (₹0 delta)" : `Difference: ${formatCurrency(metrics.netMovement)}`}
            icon={Scale}
          />
        </div>

        {/* Post Journal Form */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Post Manual Journal</CardTitle>
            <CardDescription>Record double-entry adjustments, accruals, write-offs, or correcting entries.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description / Memo</label>
              <Input
                placeholder="e.g. Month-end depreciation adjustment"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</label>
              <Input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Debit Account</label>
              <Select
                value={form.debitAccountId}
                onValueChange={(value) => setForm((current) => ({ ...current, debitAccountId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Debit account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} • {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Credit Account</label>
              <Select
                value={form.creditAccountId}
                onValueChange={(value) => setForm((current) => ({ ...current, creditAccountId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Credit account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} • {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</label>
              <div className="flex gap-2">
                <Input
                  placeholder="0.00"
                  type="number"
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                />
                <Button onClick={createJournal} disabled={saving} className="shrink-0">
                  <Plus className="mr-1.5 h-4 w-4" />
                  {saving ? "Posting..." : "Post"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two Column Layout: Balances & Journal History */}
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Account Balances */}
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <BookOpen className="h-4 w-4 text-primary" />
                Account Balances
              </CardTitle>
              <CardDescription>Live chart account balances reflecting all posted journals.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {loading ? (
                <EmptyState
                  icon={BookOpen}
                  title="Loading balances..."
                  description="Calculating balances from posted ledger entries."
                  className="min-h-[220px]"
                />
              ) : accounts.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No accounts found"
                  description="Initialize chart of accounts to see ledger balances."
                  className="min-h-[220px]"
                />
              ) : (
                accounts.map((account) => {
                  const style = typeBadgeStyles[account.accountType] || { bg: "bg-muted", text: "text-foreground", border: "border-border" }
                  return (
                    <div
                      key={account.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">{account.code}</span>
                          <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize ${style.bg} ${style.text} ${style.border}`}>
                          {account.accountType}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-foreground">
                        {formatCurrency(account.balance)}
                      </span>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* Recent Journal Entries Table */}
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Journal History</CardTitle>
              <CardDescription>Audit log of double-entry postings with line items.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/80 hover:bg-transparent">
                    <TableHead className="w-24">Entry</TableHead>
                    <TableHead className="w-24">Date</TableHead>
                    <TableHead>Description & Postings</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="text-right w-24">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8">
                        <EmptyState
                          icon={FileSpreadsheet}
                          title="Loading journals..."
                          description="Retrieving general ledger records."
                          className="min-h-[160px] border-0"
                        />
                      </TableCell>
                    </TableRow>
                  ) : journals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8">
                        <EmptyState
                          icon={FileSpreadsheet}
                          title="No journal entries"
                          description="Post your first journal entry using the form above."
                          className="min-h-[160px] border-0"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    journals.map((journal) => (
                      <TableRow key={journal.id} className="border-border/60 hover:bg-muted/40">
                        <TableCell className="font-mono text-xs font-semibold text-foreground">
                          {journal.entryNumber}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(journal.date)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground text-sm">{journal.description}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {(journal.lines || [])
                              .map((line) => `${line.account?.code || ""} ${line.account?.name || ""}`.trim())
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={journal.status === "posted" ? "default" : "outline"} className="text-[10px] uppercase">
                            {journal.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm text-foreground">
                          {formatCurrency(journal.totalDebit)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

