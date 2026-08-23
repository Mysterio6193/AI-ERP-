"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Download, FileText, Loader2, Search, Send, Users, AlertCircle, AlertTriangle, DollarSign } from "lucide-react"

import { SendDocumentModal } from "@/components/modals/SendDocumentModal"
import { AppShell } from "@/components/layout/app-shell"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency, formatCurrencyShort } from "@/lib/types"

const CustomerStatementPdfDownloadLink = dynamic(
  () => import("@/components/documents/CustomerStatementPdfDownloadLink"),
  { ssr: false }
) as any

type StatementSummary = {
  customerId: string
  customerName: string
  email?: string | null
  phone?: string | null
  statementNumber: string
  creditLimit: number
  creditBalance: number
  creditStatus: string
  paymentTerms: number
  openInvoiceCount: number
  outstandingBalance: number
  nextDueDate?: string | null
}

type StatementDetail = {
  customer: {
    id: string
    name: string
    email?: string | null
    phone?: string | null
    creditLimit: number
    creditBalance: number
    creditStatus: string
    paymentTerms: number
  }
  summary: {
    statementNumber: string
    outstandingBalance: number
    overdueAmount: number
    minimumPaymentDue: number
    totalCharges: number
    totalPayments: number
    nextDueDate?: string | null
    statementStart: string
    statementEnd: string
  }
  transactions: Array<{
    id: string
    date: string
    type: string
    description: string
    reference?: string | null
    amount: number
    balanceAfter: number
  }>
}

export default function CustomerStatementsPage() {
  const [summaries, setSummaries] = useState<StatementSummary[]>([])
  const [selected, setSelected] = useState<StatementDetail | null>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [sendOpen, setSendOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [statementsRes, companyRes] = await Promise.all([
          fetch("/api/customers/statements"),
          fetch("/api/settings/company"),
        ])

        const statementsData = await statementsRes.json()
        const companyData = await companyRes.json()

        if (statementsData.success) {
          const list = statementsData.data || []
          setSummaries(list)
          if (list.length > 0) {
            void fetchStatement(list[0].customerId)
          }
        }

        if (companyData.success) {
          setCompany(companyData.data)
        }
      } catch (error) {
        console.error("Failed to load customer statements:", error)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  const fetchStatement = async (customerId: string) => {
    try {
      setDetailLoading(true)
      const res = await fetch(`/api/customers/${customerId}/statement`)
      const data = await res.json()
      if (data.success) {
        setSelected(data.data)
      }
    } catch (error) {
      console.error("Failed to load statement detail:", error)
    } finally {
      setDetailLoading(false)
    }
  }

  const filteredSummaries = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return summaries

    return summaries.filter((summary) =>
      summary.customerName.toLowerCase().includes(query) ||
      summary.statementNumber.toLowerCase().includes(query)
    )
  }, [search, summaries])

  return (
    <AppShell title="Customer Statements" breadcrumbs={[{ label: "Customers", href: "/customers" }, { label: "Statements" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Customer Statements"
          description="Send statement summaries, view transaction histories, and download customer PDF ledgers."
          actions={
            selected ? (
              <div className="flex flex-wrap items-center gap-2">
                {isMounted && company ? (
                  <CustomerStatementPdfDownloadLink
                    customer={selected.customer}
                    summary={selected.summary}
                    transactions={selected.transactions}
                    company={company}
                    fileName={`${selected.summary.statementNumber}.pdf`}
                  >
                    {({ loading }: { loading: boolean }) => (
                      <Button variant="outline" disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PDF
                      </Button>
                    )}
                  </CustomerStatementPdfDownloadLink>
                ) : null}
                <Button onClick={() => setSendOpen(true)}>
                  <Send className="mr-2 h-4 w-4" />
                  Send Statement
                </Button>
              </div>
            ) : null
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Customers with Statements"
            value={summaries.length}
            icon={Users}
          />
          <KpiCard
            title="Total Open Invoices"
            value={summaries.reduce((sum, summary) => sum + summary.openInvoiceCount, 0)}
            icon={FileText}
          />
          <KpiCard
            title="Outstanding Receivables"
            value={formatCurrencyShort(summaries.reduce((sum, summary) => sum + summary.outstandingBalance, 0))}
            icon={DollarSign}
          />
          <KpiCard
            title="Accounts on Hold"
            value={summaries.filter((summary) => summary.creditStatus === "on_hold").length}
            icon={AlertTriangle}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <Card className="border-border shadow-sm overflow-hidden">
            <CardHeader className="p-4 sm:p-6 pb-2">
              <CardTitle className="text-base">Statement List</CardTitle>
              <CardDescription>Select a customer to load the latest live statement.</CardDescription>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search customer or statement number..."
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Terms</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Loading statements...
                      </TableCell>
                    </TableRow>
                  ) : filteredSummaries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-0">
                        <EmptyState
                          icon={FileText}
                          title="No statements found"
                          description={search ? "No customer statements match your search." : "No customer statements available."}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSummaries.map((summary) => (
                      <TableRow key={summary.customerId} className={selected?.customer.id === summary.customerId ? "bg-muted/50" : ""}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{summary.customerName}</p>
                            <p className="text-xs text-muted-foreground">{summary.email || summary.phone || "No contact saved"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(summary.outstandingBalance)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={summary.creditStatus === "on_hold" ? "border-amber-500/30 text-amber-600 bg-amber-500/10" : "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"}>
                            {summary.creditStatus.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">Net {summary.paymentTerms}</TableCell>
                        <TableCell className="text-right">
                          <Button variant={selected?.customer.id === summary.customerId ? "default" : "outline"} size="sm" onClick={() => void fetchStatement(summary.customerId)}>
                            <FileText className="mr-2 h-4 w-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 sm:p-6 pb-2">
              <CardTitle className="text-base">Statement Detail</CardTitle>
              <CardDescription>Latest live receivables view for the selected customer.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              {detailLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  Loading statement...
                </div>
              ) : !selected ? (
                <EmptyState
                  icon={FileText}
                  title="Select a statement"
                  description="Select a customer statement to inspect balances, transactions, and due dates."
                />
              ) : (
                <>
                  <div className="rounded-xl bg-card border border-border p-5 text-card-foreground shadow-sm">
                    <p className="text-xs font-mono text-muted-foreground">{selected.summary.statementNumber}</p>
                    <h2 className="mt-1 text-xl font-semibold text-foreground">{selected.customer.name}</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</p>
                        <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrency(selected.summary.outstandingBalance)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Minimum due</p>
                        <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrency(selected.summary.minimumPaymentDue)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Charges this period</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(selected.summary.totalCharges)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Payments this period</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(selected.summary.totalPayments)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card className="border-border shadow-none bg-muted/30">
                      <CardContent className="pt-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Due date</p>
                        <p className="mt-1 font-medium">
                          {selected.summary.nextDueDate ? new Date(selected.summary.nextDueDate).toLocaleDateString() : "No open invoices"}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-border shadow-none bg-muted/30">
                      <CardContent className="pt-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Credit status</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="outline" className={selected.customer.creditStatus === "on_hold" ? "border-amber-500/30 text-amber-600 bg-amber-500/10" : "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"}>
                            {selected.customer.creditStatus.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-sm text-muted-foreground">Net {selected.customer.paymentTerms}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground">Recent transactions</h3>
                      <span className="text-xs text-muted-foreground">{selected.transactions.length} entries</span>
                    </div>
                    <div className="space-y-3">
                      {selected.transactions.slice(0, 8).map((transaction) => (
                        <div key={transaction.id} className="rounded-xl border border-border bg-card p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">{transaction.description}</p>
                              <p className="text-xs text-muted-foreground">{new Date(transaction.date).toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${transaction.amount >= 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                                {transaction.amount >= 0 ? "+" : "-"}
                                {formatCurrency(Math.abs(transaction.amount))}
                              </p>
                              <p className="text-xs text-muted-foreground">Balance {formatCurrency(transaction.balanceAfter)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {selected && (
          <SendDocumentModal
            isOpen={sendOpen}
            onClose={() => setSendOpen(false)}
            documentType="statement"
            documentId={selected.customer.id}
            documentNumber={selected.summary.statementNumber}
            recipientEmail={selected.customer.email || ""}
            recipientPhone={selected.customer.phone || ""}
            customerId={selected.customer.id}
          />
        )}
      </div>
    </AppShell>
  )
}
