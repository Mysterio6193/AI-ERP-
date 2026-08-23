"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  RefreshCcw,
  Upload,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  accountNumber: string
  currentBalance: number
  status: string
  provider?: string | null
  connectionStatus: string
  currency: string
  _count?: {
    transactions: number
    reconciliations: number
  }
}

interface TransactionRow {
  id: string
  transactionDate: string
  description: string
  amount: number
  status: string
  source: string
  bankAccount?: {
    name: string
  } | null
}

interface SessionRow {
  id: string
  statementDate: string
  difference: number
  status: string
  bankAccount?: {
    name: string
  } | null
}

interface DocumentRow {
  id: string
  documentType: string
  title: string
  status: string
  source: string
  createdAt: string
}

async function fetchJson(path: string) {
  const response = await fetch(path)
  const payload = await response.json()
  return payload.success ? payload.data || [] : []
}

export default function BankingPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingTransaction, setSavingTransaction] = useState(false)
  const [savingDocument, setSavingDocument] = useState(false)
  const [accountForm, setAccountForm] = useState({
    name: "",
    bankName: "",
    accountNumber: "",
    currency: "AUD",
    provider: "manual",
  })
  const [transactionForm, setTransactionForm] = useState({
    bankAccountId: "",
    transactionDate: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    direction: "money_in",
    source: "manual",
  })
  const [documentForm, setDocumentForm] = useState({
    documentType: "bank_statement",
    title: "",
    fileName: "",
    source: "manual",
  })

  useEffect(() => {
    async function load() {
      try {
        const [nextAccounts, nextTransactions, nextSessions, nextDocuments] = await Promise.all([
          fetchJson("/api/accounting/bank-accounts"),
          fetchJson("/api/accounting/bank-transactions"),
          fetchJson("/api/accounting/reconciliation"),
          fetchJson("/api/accounting/documents"),
        ])
        setAccounts(nextAccounts)
        setTransactions(nextTransactions)
        setSessions(nextSessions)
        setDocuments(nextDocuments)
        setTransactionForm((current) => ({
          ...current,
          bankAccountId: current.bankAccountId || nextAccounts[0]?.id || "",
        }))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const metrics = useMemo(() => {
    return {
      totalBankBalance: accounts.reduce((sum, account) => sum + Number(account.currentBalance || 0), 0),
      unmatchedTransactions: transactions.filter((transaction) => transaction.status !== "matched").length,
      reconciledSessions: sessions.filter((session) => session.status === "balanced").length,
      importedDocs: documents.filter((document) => document.source !== "manual").length,
    }
  }, [accounts, documents, sessions, transactions])

  async function reload() {
    const [nextAccounts, nextTransactions, nextSessions, nextDocuments] = await Promise.all([
      fetchJson("/api/accounting/bank-accounts"),
      fetchJson("/api/accounting/bank-transactions"),
      fetchJson("/api/accounting/reconciliation"),
      fetchJson("/api/accounting/documents"),
    ])
    setAccounts(nextAccounts)
    setTransactions(nextTransactions)
    setSessions(nextSessions)
    setDocuments(nextDocuments)
  }

  async function saveBankAccount() {
    if (!accountForm.name || !accountForm.bankName || !accountForm.accountNumber) return
    try {
      setSavingAccount(true)
      await fetch("/api/accounting/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountForm),
      })
      await reload()
      setAccountForm({
        name: "",
        bankName: "",
        accountNumber: "",
        currency: "AUD",
        provider: "manual",
      })
    } finally {
      setSavingAccount(false)
    }
  }

  async function saveTransaction() {
    if (!transactionForm.bankAccountId || !transactionForm.description || !transactionForm.amount) return
    try {
      setSavingTransaction(true)
      await fetch("/api/accounting/bank-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...transactionForm,
          amount: Number(transactionForm.amount),
        }),
      })
      await reload()
      setTransactionForm((current) => ({
        ...current,
        description: "",
        amount: "",
      }))
    } finally {
      setSavingTransaction(false)
    }
  }

  async function saveDocument(overrides?: Partial<typeof documentForm> & { status?: string }) {
    const payload = { ...documentForm, ...overrides }
    if (!payload.title) return
    try {
      setSavingDocument(true)
      await fetch("/api/accounting/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      await reload()
      setDocumentForm({
        documentType: "bank_statement",
        title: "",
        fileName: "",
        source: "manual",
      })
    } finally {
      setSavingDocument(false)
    }
  }

  return (
    <AppShell title="Banking & Reconciliation" breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Banking" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Banking & Feeds"
          description="Manage settlement accounts, imported bank statements, live bank lines, and reconciliation readiness."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void reload()}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button size="sm" asChild>
                <Link href="/finance/reconciliation">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Open Reconciliation
                </Link>
              </Button>
            </div>
          }
        />

        {/* Metrics Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Bank Balance"
            value={loading ? "..." : formatCurrency(metrics.totalBankBalance)}
            description={`${accounts.length} connected accounts`}
            icon={Landmark}
          />
          <KpiCard
            title="Unmatched Bank Lines"
            value={loading ? "..." : metrics.unmatchedTransactions}
            description="Transactions needing match"
            icon={ArrowDownLeft}
          />
          <KpiCard
            title="Balanced Sessions"
            value={loading ? "..." : metrics.reconciledSessions}
            description="Reconciled statement runs"
            icon={CheckCircle2}
          />
          <KpiCard
            title="Imported Documents"
            value={loading ? "..." : metrics.importedDocs}
            description="External feeds & files"
            icon={FileText}
          />
        </div>

        <Tabs defaultValue="accounts" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-muted/60 p-1">
            <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
            <TabsTrigger value="transactions">Bank Feed</TabsTrigger>
            <TabsTrigger value="documents">Imports & Exports</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          </TabsList>

          {/* TAB 1: Bank Accounts */}
          <TabsContent value="accounts" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Connected Bank Accounts</CardTitle>
                  <CardDescription>Accounts powering cash movement tracking and ledger reconciliation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? (
                    <EmptyState
                      icon={Landmark}
                      title="Loading bank accounts..."
                      description="Retrieving connected bank settlement accounts."
                      className="min-h-[220px]"
                    />
                  ) : accounts.length === 0 ? (
                    <EmptyState
                      icon={Building2}
                      title="No bank accounts added"
                      description="Add your company bank account using the form on the right."
                      className="min-h-[220px]"
                    />
                  ) : (
                    accounts.map((account) => (
                      <div
                        key={account.id}
                        className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Landmark className="h-4 w-4 text-primary shrink-0" />
                              <p className="font-semibold text-foreground truncate">{account.name}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {account.bankName} • Account: <span className="font-mono">{account.accountNumber}</span> • {account.currency}
                            </p>
                          </div>
                          <div className="text-right shrink-0 space-y-1">
                            <p className="text-lg font-bold text-foreground">{formatCurrency(account.currentBalance)}</p>
                            <Badge variant={account.connectionStatus === "connected" ? "default" : "outline"} className="text-xs">
                              {account.connectionStatus}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                          <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                            {account._count?.transactions || 0} transactions
                          </span>
                          <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                            {account._count?.reconciliations || 0} reconciliations
                          </span>
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            Provider: {account.provider || "manual"}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Add Bank Account</CardTitle>
                  <CardDescription>Register a new settlement account for cash management.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Label</label>
                    <Input
                      placeholder="e.g. Operating Main Account"
                      value={accountForm.name}
                      onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bank Institution</label>
                    <Input
                      placeholder="e.g. Commonwealth Bank / Chase"
                      value={accountForm.bankName}
                      onChange={(event) => setAccountForm((current) => ({ ...current, bankName: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Number / IBAN</label>
                    <Input
                      placeholder="e.g. 1234 5678 9012"
                      value={accountForm.accountNumber}
                      onChange={(event) => setAccountForm((current) => ({ ...current, accountNumber: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Currency</label>
                      <Select value={accountForm.currency} onValueChange={(value) => setAccountForm((current) => ({ ...current, currency: value }))}>
                        <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AUD">AUD ($)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                          <SelectItem value="INR">INR (₹)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provider Mode</label>
                      <Select value={accountForm.provider} onValueChange={(value) => setAccountForm((current) => ({ ...current, provider: value }))}>
                        <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual Entry</SelectItem>
                          <SelectItem value="xero">Xero Sync</SelectItem>
                          <SelectItem value="bank_feed">Live Bank Feed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={saveBankAccount} disabled={savingAccount} className="w-full">
                    <Building2 className="mr-2 h-4 w-4" />
                    {savingAccount ? "Saving Account..." : "Save Bank Account"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 2: Bank Feed */}
          <TabsContent value="transactions" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Bank Transactions</CardTitle>
                  <CardDescription>Manual lines, statement uploads, and live bank-feed transactions.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/80 hover:bg-transparent">
                        <TableHead className="w-28">Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead className="text-right w-28">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8">
                            <EmptyState
                              icon={Wallet}
                              title="No bank transactions"
                              description="Add transaction lines manually or upload statements."
                              className="min-h-[160px] border-0"
                            />
                          </TableCell>
                        </TableRow>
                      ) : (
                        transactions.map((transaction) => {
                          const isPositive = transaction.amount >= 0
                          return (
                            <TableRow key={transaction.id} className="border-border/60 hover:bg-muted/40">
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(transaction.transactionDate)}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-foreground text-sm">{transaction.description}</div>
                                <div className="text-[11px] text-muted-foreground capitalize">Source: {transaction.source}</div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {transaction.bankAccount?.name || "Settlement"}
                              </TableCell>
                              <TableCell>
                                <Badge variant={transaction.status === "matched" ? "default" : "secondary"} className="text-[11px]">
                                  {transaction.status}
                                </Badge>
                              </TableCell>
                              <TableCell className={`text-right font-semibold text-sm whitespace-nowrap ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                {isPositive ? `+${formatCurrency(transaction.amount)}` : formatCurrency(transaction.amount)}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Post Bank Line</CardTitle>
                  <CardDescription>Manually log a money-in or money-out bank transaction.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Bank Account</label>
                    <Select value={transactionForm.bankAccountId} onValueChange={(value) => setTransactionForm((current) => ({ ...current, bankAccountId: value }))}>
                      <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} ({account.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</label>
                    <Input type="date" value={transactionForm.transactionDate} onChange={(event) => setTransactionForm((current) => ({ ...current, transactionDate: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description / Reference</label>
                    <Input placeholder="e.g. Customer Invoice INV-1002 payment" value={transactionForm.description} onChange={(event) => setTransactionForm((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</label>
                    <Input type="number" placeholder="0.00" value={transactionForm.amount} onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Flow Direction</label>
                      <Select value={transactionForm.direction} onValueChange={(value) => setTransactionForm((current) => ({ ...current, direction: value }))}>
                        <SelectTrigger><SelectValue placeholder="Direction" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="money_in">Money In (+)</SelectItem>
                          <SelectItem value="money_out">Money Out (-)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source</label>
                      <Select value={transactionForm.source} onValueChange={(value) => setTransactionForm((current) => ({ ...current, source: value }))}>
                        <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual Entry</SelectItem>
                          <SelectItem value="import">Statement Import</SelectItem>
                          <SelectItem value="bank_feed">Bank Feed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={saveTransaction} disabled={savingTransaction} className="w-full">
                    <Wallet className="mr-2 h-4 w-4" />
                    {savingTransaction ? "Saving Transaction..." : "Save Bank Transaction"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 3: Documents & Registers */}
          <TabsContent value="documents" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Import and Export Register</CardTitle>
                  <CardDescription>Statement imports, receipts, supplier bills, and external accounting exports.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {documents.length === 0 ? (
                    <EmptyState
                      icon={FileText}
                      title="No finance documents"
                      description="Logged imports and exports will appear in this audit register."
                      className="min-h-[220px]"
                    />
                  ) : (
                    documents.map((document) => (
                      <div key={document.id} className="rounded-lg border border-border bg-card p-3.5 transition-colors hover:bg-muted/30">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <p className="font-semibold text-foreground truncate">{document.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Type: <span className="capitalize">{document.documentType.replace(/_/g, " ")}</span> • Source: {document.source}
                            </p>
                          </div>
                          <div className="text-right shrink-0 space-y-1">
                            <Badge variant="outline" className="text-xs">{document.status}</Badge>
                            <p className="text-[11px] text-muted-foreground">{formatDate(document.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Register Document or Export</CardTitle>
                  <CardDescription>Log imports or generate external audit records.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Type</label>
                    <Select value={documentForm.documentType} onValueChange={(value) => setDocumentForm((current) => ({ ...current, documentType: value }))}>
                      <SelectTrigger><SelectValue placeholder="Document type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_statement">Bank Statement (CSV/OFX)</SelectItem>
                        <SelectItem value="bill">Supplier Bill</SelectItem>
                        <SelectItem value="receipt">Receipt</SelectItem>
                        <SelectItem value="export">Accounting Export</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Title</label>
                    <Input placeholder="e.g. March 2026 CBA Statement" value={documentForm.title} onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">File Reference</label>
                    <Input placeholder="e.g. statement_march_2026.csv" value={documentForm.fileName} onChange={(event) => setDocumentForm((current) => ({ ...current, fileName: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source</label>
                    <Select value={documentForm.source} onValueChange={(value) => setDocumentForm((current) => ({ ...current, source: value }))}>
                      <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual Entry</SelectItem>
                        <SelectItem value="import">File Import</SelectItem>
                        <SelectItem value="export">System Export</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 pt-2">
                    <Button variant="outline" onClick={() => void saveDocument()} disabled={savingDocument}>
                      <Upload className="mr-2 h-4 w-4" />
                      {savingDocument ? "Registering..." : "Register Import"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void saveDocument({ documentType: "export", source: "export", status: "exported" })}
                      disabled={savingDocument}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Register Export
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 4: Reconciliation History */}
          <TabsContent value="reconciliation" className="space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Reconciliation Sessions</CardTitle>
                  <CardDescription>Historical reconciliation runs and statement balances.</CardDescription>
                </div>
                <Button size="sm" asChild>
                  <Link href="/finance/reconciliation">
                    Open Full Reconciliation
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="No reconciliation sessions yet"
                    description="Create a reconciliation session to balance bank statements with system ledger lines."
                    action={
                      <Button size="sm" asChild>
                        <Link href="/finance/reconciliation">Go to Reconciliation</Link>
                      </Button>
                    }
                    className="min-h-[220px]"
                  />
                ) : (
                  sessions.map((session) => (
                    <div key={session.id} className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">{session.bankAccount?.name || "Bank Account"}</p>
                          <p className="text-xs text-muted-foreground">Statement Date: {formatDate(session.statementDate)}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="font-semibold text-foreground">Difference: {formatCurrency(session.difference)}</p>
                          <Badge variant={session.status === "balanced" ? "default" : "secondary"}>
                            {session.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}

