"use client"

import { useState, useEffect } from "react"
import {
  Search, FileText, Download, Send, Printer, Eye,
  Clock, CheckCircle, AlertCircle, DollarSign, Calendar, Loader2
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
import { formatCurrency, formatCurrencyShort } from "@/lib/types"
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

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  unpaid: "bg-orange-100 text-orange-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
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
        // Refresh invoices to show updated statuses and balances
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

  const getStatusColor = (status: string) => {
    return INVOICE_STATUS_COLORS[status] || INVOICE_STATUS_COLORS.draft
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

  // One shared definition, so this panel, the finance dashboard and the
  // customer's statement PDF can no longer disagree about what "60 days
  // overdue" means.
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
    <AppShell title="Invoices" breadcrumbs={[{ label: "Invoices" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Invoices & Billing</h1>
            <p className="text-muted-foreground">Manage invoices and track payments</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Invoices</CardDescription>
              <CardTitle className="text-2xl">{invoices.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Outstanding</CardDescription>
              <CardTitle className="text-2xl text-orange-600">
                {formatCurrencyShort(totalOutstanding)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Overdue</CardDescription>
              <CardTitle className="text-2xl text-red-600">
                {formatCurrencyShort(overdueAmount)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Collected This Month</CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {formatCurrencyShort(totalPaidThisMonth)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Aging Summary */}
        {totalOutstanding > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receivables Aging</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${agingSummary.length}, minmax(0, 1fr))` }}>
                {agingSummary.map((bucket) => (
                  <div key={bucket.label} className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">{bucket.label}</p>
                    <p className={`text-lg font-bold ${bucket.minDays >= 61 ? "text-red-600" :
                      bucket.minDays >= 31 ? "text-orange-600" : "text-green-600"
                      }`}>
                      {formatCurrencyShort(bucket.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
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

        {selectedInvoices.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">{selectedInvoices.length} invoice{selectedInvoices.length === 1 ? "" : "s"} selected</p>
                <p className="text-sm text-muted-foreground">Use bulk actions to download or print the current selection.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => setSelectedInvoiceIds([])}>
                  Clear Selection
                </Button>
                <Button variant="outline" onClick={() => void handleBulkPrintInvoices()} disabled={!company || bulkAction !== null}>
                  {bulkAction === "print" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  Print Selected
                </Button>
                <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => void handleBulkDownloadInvoices()} disabled={!company || bulkAction !== null}>
                  {bulkAction === "download" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download Selected
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invoices Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allFilteredSelected ? true : selectedInvoices.length > 0 ? "indeterminate" : false}
                      onCheckedChange={(checked) => toggleSelectAllInvoices(Boolean(checked))}
                      aria-label="Select all invoices"
                    />
                  </TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Loading invoices...
                    </TableCell>
                  </TableRow>
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No invoices found. Generate invoices from delivered orders.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const isOverdue = invoice.status !== "paid" && invoice.status !== "cancelled" &&
                      new Date(invoice.dueDate) < new Date()

                    return (
                      <TableRow key={invoice.id} className="group">
                        <TableCell>
                          <Checkbox
                            checked={selectedInvoiceIds.includes(invoice.id)}
                            onCheckedChange={(checked) => toggleInvoiceSelection(invoice.id, Boolean(checked))}
                            aria-label={`Select invoice ${invoice.invoiceNumber}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-mono font-medium">{invoice.invoiceNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{invoice.customer.name}</p>
                            <p className="text-xs text-muted-foreground">{invoice.customer.phone}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(invoice.invoiceDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className={isOverdue ? "text-red-600" : ""}>
                            {new Date(invoice.dueDate).toLocaleDateString()}
                            {isOverdue && (
                              <span className="ml-2 text-xs">
                                ({daysOverdue({ dueDate: invoice.dueDate, invoiceDate: invoice.invoiceDate, outstanding: invoice.balanceDue }, agingSettings)} days overdue)
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(invoice.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={invoice.balanceDue > 0 ? "text-orange-600 font-medium" : ""}>
                            {formatCurrency(invoice.balanceDue)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={getStatusColor(isOverdue ? "overdue" : invoice.status)}>
                            {isOverdue ? "overdue" : invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                                <DollarSign className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => {
                                setSelectedInvoice(invoice)
                                setIsViewDialogOpen(true)
                              }}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Invoice
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
                                    className="flex w-full items-center px-2 py-1.5 text-sm cursor-default hover:bg-accent"
                                  >
                                    {({ loading }) => (
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
                                Print
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
                  <DialogTitle className="flex items-center gap-2">
                    Invoice {selectedInvoice.invoiceNumber}
                    <Badge className={getStatusColor(selectedInvoice.status)}>
                      {selectedInvoice.status}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    {selectedInvoice.customer.name}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Invoice Details */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm text-muted-foreground">Bill To</h4>
                      <div>
                        <p className="font-medium">{selectedInvoice.customer.name}</p>
                        {selectedInvoice.customer.locations?.[0] && (
                          <>
                            <p className="text-sm text-muted-foreground">
                              {selectedInvoice.customer.locations[0].address}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {selectedInvoice.customer.locations[0].city},
                              {selectedInvoice.customer.locations[0].state}
                            </p>
                          </>
                        )}
                        <p className="text-sm text-muted-foreground">
                          Phone: {selectedInvoice.customer.phone}
                        </p>
                        {selectedInvoice.customer.abn && (
                          <p className="text-sm text-muted-foreground">
                            ABN: {selectedInvoice.customer.abn}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3 text-right">
                      <div>
                        <p className="text-sm text-muted-foreground">Invoice Date</p>
                        <p className="font-medium">{new Date(selectedInvoice.invoiceDate).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Due Date</p>
                        <p className="font-medium">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Invoice Items */}
                  <div>
                    <h4 className="font-medium mb-3">Items</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-center">Qty</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">GST</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedInvoice.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{item.product.name}</p>
                                <p className="text-xs text-muted-foreground">{item.product.sku}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.taxAmount)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Totals */}
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Subtotal:</span>
                        <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                      </div>
                      {selectedInvoice.discountAmount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Discount:</span>
                          <span>-{formatCurrency(selectedInvoice.discountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span>GST:</span>
                        <span>{formatCurrency(selectedInvoice.taxAmount)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total:</span>
                        <span>{formatCurrency(selectedInvoice.totalAmount)}</span>
                      </div>
                      {selectedInvoice.paidAmount > 0 && (
                        <>
                          <div className="flex justify-between text-sm text-green-600">
                            <span>Paid:</span>
                            <span>{formatCurrency(selectedInvoice.paidAmount)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-orange-600">
                            <span>Balance Due:</span>
                            <span>{formatCurrency(selectedInvoice.balanceDue)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <DialogFooter>
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
                      {({ loading }) => (
                        <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
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

        {/* Payment Dialog */}
        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>
                Invoice {selectedInvoice?.invoiceNumber}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="font-bold">{formatCurrency(selectedInvoice?.totalAmount || 0)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Balance Due</p>
                  <p className="font-bold text-orange-600">{formatCurrency(selectedInvoice?.balanceDue || 0)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Amount</label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentAmount(selectedInvoice?.balanceDue.toString() || "0")}
                  >
                    Full Amount
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleRecordPayment}
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
              >
                Record Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
