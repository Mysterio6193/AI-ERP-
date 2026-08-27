"use client"

import { useEffect, useMemo, useState } from "react"
import { Landmark, Plus } from "lucide-react"

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
import { ACCOUNT_TYPES, formatCurrency } from "@/lib/types"
import { LoadError } from "@/components/ui/load-error"
import { describeLoadError } from "@/lib/client/fetch-list"

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

const typeColors: Record<string, string> = {
  asset: "bg-blue-100 text-blue-700",
  liability: "bg-orange-100 text-orange-700",
  equity: "bg-violet-100 text-violet-700",
  revenue: "bg-emerald-100 text-emerald-700",
  expense: "bg-rose-100 text-rose-700",
}

async function fetchAccounts() {
  const response = await fetch("/api/accounting/chart-of-accounts")
  const payload = await response.json()
  // Throwing rather than returning [] — a failed request must not be
  // indistinguishable from a genuinely empty list.
  if (!payload?.success) {
    throw new Error(payload?.error || `Could not load this data (HTTP ${response.status}).`)
  }

  return payload.data || []
}

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
      } catch (error) {
        setLoadError(describeLoadError(error))
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
        {loadError ? <LoadError message={loadError} /> : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
            <p className="text-muted-foreground">
              Core accounting structure for receivables, payables, tax, banking, revenue, and operating costs.
            </p>
          </div>
          <Card className="w-full lg:max-w-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Add account</CardTitle>
              <CardDescription>Create custom accounts alongside the live system defaults.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Code"
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              />
              <Input
                placeholder="Account name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
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
              <Select
                value={form.normalSide}
                onValueChange={(value) => setForm((current) => ({ ...current, normalSide: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Normal side" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Subtype"
                value={form.subType}
                onChange={(event) => setForm((current) => ({ ...current, subType: event.target.value }))}
              />
              <Button onClick={handleCreateAccount} disabled={saving}>
                <Plus className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Create Account"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {grouped.map((group) => (
            <Card key={group.value}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">{group.label}</p>
                  <p className="text-xl font-bold">{group.count}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(group.balance)}</p>
                </div>
                <div className={`rounded-lg p-2 ${typeColors[group.value] || "bg-slate-100 text-slate-700"}`}>
                  <Landmark className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account list</CardTitle>
            <CardDescription>These accounts feed journals, reconciliation matching, and exports.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Normal side</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Loading chart of accounts...
                    </TableCell>
                  </TableRow>
                ) : accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No accounts available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-mono">{account.code}</TableCell>
                      <TableCell>
                        <div className="font-medium">{account.name}</div>
                        <div className="text-xs text-muted-foreground">{account.subType || "General"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={typeColors[account.accountType] || "bg-slate-100 text-slate-700"}>
                          {account.accountType}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{account.normalSide}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {account.isSystem ? "System" : "Custom"} · {account.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(account.balance)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
