"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Download, FileText, Loader2, Search, Send } from "lucide-react"

import { SendDocumentModal } from "@/components/modals/SendDocumentModal"
import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/types"

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
    reference?: string
    description: string
    amount: number
    balanceAfter: number
    status: string
  }>
  invoices: Array<{
    id: string
    invoiceNumber: string
    invoiceDate: string
    dueDate: string
    totalAmount: number
    outstandingAmount: number
    status: string
  }>
}

export default function CustomerStatementsPage() {
  const [summaries, setSummaries] = useState<StatementSummary[]>([])
  const [selected, setSelected] = useState<StatementDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [sendOpen, setSendOpen] = useState(false)
  const [company, setCompany] = useState<any>(null)

  async function fetchSummaries() {
    setLoading(true)
    try {
      const response = await fetch("/api/customer-statements")
      const payload = await response.json()
      if (payload.success) {
        setSummaries(payload.data || [])
      }
    } catch (error) {
      console.error("Error fetching customer statements:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchStatement(customerId: string) {
    setDetailLoading(true)
    try {
      const response = await fetch(`/api/customer-statements?customerId=${customerId}`)
      const payload = await response.json()
      if (payload.success) {
        setSelected(payload.data)
      }
    } catch (error) {
      console.error("Error fetching statement detail:", error)
    } finally {
      setDetailLoading(false)
    }
  }

  async function fetchCompany() {
    try {
      const response = await fetch("/api/settings/company")
      const payload = await response.json()
      if (payload.success) {
        setCompany(payload.data)
      }
    } catch (error) {
      console.error("Error fetching company settings:", error)
    }
  }

  useEffect(() => {
    void fetchSummaries()
    void fetchCompany()
  }, [])

  const filteredSummaries = useMemo(() => {
    return summaries.filter((summary) => {
      const query = search.toLowerCase()
      return (
        summary.customerName.toLowerCase().includes(query) ||
        (summary.email || "").toLowerCase().includes(query) ||
        summary.statementNumber.toLowerCase().includes(query)
      )
    })
  }, [summaries, search])

  return (
    <AppShell title="Customer Statements" breadcrumbs={[{ label: "Customers" }, { label: "Statements" }]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customer Statements</h1>
            <p className="text-muted-foreground">
              Manage statement balances, review activity, and send statements to customers over email or WhatsApp.
            </p>
          </div>
          {selected && (
            <div className="flex flex-wrap items-center gap-3">
              {company ? (
                <CustomerStatementPdfDownloadLink
                  statement={selected}
                  company={company}
                  fileName={`${selected.summary.statementNumber}.pdf`}
                >
                  {({ loading: pdfLoading }: { loading: boolean }) => (
                    <Button variant="outline" disabled={pdfLoading}>
                      {pdfLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      Download PDF
                    </Button>
                  )}
                </CustomerStatementPdfDownloadLink>
              ) : null}
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setSendOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                Send Statement
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Customers with statements</CardDescription>
              <CardTitle className="text-2xl">{summaries.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total open invoices</CardDescription>
              <CardTitle className="text-2xl">{summaries.reduce((sum, summary) => sum + summary.openInvoiceCount, 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outstanding receivables</CardDescription>
              <CardTitle className="text-2xl">
                {formatCurrency(summaries.reduce((sum, summary) => sum + summary.outstandingBalance, 0))}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Accounts on hold</CardDescription>
              <CardTitle className="text-2xl">
                {summaries.filter((summary) => summary.creditStatus === "on_hold").length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Statement list</CardTitle>
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
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Loading statements...
                      </TableCell>
                    </TableRow>
                  ) : filteredSummaries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No statements found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSummaries.map((summary) => (
                      <TableRow key={summary.customerId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{summary.customerName}</p>
                            <p className="text-xs text-muted-foreground">{summary.email || summary.phone || "No contact saved"}</p>
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(summary.outstandingBalance)}</TableCell>
                        <TableCell>
                          <Badge className={summary.creditStatus === "on_hold" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                            {summary.creditStatus.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>Net {summary.paymentTerms}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => void fetchStatement(summary.customerId)}>
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

          <Card>
            <CardHeader>
              <CardTitle>Statement detail</CardTitle>
              <CardDescription>Latest live receivables view for the selected customer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {detailLoading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading statement...
                </div>
              ) : !selected ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-muted-foreground">
                  Select a customer statement to inspect balances, transactions, and due dates.
                </div>
              ) : (
                <>
                  <div className="rounded-2xl bg-slate-900 p-5 text-slate-100">
                    <p className="text-sm text-slate-400">{selected.summary.statementNumber}</p>
                    <h2 className="mt-1 text-xl font-semibold">{selected.customer.name}</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">Outstanding</p>
                        <p className="mt-1 text-2xl font-semibold">{formatCurrency(selected.summary.outstandingBalance)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">Minimum due</p>
                        <p className="mt-1 text-2xl font-semibold">{formatCurrency(selected.summary.minimumPaymentDue)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">Charges this period</p>
                        <p className="mt-1 text-lg font-semibold">{formatCurrency(selected.summary.totalCharges)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">Payments this period</p>
                        <p className="mt-1 text-lg font-semibold">{formatCurrency(selected.summary.totalPayments)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card className="bg-slate-50">
                      <CardContent className="pt-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Due date</p>
                        <p className="mt-1 font-medium">
                          {selected.summary.nextDueDate ? new Date(selected.summary.nextDueDate).toLocaleDateString() : "No open invoices"}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-slate-50">
                      <CardContent className="pt-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Credit status</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge className={selected.customer.creditStatus === "on_hold" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                            {selected.customer.creditStatus.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-sm text-muted-foreground">Net {selected.customer.paymentTerms}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900">Recent transactions</h3>
                      <span className="text-xs text-muted-foreground">{selected.transactions.length} entries</span>
                    </div>
                    <div className="space-y-3">
                      {selected.transactions.slice(0, 8).map((transaction) => (
                        <div key={transaction.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">{transaction.description}</p>
                              <p className="text-xs text-muted-foreground">{new Date(transaction.date).toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${transaction.amount >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
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
