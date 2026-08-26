"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, Plus } from "lucide-react"

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

const typeColors: Record<string, string> = {
  asset: "bg-blue-100 text-blue-700",
  liability: "bg-orange-100 text-orange-700",
  equity: "bg-violet-100 text-violet-700",
  revenue: "bg-emerald-100 text-emerald-700",
  expense: "bg-rose-100 text-rose-700",
}

// Throws on failure rather than returning an empty list, so a page
// cannot show "nothing here" when it means "could not ask".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchJson = (path: string) => fetchList<any>(path)

export default function LedgerPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [journals, setJournals] = useState<JournalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
        {loadError ? <LoadError message={loadError} /> : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">General Ledger</h1>
            <p className="text-muted-foreground">
              Posted journal entries, live account balances, and manual double-entry adjustments.
            </p>
          </div>
          <Card className="w-full lg:max-w-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Post manual journal</CardTitle>
              <CardDescription>Use this for accruals, adjustments, write-offs, and finance corrections.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
              <Input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              />
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
                      {account.code} · {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      {account.code} · {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Amount"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              />
              <Button onClick={createJournal} disabled={saving}>
                <Plus className="mr-2 h-4 w-4" />
                {saving ? "Posting..." : "Post Journal"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Posted debits</p><p className="text-2xl font-bold">{formatCurrency(metrics.totalDebits)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Posted credits</p><p className="text-2xl font-bold">{formatCurrency(metrics.totalCredits)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Active accounts</p><p className="text-2xl font-bold">{metrics.activeAccounts}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Net movement</p><p className="text-2xl font-bold">{formatCurrency(metrics.netMovement)}</p></CardContent></Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Account balances
              </CardTitle>
              <CardDescription>The live chart balance after posted journals.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Loading ledger balances...</div>
              ) : (
                accounts.map((account) => (
                  <div key={account.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{account.code} · {account.name}</p>
                        <Badge className={typeColors[account.accountType] || "bg-slate-100 text-slate-700"}>
                          {account.accountType}
                        </Badge>
                      </div>
                      <p className="font-semibold">{formatCurrency(account.balance)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent journal entries</CardTitle>
              <CardDescription>Posted and draft journals with the line-level posting detail.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Loading journals...
                      </TableCell>
                    </TableRow>
                  ) : journals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No journal entries yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    journals.map((journal) => (
                      <TableRow key={journal.id}>
                        <TableCell className="font-mono text-xs">{journal.entryNumber}</TableCell>
                        <TableCell>{formatDate(journal.date)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{journal.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {(journal.lines || [])
                              .map((line) => `${line.account?.code || ""} ${line.account?.name || ""}`.trim())
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={journal.status === "posted" ? "default" : "outline"}>
                            {journal.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(journal.totalDebit)}</TableCell>
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
