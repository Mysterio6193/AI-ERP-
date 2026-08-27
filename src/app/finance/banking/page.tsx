"use client"

import { useEffect, useMemo, useState } from "react"
import { Building2, Download, Plus, Upload, Wallet } from "lucide-react"

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
import { describeLoadError, fetchList } from "@/lib/client/fetch-list"
import { LoadError } from "@/components/ui/load-error"

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

// Throws on failure rather than returning an empty list, so a page
// cannot show "nothing here" when it means "could not ask".
const fetchJson = (path: string) => fetchList<any>(path)

export default function BankingPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
        {loadError ? <LoadError message={loadError} /> : null}

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banking & Reconciliation</h1>
          <p className="text-muted-foreground">
            Manage settlement accounts, imported bank statements, live bank lines, and reconciliation readiness from one place.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total bank balance</p><p className="text-2xl font-bold">{formatCurrency(metrics.totalBankBalance)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Unmatched bank lines</p><p className="text-2xl font-bold">{metrics.unmatchedTransactions}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Balanced sessions</p><p className="text-2xl font-bold">{metrics.reconciledSessions}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Imported docs</p><p className="text-2xl font-bold">{metrics.importedDocs}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
            <TabsTrigger value="transactions">Bank Feed</TabsTrigger>
            <TabsTrigger value="documents">Imports & Exports</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Connected bank accounts</CardTitle>
                  <CardDescription>These accounts power cash movement tracking and reconciliation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Loading bank accounts...</div>
                  ) : (
                    accounts.map((account) => (
                      <div key={account.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium">{account.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {account.bankName} · {account.accountNumber}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(account.currentBalance)}</p>
                            <Badge variant="outline">{account.connectionStatus}</Badge>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{account._count?.transactions || 0} transactions</span>
                          <span>{account._count?.reconciliations || 0} reconciliations</span>
                          <span>{account.provider || "manual"}</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Add bank account</CardTitle>
                  <CardDescription>Use manual mode now, then connect live feeds later from Integrations.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Input placeholder="Account label" value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} />
                  <Input placeholder="Bank name" value={accountForm.bankName} onChange={(event) => setAccountForm((current) => ({ ...current, bankName: event.target.value }))} />
                  <Input placeholder="Account number" value={accountForm.accountNumber} onChange={(event) => setAccountForm((current) => ({ ...current, accountNumber: event.target.value }))} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select value={accountForm.currency} onValueChange={(value) => setAccountForm((current) => ({ ...current, currency: value }))}>
                      <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AUD">AUD</SelectItem>
                        <SelectItem value="INR">INR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={accountForm.provider} onValueChange={(value) => setAccountForm((current) => ({ ...current, provider: value }))}>
                      <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="xero">Xero</SelectItem>
                        <SelectItem value="bank_feed">Bank feed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={saveBankAccount} disabled={savingAccount}>
                    <Building2 className="mr-2 h-4 w-4" />
                    {savingAccount ? "Saving..." : "Save Bank Account"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Bank transactions</CardTitle>
                  <CardDescription>Manual lines, imported statements, and future live bank-feed rows all land here.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                            No bank transactions yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        transactions.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell>{formatDate(transaction.transactionDate)}</TableCell>
                            <TableCell>
                              <div className="font-medium">{transaction.description}</div>
                              <div className="text-xs text-muted-foreground">{transaction.source}</div>
                            </TableCell>
                            <TableCell>{transaction.bankAccount?.name || "Bank account"}</TableCell>
                            <TableCell><Badge variant="outline">{transaction.status}</Badge></TableCell>
                            <TableCell className={`text-right font-medium ${transaction.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {formatCurrency(transaction.amount)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Add bank line</CardTitle>
                  <CardDescription>Useful while waiting for direct bank connections.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Select value={transactionForm.bankAccountId} onValueChange={(value) => setTransactionForm((current) => ({ ...current, bankAccountId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Bank account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={transactionForm.transactionDate} onChange={(event) => setTransactionForm((current) => ({ ...current, transactionDate: event.target.value }))} />
                  <Input placeholder="Description" value={transactionForm.description} onChange={(event) => setTransactionForm((current) => ({ ...current, description: event.target.value }))} />
                  <Input placeholder="Amount" value={transactionForm.amount} onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select value={transactionForm.direction} onValueChange={(value) => setTransactionForm((current) => ({ ...current, direction: value }))}>
                      <SelectTrigger><SelectValue placeholder="Direction" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="money_in">Money in</SelectItem>
                        <SelectItem value="money_out">Money out</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={transactionForm.source} onValueChange={(value) => setTransactionForm((current) => ({ ...current, source: value }))}>
                      <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="import">Import</SelectItem>
                        <SelectItem value="bank_feed">Bank feed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={saveTransaction} disabled={savingTransaction}>
                    <Wallet className="mr-2 h-4 w-4" />
                    {savingTransaction ? "Saving..." : "Save Bank Transaction"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Import and export register</CardTitle>
                  <CardDescription>Track statement imports, receipts, bills, and accounting exports.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {documents.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      No finance documents registered yet.
                    </div>
                  ) : (
                    documents.map((document) => (
                      <div key={document.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium">{document.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {document.documentType.replace(/_/g, " ")} · {document.source}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">{document.status}</Badge>
                            <p className="mt-2 text-xs text-muted-foreground">{formatDate(document.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Register import or export</CardTitle>
                  <CardDescription>Use this to log docs until cloud storage is connected in deployment.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Select value={documentForm.documentType} onValueChange={(value) => setDocumentForm((current) => ({ ...current, documentType: value }))}>
                    <SelectTrigger><SelectValue placeholder="Document type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_statement">Bank statement</SelectItem>
                      <SelectItem value="bill">Supplier bill</SelectItem>
                      <SelectItem value="receipt">Receipt</SelectItem>
                      <SelectItem value="export">Accounting export</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Title" value={documentForm.title} onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))} />
                  <Input placeholder="File name" value={documentForm.fileName} onChange={(event) => setDocumentForm((current) => ({ ...current, fileName: event.target.value }))} />
                  <Select value={documentForm.source} onValueChange={(value) => setDocumentForm((current) => ({ ...current, source: value }))}>
                    <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="import">Import</SelectItem>
                      <SelectItem value="export">Export</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Button variant="outline" onClick={() => void saveDocument()} disabled={savingDocument}>
                      <Upload className="mr-2 h-4 w-4" />
                      {savingDocument ? "Saving..." : "Register Import"}
                    </Button>
                    <Button
                      variant="outline"
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

          <TabsContent value="reconciliation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent reconciliation sessions</CardTitle>
                <CardDescription>Use the dedicated Reconciliation page for balancing runs and session creation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No reconciliation sessions recorded yet.
                  </div>
                ) : (
                  sessions.map((session) => (
                    <div key={session.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{session.bankAccount?.name || "Bank account"}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(session.statementDate)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(session.difference)}</p>
                          <Badge variant="outline">{session.status}</Badge>
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
