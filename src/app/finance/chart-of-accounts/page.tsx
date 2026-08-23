"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DollarSign,
  Landmark,
  Plus,
  RefreshCcw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
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
import { ACCOUNT_TYPES, formatCurrency } from "@/lib/types"

interface AccountRow {
  id: string
  code: string
  name: string
  accountType: string
  subType?: string | null
  balance: number
  normalSide: string
  isSystem: boolean
  status: string
}

const typeBadgeStyles: Record<string, { bg: string; text: string; border: string }> = {
  asset: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20" },
  liability: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
  equity: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/20" },
  revenue: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" },
  expense: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/20" },
}

async function fetchAccounts() {
  const response = await fetch("/api/accounting/chart-of-accounts")
  const payload = await response.json()
  return payload.success ? payload.data || [] : []
}

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    code: "",
    name: "",
    accountType: "asset",
    subType: "",
    normalSide: "debit",
  })

  useEffect(() => {
    async function load() {
      try {
        setAccounts(await fetchAccounts())
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const grouped = useMemo(() => {
    return ACCOUNT_TYPES.map((type) => ({
      ...type,
      count: accounts.filter((account) => account.accountType === type.value).length,
      balance: accounts
        .filter((account) => account.accountType === type.value)
        .reduce((sum, account) => sum + Number(account.balance || 0), 0),
    }))
  }, [accounts])

  async function handleCreateAccount() {
    if (!form.code.trim() || !form.name.trim()) return

    try {
      setSaving(true)
      const response = await fetch("/api/accounting/chart-of-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const payload = await response.json()
      if (!payload.success) {
        throw new Error(payload.error || "Failed to create account")
      }

      setAccounts(await fetchAccounts())
      setForm({
        code: "",
        name: "",
        accountType: "asset",
        subType: "",
        normalSide: "debit",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell
      title="Chart of Accounts"
      breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Chart of Accounts" }]}
    >
      <div className="space-y-6">
        <PageHeader
          title="Chart of Accounts"
          description="Standard double-entry accounting structure for assets, liabilities, equity, revenue, and operating expenses."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setLoading(true)
                try {
                  setAccounts(await fetchAccounts())
                } finally {
                  setLoading(false)
                }
              }}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Accounts
            </Button>
          }
        />

        {/* Account Types Summary Grid */}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {grouped.map((group) => {
            const style = typeBadgeStyles[group.value] || { bg: "bg-muted", text: "text-foreground", border: "border-border" }
            return (
              <Card key={group.value} className="border-border shadow-sm transition-all hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${style.bg} ${style.text}`}>
                      <Landmark className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold tracking-tight text-foreground">{group.count}</p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      Balance: <span className="text-foreground">{formatCurrency(group.balance)}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          {/* Accounts Table Card */}
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Account Ledger Structure</CardTitle>
              <CardDescription>Accounts available for journals, invoices, reconciliation matching, and exports.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/80 hover:bg-transparent">
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-24">Normal</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="text-right w-28">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8">
                        <EmptyState
                          icon={Landmark}
                          title="Loading chart of accounts..."
                          description="Fetching ledger account records."
                          className="min-h-[160px] border-0"
                        />
                      </TableCell>
                    </TableRow>
                  ) : accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8">
                        <EmptyState
                          icon={Landmark}
                          title="No accounts found"
                          description="Create your first account using the form."
                          className="min-h-[160px] border-0"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((account) => {
                      const style = typeBadgeStyles[account.accountType] || { bg: "bg-muted", text: "text-foreground", border: "border-border" }
                      return (
                        <TableRow key={account.id} className="border-border/60 hover:bg-muted/40">
                          <TableCell className="font-mono text-xs font-semibold text-foreground">
                            {account.code}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground text-sm">{account.name}</div>
                            <div className="text-[11px] text-muted-foreground">{account.subType || "General"}</div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${style.bg} ${style.text} ${style.border}`}>
                              {account.accountType}
                            </span>
                          </TableCell>
                          <TableCell className="capitalize text-xs text-muted-foreground font-medium">
                            {account.normalSide}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {account.isSystem ? (
                                <Badge variant="secondary" className="text-[10px] uppercase font-medium">
                                  System
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] uppercase font-medium">
                                  Custom
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm text-foreground">
                            {formatCurrency(account.balance)}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Add Account Card */}
          <Card className="border-border shadow-sm h-fit">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Create Account</CardTitle>
              <CardDescription>Add custom sub-accounts alongside system defaults.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Code</label>
                <Input
                  placeholder="e.g. 1010, 2020, 4010"
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Name</label>
                <Input
                  placeholder="e.g. Petty Cash, Trade Creditors"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</label>
                  <Select
                    value={form.accountType}
                    onValueChange={(value) => setForm((current) => ({ ...current, accountType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Account type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Normal Side</label>
                  <Select
                    value={form.normalSide}
                    onValueChange={(value) => setForm((current) => ({ ...current, normalSide: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Normal side" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debit">Debit (+)</SelectItem>
                      <SelectItem value="credit">Credit (+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subtype / Category</label>
                <Input
                  placeholder="e.g. Current Asset, Operating Expense"
                  value={form.subType}
                  onChange={(event) => setForm((current) => ({ ...current, subType: event.target.value }))}
                />
              </div>
              <Button onClick={handleCreateAccount} disabled={saving} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                {saving ? "Creating Account..." : "Create Account"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

