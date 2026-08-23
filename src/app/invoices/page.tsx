"use client"

import { useState, useEffect } from "react"
import {
  Search,
  FileText,
  Download,
  Send,
  Printer,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Calendar,
  Loader2,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Users,
} from "lucide-react"
import dynamic from "next/dynamic"
import { AppShell } from "@/components/layout/app-shell"
import { SendDocumentModal } from "@/components/modals/SendDocumentModal"
import InvoicePDF from "@/components/documents/InvoicePDF"
import { Checkbox } from "@/components/ui/checkbox"

const InvoicePdfDownloadLink = dynamic(
  () => import("@/components/documents/InvoicePdfDownloadLink"),
  { ssr: false }
) as any
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { KpiCard } from "@/components/ui/kpi-card"
import { PageHeader } from "@/components/ui/page-header"
import { Progress } from "@/components/ui/progress"
import { bucketise, daysOverdue } from "@/lib/aging"
import { useSettings } from "@/lib/settings/use-settings"
import { useToast } from "@/hooks/use-toast"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { formatCurrency, formatCurrencyShort, formatDate } from "@/lib/types"
import { downloadPdfBatch, printPdfBatch, printPdfDocument } from "@/lib/pdf-actions"

interface InvoiceItem {
  id: string
  productId: string
  product: { sku: string; name: string; baseUnit?: string }
  quantity: number
  unitPrice: number
  taxRate: number
  taxAmount: number
  total: number
}

interface Invoice {
  id: string
  invoiceNumber: string
  customerId: string
  customer: {
    id: string
    name: string
    phone: string
    email?: string | null
    tradingName?: string | null
    abn?: string
    locations?: { address: string; city: string; state: string; postcode: string }[]
  }
  orderId?: string
  status: "draft" | "sent" | "unpaid" | "partial" | "paid" | "overdue" | "cancelled"
  invoiceDate: string
  dueDate: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  balanceDue: number
  items: InvoiceItem[]
  notes?: string
}

const statusBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  unpaid: "secondary",
  partial: "secondary",
  paid: "default",
  overdue: "destructive",
  cancelled: "outline",
}

export default function InvoicesPage() {
  const { settings: agingSettings } = useSettings("aging")
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
  const [company, setCompany] = useState<any>(null)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [bulkAction, setBulkAction] = useState<"download" | "print" | null>(null)

  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    fetchInvoices()
    fetchCompany()
  }, [])

  const fetchCompany = async () => {
    try {
      const response = await fetch("/api/settings/company")
      const data = await response.json()
      if (data.success) {
        setCompany(data.data)
      }
    } catch (error) {
      console.error("Error fetching company:", error)
    }
  }

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/invoices")
      const data = await response.json()

      if (data.success) {
        setInvoices(data.data)
      } else {
        console.error("Failed to load invoices:", data.error)
      }
    } catch (error) {
      console.error("Error fetching invoices:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredInvoices = invoices.filter((invoice) => {
    const derivedStatus =
      invoice.status !== "paid" && invoice.status !== "cancelled" && new Date(invoice.dueDate) < new Date()
        ? "overdue"
        : invoice.status
    const matchesSearch =
      invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      invoice.customer.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || derivedStatus === statusFilter
    return matchesSearch && matchesStatus
  })

  useEffect(() => {
    setSelectedInvoiceIds((current) => current.filter((id) => invoices.some((invoice) => invoice.id === id)))
  }, [invoices])

  const selectedInvoices = filteredInvoices.filter((invoice) => selectedInvoiceIds.includes(invoice.id))
  const allFilteredSelected = filteredInvoices.length > 0 && filteredInvoices.every((invoice) => selectedInvoiceIds.includes(invoice.id))

  const toggleInvoiceSelection = (invoiceId: string, checked: boolean) => {
    setSelectedInvoiceIds((current) =>
      checked ? Array.from(new Set([...current, invoiceId])) : current.filter((id) => id !== invoiceId)
    )
  }

  const toggleSelectAllInvoices = (checked: boolean) => {
    if (checked) {
      setSelectedInvoiceIds((current) => Array.from(new Set([...current, ...filteredInvoices.map((invoice) => invoice.id)])))
      return
    }

    const filteredIds = new Set(filteredInvoices.map((invoice) => invoice.id))
    setSelectedInvoiceIds((current) => current.filter((id) => !filteredIds.has(id)))
  }

  const buildInvoiceDocument = (invoice: Invoice) => <InvoicePDF invoice={invoice} company={company} />

  const handleBulkDownloadInvoices = async () => {
    if (!company || selectedInvoices.length === 0) return
    setBulkAction("download")
    try {
      await downloadPdfBatch(
        selectedInvoices.map((invoice) => ({
          document: buildInvoiceDocument(invoice),
          fileName: `Invoice-${invoice.invoiceNumber}.pdf`,
        }))
      )
    } finally {
      setBulkAction(null)
    }
  }

  const handleBulkPrintInvoices = async () => {
    if (!company || selectedInvoices.length === 0) return
    setBulkAction("print")
    try {
      await printPdfBatch(
        selectedInvoices.map((invoice) => ({
          document: buildInvoiceDocument(invoice),
          title: `Invoice ${invoice.invoiceNumber}`,
        }))
      )
    } finally {
      setBulkAction(null)
    }
  }

  const handlePrintInvoice = async (invoice: Invoice) => {
    if (!company) return
    await printPdfDocument(buildInvoiceDocument(invoice), `Invoice ${invoice.invoiceNumber}`)
  }

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return
    if (!paymentAmount || isNaN(parseFloat(paymentAmount))) return

    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(paymentAmount) })
      })

      const data = await response.json()
      if (data.success) {
        await fetchInvoices()
        setIsPaymentDialogOpen(false)
        setSelectedInvoice(null)
        setPaymentAmount("")
        toast({
          title: "Payment recorded",
          description: `Successfully recorded payment of $${parseFloat(paymentAmount).toFixed(2)}.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Payment failed",
          description: data.error || "Failed to record payment",
        })
      }
    } catch (error) {
      console.error("Error recording payment:", error)
      toast({
        variant: "destructive",
        title: "Payment failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred while recording the payment.",
      })
    }
  }

  // Calculate summary stats
  const totalOutstanding = invoices
    .filter(inv => inv.status !== "cancelled" && inv.status !== "paid")
    .reduce((sum, inv) => sum + inv.balanceDue, 0)

  const overdueAmount = invoices
    .filter(inv => ["unpaid", "partial", "overdue"].includes(inv.status) && new Date(inv.dueDate) < new Date())
    .reduce((sum, inv) => sum + inv.balanceDue, 0)

  const totalPaidThisMonth = invoices
    .filter(inv => inv.status === "paid" && new Date(inv.invoiceDate).getMonth() === new Date().getMonth())
    .reduce((sum, inv) => sum + inv.totalAmount, 0)

  const agingSummary = bucketise(
    invoices.map((invoice) => ({
      dueDate: invoice.dueDate,
      invoiceDate: invoice.invoiceDate,
      outstanding: invoice.balanceDue,
      status: invoice.status,
    })),
    agingSettings
  ).buckets

  return (
    <AppShell title="Invoices" breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Invoices" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Invoices & Billing"
          description="Create, track, and reconcile customer invoices, cash receipts, and receivables aging."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void fetchInvoices()
                void fetchCompany()
              }}
            >
              <Loader2 className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          }
        />

        {/* Stats KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Invoices"
            value={loading ? "..." : invoices.length}
            description="All generated sales invoices"
            icon={FileText}
          />
          <KpiCard
            title="Total Outstanding"
            value={loading ? "..." : formatCurrencyShort(totalOutstanding)}
            description="Open balances awaiting payment"
            icon={DollarSign}
          />
          <KpiCard
            title="Overdue Amount"
            value={loading ? "..." : formatCurrencyShort(overdueAmount)}
            description="Balances past due date"
            icon={AlertTriangle}
          />
          <KpiCard
            title="Collected This Month"
            value={loading ? "..." : formatCurrencyShort(totalPaidThisMonth)}
            description="Settled receipts this calendar month"
            icon={CheckCircle2}
          />
        </div>

        {/* Receivables Aging Summary */}
        {totalOutstanding > 0 && (
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Receivables Aging Breakdown</CardTitle>
              <CardDescription>Live aging breakdown by days overdue across open customer balances.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {agingSummary.map((bucket) => {
                  const isHigh = bucket.minDays >= 61
                  const isMedium = bucket.minDays >= 31

                  return (
                    <div
                      key={bucket.label}
                      className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{bucket.label}</span>
                        {isHigh ? (
                          <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                        ) : isMedium ? (
                          <Badge variant="secondary" className="text-[10px]">Attention</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Current</Badge>
                        )}
                      </div>
                      <p className={`mt-2 text-xl font-bold ${isHigh ? "text-destructive" : isMedium ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                        {formatCurrency(bucket.amount)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search & Filter Bar */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice number or customer name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Selection Bar */}
        {selectedInvoices.length > 0 && (
          <Card className="border-primary/40 bg-primary/5 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <p className="font-semibold text-foreground text-sm">
                  {selectedInvoices.length} invoice{selectedInvoices.length === 1 ? "" : "s"} selected
                </p>
                <p className="text-xs text-muted-foreground">Perform bulk download or batch printing for selected invoices.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedInvoiceIds([])}>
                  Clear Selection
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleBulkPrintInvoices()}
                  disabled={!company || bulkAction !== null}
                >
                  {bulkAction === "print" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  Print Batch
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleBulkDownloadInvoices()}
                  disabled={!company || bulkAction !== null}
                >
                  {bulkAction === "download" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download Batch
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invoices Table */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/80 hover:bg-transparent">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allFilteredSelected ? true : selectedInvoices.length > 0 ? "indeterminate" : false}
                      onCheckedChange={(checked) => toggleSelectAllInvoices(Boolean(checked))}
                      aria-label="Select all invoices"
                    />
                  </TableHead>
                  <TableHead className="w-32">Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-36">Due Date</TableHead>
                  <TableHead className="text-right w-28">Amount</TableHead>
                  <TableHead className="text-right w-28">Balance</TableHead>
                  <TableHead className="text-center w-28">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12">
                      <EmptyState
                        icon={FileText}
                        title="Loading invoices..."
                        description="Fetching customer billing records."
                        className="min-h-[180px] border-0"
                      />
                    </TableCell>
                  </TableRow>
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12">
                      <EmptyState
                        icon={FileText}
                        title="No invoices found"
                        description={search ? "No invoices match the search filter." : "Generate invoices from delivered customer orders."}
                        className="min-h-[180px] border-0"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const isOverdue =
                      invoice.status !== "paid" &&
                      invoice.status !== "cancelled" &&
                      new Date(invoice.dueDate) < new Date()

                    const effectiveStatus = isOverdue ? "overdue" : invoice.status

                    return (
                      <TableRow key={invoice.id} className="border-border/60 hover:bg-muted/40 group">
                        <TableCell>
                          <Checkbox
                            checked={selectedInvoiceIds.includes(invoice.id)}
                            onCheckedChange={(checked) => toggleInvoiceSelection(invoice.id, Boolean(checked))}
                            aria-label={`Select invoice ${invoice.invoiceNumber}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-mono font-semibold text-foreground text-sm">{invoice.invoiceNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground text-sm">{invoice.customer.name}</p>
                            <p className="text-xs text-muted-foreground">{invoice.customer.phone}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(invoice.invoiceDate)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className={isOverdue ? "text-destructive font-medium text-xs" : "text-xs text-muted-foreground"}>
                            {formatDate(invoice.dueDate)}
                            {isOverdue && (
                              <span className="ml-1 text-[11px] font-semibold">
                                ({daysOverdue({ dueDate: invoice.dueDate, invoiceDate: invoice.invoiceDate, outstanding: invoice.balanceDue }, agingSettings)}d overdue)
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm text-foreground">
                          {formatCurrency(invoice.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold text-sm ${invoice.balanceDue > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                            {formatCurrency(invoice.balanceDue)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={statusBadgeVariants[effectiveStatus] || "secondary"} className="capitalize text-xs">
                            {effectiveStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <DollarSign className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>Invoice Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => {
                                setSelectedInvoice(invoice)
                                setIsViewDialogOpen(true)
                              }}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {invoice.balanceDue > 0 && (
                                <DropdownMenuItem onClick={() => {
                                  setSelectedInvoice(invoice)
                                  setPaymentAmount(invoice.balanceDue.toString())
                                  setIsPaymentDialogOpen(true)
                                }}>
                                  <DollarSign className="mr-2 h-4 w-4" />
                                  Record Payment
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem asChild>
                                {isMounted && company && (
                                  <InvoicePdfDownloadLink
                                    invoice={invoice}
                                    company={company}
                                    fileName={`Invoice-${invoice.invoiceNumber}.pdf`}
                                    className="flex w-full items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
                                  >
                                    {({ loading }: { loading: boolean }) => (
                                      <>
                                        {loading ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <Download className="mr-2 h-4 w-4" />
                                        )}
                                        Download PDF
                                      </>
                                    )}
                                  </InvoicePdfDownloadLink>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setSelectedInvoice(invoice)
                                setIsSendModalOpen(true)
                              }}>
                                <Send className="mr-2 h-4 w-4" />
                                Send PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handlePrintInvoice(invoice)} disabled={!company}>
                                <Printer className="mr-2 h-4 w-4" />
                                Print Document
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* View Invoice Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            {selectedInvoice && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                    Invoice {selectedInvoice.invoiceNumber}
                    <Badge variant={statusBadgeVariants[selectedInvoice.status] || "secondary"} className="capitalize">
                      {selectedInvoice.status}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    Billing summary and line items for {selectedInvoice.customer.name}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Bill to & Dates Grid */}
                  <div className="grid grid-cols-2 gap-6 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bill To</p>
                      <p className="font-semibold text-foreground">{selectedInvoice.customer.name}</p>
                      {selectedInvoice.customer.locations?.[0] && (
                        <p className="text-xs text-muted-foreground">
                          {selectedInvoice.customer.locations[0].address}, {selectedInvoice.customer.locations[0].city}, {selectedInvoice.customer.locations[0].state} {selectedInvoice.customer.locations[0].postcode}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">Phone: {selectedInvoice.customer.phone}</p>
                      {selectedInvoice.customer.abn && (
                        <p className="text-xs text-muted-foreground">ABN: {selectedInvoice.customer.abn}</p>
                      )}
                    </div>
                    <div className="space-y-2 text-right">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice Date</p>
                        <p className="font-medium text-foreground text-sm">{formatDate(selectedInvoice.invoiceDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due Date</p>
                        <p className="font-medium text-foreground text-sm">{formatDate(selectedInvoice.dueDate)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div>
                    <h4 className="font-semibold text-sm text-foreground mb-3">Itemized Lines</h4>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/80 bg-muted/40">
                            <TableHead>Product</TableHead>
                            <TableHead className="text-center w-20">Qty</TableHead>
                            <TableHead className="text-right w-28">Unit Price</TableHead>
                            <TableHead className="text-right w-24">GST</TableHead>
                            <TableHead className="text-right w-28">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedInvoice.items.map((item) => (
                            <TableRow key={item.id} className="border-border/60">
                              <TableCell>
                                <p className="font-medium text-foreground text-sm">{item.product.name}</p>
                                <p className="text-[11px] text-muted-foreground font-mono">{item.product.sku}</p>
                              </TableCell>
                              <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                              <TableCell className="text-right text-sm">{formatCurrency(item.unitPrice)}</TableCell>
                              <TableCell className="text-right text-sm">{formatCurrency(item.taxAmount)}</TableCell>
                              <TableCell className="text-right font-semibold text-sm">{formatCurrency(item.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Summary Totals */}
                  <div className="flex justify-end">
                    <div className="w-72 space-y-2 rounded-lg border border-border bg-card p-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="font-medium text-foreground">{formatCurrency(selectedInvoice.subtotal)}</span>
                      </div>
                      {selectedInvoice.discountAmount > 0 && (
                        <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                          <span>Discount:</span>
                          <span>-{formatCurrency(selectedInvoice.discountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">GST:</span>
                        <span className="font-medium text-foreground">{formatCurrency(selectedInvoice.taxAmount)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-base">
                        <span>Total:</span>
                        <span>{formatCurrency(selectedInvoice.totalAmount)}</span>
                      </div>
                      {selectedInvoice.paidAmount > 0 && (
                        <>
                          <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                            <span>Paid Amount:</span>
                            <span>{formatCurrency(selectedInvoice.paidAmount)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-amber-600 dark:text-amber-400 text-sm">
                            <span>Balance Due:</span>
                            <span>{formatCurrency(selectedInvoice.balanceDue)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                    Close
                  </Button>
                  {isMounted && company && (
                    <Button variant="outline" onClick={() => void handlePrintInvoice(selectedInvoice)}>
                      <Printer className="mr-2 h-4 w-4" />
                      Print
                    </Button>
                  )}
                  {isMounted && company && (
                    <InvoicePdfDownloadLink
                      invoice={selectedInvoice}
                      company={company}
                      fileName={`Invoice-${selectedInvoice.invoiceNumber}.pdf`}
                    >
                      {({ loading }: { loading: boolean }) => (
                        <Button disabled={loading}>
                          {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          Download PDF
                        </Button>
                      )}
                    </InvoicePdfDownloadLink>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Record Payment Dialog */}
        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Customer Payment</DialogTitle>
              <DialogDescription>
                Record cash receipt for Invoice {selectedInvoice?.invoiceNumber}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex justify-between p-4 bg-muted/40 rounded-lg border border-border">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Total Amount</p>
                  <p className="font-bold text-foreground text-lg">{formatCurrency(selectedInvoice?.totalAmount || 0)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Balance Due</p>
                  <p className="font-bold text-amber-600 dark:text-amber-400 text-lg">{formatCurrency(selectedInvoice?.balanceDue || 0)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Amount</label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount (e.g. 1500.00)"
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentAmount(selectedInvoice?.balanceDue.toString() || "0")}
                  >
                    Set Full Balance ({formatCurrency(selectedInvoice?.balanceDue || 0)})
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRecordPayment}
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
              >
                Record Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Document Modal */}
        {selectedInvoice && (
          <SendDocumentModal
            isOpen={isSendModalOpen}
            onClose={() => setIsSendModalOpen(false)}
            documentType="invoice"
            documentId={selectedInvoice.id}
            documentNumber={selectedInvoice.invoiceNumber}
            recipientEmail={selectedInvoice.customer.email || ""}
            recipientPhone={selectedInvoice.customer.phone || ""}
          />
        )}
      </div>
    </AppShell>
  )
}

