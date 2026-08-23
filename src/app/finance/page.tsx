"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  DollarSign,
  FileText,
  PiggyBank,
  Receipt,
  Users,
  Wallet,
  CheckCircle2,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { KpiCard } from "@/components/ui/kpi-card"
import { PageHeader } from "@/components/ui/page-header"
import { Progress } from "@/components/ui/progress"
import { bucketise } from "@/lib/aging"
import { useSettings } from "@/lib/settings/use-settings"
import { formatCurrency, formatCurrencyShort, formatDate } from "@/lib/types"

interface PaymentLite {
  id: string
  amount: number
  paidAt: string
  method: string
  reference?: string | null
}

interface InvoiceLite {
  id: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string | null
  status: string
  totalAmount: number
  outstandingAmt: number
  paidAmount: number
  balanceDue?: number
  customer?: {
    id: string
    name: string
  } | null
  payments?: PaymentLite[]
}

interface OrderLite {
  id: string
  totalAmount: number
  status: string
  sourceChannel?: string
  orderDate: string
}

interface CustomerLite {
  id: string
  name: string
  creditLimit: number
  creditBalance: number
  outstanding?: number
  status: string
}

async function fetchCollection<T>(path: string): Promise<T[]> {
  const response = await fetch(path)
  const payload = await response.json()
  if (!payload.success) return []
  return payload.data || []
}

export default function FinanceDashboard() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<OrderLite[]>([])
  const [invoices, setInvoices] = useState<InvoiceLite[]>([])
  const [customers, setCustomers] = useState<CustomerLite[]>([])
  const { settings: agingSettings } = useSettings("aging")

  useEffect(() => {
    async function load() {
      try {
        const [nextOrders, nextInvoices, nextCustomers] = await Promise.all([
          fetchCollection<OrderLite>("/api/orders"),
          fetchCollection<InvoiceLite>("/api/invoices"),
          fetchCollection<CustomerLite>("/api/customers"),
        ])
        setOrders(nextOrders)
        setInvoices(nextInvoices)
        setCustomers(nextCustomers)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const metrics = useMemo(() => {
    const liveOrders = orders.filter((order) => !["draft", "cancelled"].includes(order.status))
    const bookedRevenue = liveOrders.reduce((sum, order) => sum + order.totalAmount, 0)
    const receivables = invoices
      .filter((invoice) => ["unpaid", "partial", "overdue"].includes(invoice.status))
      .reduce((sum, invoice) => sum + (invoice.balanceDue ?? invoice.outstandingAmt ?? 0), 0)
    const paidCash = invoices
      .flatMap((invoice) => invoice.payments || [])
      .reduce((sum, payment) => sum + payment.amount, 0)
    const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue")
    const customersOnCredit = customers.filter((customer) => customer.creditLimit > 0)
    const outstandingCredit = customersOnCredit.reduce(
      (sum, customer) => sum + (customer.outstanding || customer.creditBalance || 0),
      0
    )

    const { buckets: agingBuckets } = bucketise(
      invoices
        .filter((invoice) => ["unpaid", "partial", "overdue"].includes(invoice.status))
        .map((invoice) => ({
          dueDate: invoice.dueDate,
          invoiceDate: invoice.invoiceDate,
          outstanding: invoice.balanceDue ?? invoice.outstandingAmt ?? 0,
          status: invoice.status,
        })),
      agingSettings
    )

    const maxAging = Math.max(...agingBuckets.map((bucket) => bucket.amount), 1)
    const recentPayments = invoices
      .flatMap((invoice) =>
        (invoice.payments || []).map((payment) => ({
          id: payment.id,
          paidAt: payment.paidAt,
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference,
          customerName: invoice.customer?.name || "Unknown customer",
          invoiceNumber: invoice.invoiceNumber,
        }))
      )
      .sort((left, right) => +new Date(right.paidAt) - +new Date(left.paidAt))
      .slice(0, 6)

    return {
      bookedRevenue,
      receivables,
      paidCash,
      overdueInvoices,
      customersOnCredit,
      outstandingCredit,
      averageOrderValue: liveOrders.length ? bookedRevenue / liveOrders.length : 0,
      agingBuckets: agingBuckets.map((bucket) => ({
        ...bucket,
        percent: (bucket.amount / maxAging) * 100,
      })),
      recentPayments,
    }
  }, [customers, invoices, orders, agingSettings])

  return (
    <AppShell title="Finance" breadcrumbs={[{ label: "Finance" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Financial Overview"
          description="Live finance visibility from invoices, payments, credit exposure, and sales orders."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/invoices">
                  <FileText className="mr-2 h-4 w-4" />
                  View Invoices
                </Link>
              </Button>
              <Button asChild>
                <Link href="/finance/banking">
                  <Wallet className="mr-2 h-4 w-4" />
                  Banking & Reconciliation
                </Link>
              </Button>
            </div>
          }
        />

        {/* Top KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Booked Revenue"
            value={loading ? "..." : formatCurrency(metrics.bookedRevenue)}
            description={`${orders.length} total orders in SupplySure`}
            icon={DollarSign}
          />
          <KpiCard
            title="Receivables"
            value={loading ? "..." : formatCurrency(metrics.receivables)}
            description={`${metrics.overdueInvoices.length} overdue invoices`}
            icon={Receipt}
          />
          <KpiCard
            title="Cash Collected"
            value={loading ? "..." : formatCurrency(metrics.paidCash)}
            description={`${metrics.recentPayments.length} recent payments logged`}
            icon={Wallet}
          />
          <KpiCard
            title="Avg Order Value"
            value={loading ? "..." : formatCurrency(metrics.averageOrderValue)}
            description="Across non-draft, non-cancelled orders"
            icon={PiggyBank}
          />
        </div>

        {/* Quick Navigation Hub */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Invoices", desc: "Customer billing & payments", icon: FileText, href: "/invoices" },
            { label: "Banking", desc: "Settlement & bank feeds", icon: Wallet, href: "/finance/banking" },
            { label: "Reconciliation", desc: "Match statements & books", icon: CheckCircle2, href: "/finance/reconciliation" },
            { label: "Chart of Accounts", desc: "Structure & categorization", icon: DollarSign, href: "/finance/chart-of-accounts" },
            { label: "General Ledger", desc: "Journals & double-entry", icon: PiggyBank, href: "/finance/ledger" },
            { label: "Customer Credit", desc: "Risk limits & exposure", icon: Users, href: "/customers/credit" },
          ].map((link) => (
            <Link key={link.label} href={link.href} className="group">
              <Card className="h-full border-border bg-card shadow-sm transition-all hover:border-primary/50 hover:shadow-md">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <link.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{link.label}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{link.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Receivables Aging & Customer Credit Health */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Receivables Aging</CardTitle>
              <CardDescription>Outstanding invoice balances grouped by overdue duration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {metrics.agingBuckets.map((bucket) => (
                <div key={bucket.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{bucket.label}</span>
                    <span className="font-semibold text-foreground">{formatCurrency(bucket.amount)}</span>
                  </div>
                  <Progress value={bucket.percent} className="h-2 bg-muted" />
                </div>
              ))}

              {metrics.overdueInvoices.length > 0 ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{metrics.overdueInvoices.length} overdue invoices require immediate follow-up.</span>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>No overdue invoices at this time. All receivables are in good standing.</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <CreditCard className="h-4 w-4 text-primary" />
                Customer Credit Exposure
              </CardTitle>
              <CardDescription>Outstanding credit utilization across active customer accounts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accounts on Credit</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{metrics.customersOnCredit.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding Exposure</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrencyShort(metrics.outstandingCredit)}</p>
                </div>
              </div>

              <div className="space-y-3">
                {customers
                  .filter((customer) => customer.creditLimit > 0)
                  .sort((left, right) => (right.outstanding || 0) - (left.outstanding || 0))
                  .slice(0, 4)
                  .map((customer) => {
                    const used = customer.outstanding || customer.creditBalance || 0
                    const utilization = customer.creditLimit > 0 ? (used / customer.creditLimit) * 100 : 0
                    const isHighRisk = utilization >= 90

                    return (
                      <div key={customer.id} className="rounded-lg border border-border bg-card p-3.5 shadow-none transition-colors hover:bg-muted/30">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(used)} of {formatCurrency(customer.creditLimit)} limit
                            </p>
                          </div>
                          <Badge variant={isHighRisk ? "destructive" : "secondary"}>
                            {Math.round(utilization)}% used
                          </Badge>
                        </div>
                        <Progress
                          value={Math.min(utilization, 100)}
                          className="mt-2.5 h-1.5 bg-muted"
                        />
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Payments & Invoice Watchlist */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Recent Cash Receipts</CardTitle>
              <CardDescription>Latest customer payments recorded across sales invoices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {metrics.recentPayments.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="No payments recorded"
                  description="Payments logged against invoices will appear here."
                  className="min-h-[180px] p-6"
                />
              ) : (
                metrics.recentPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-card p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-medium text-foreground">{payment.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.invoiceNumber} • {payment.method.replace(/_/g, " ")} • {formatDate(payment.paidAt)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatCurrency(payment.amount)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Invoice Watchlist</CardTitle>
              <CardDescription>Open invoices with the largest remaining balances.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {invoices
                .filter((invoice) => ["unpaid", "partial", "overdue"].includes(invoice.status))
                .sort((left, right) => (right.balanceDue ?? right.outstandingAmt) - (left.balanceDue ?? left.outstandingAmt))
                .slice(0, 5)
                .map((invoice) => {
                  const balance = invoice.balanceDue ?? invoice.outstandingAmt
                  const isOverdue = invoice.status === "overdue"

                  return (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-card p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm font-semibold text-foreground">{invoice.invoiceNumber}</p>
                          <Badge variant={isOverdue ? "destructive" : "secondary"}>
                            {invoice.status}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {invoice.customer?.name || "Unknown customer"} • Due {invoice.dueDate ? formatDate(invoice.dueDate) : formatDate(invoice.invoiceDate)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-foreground">
                        {formatCurrency(balance)}
                      </span>
                    </div>
                  )
                })}
              {invoices.filter((invoice) => ["unpaid", "partial", "overdue"].includes(invoice.status)).length === 0 && (
                <EmptyState
                  icon={CheckCircle2}
                  title="No outstanding invoices"
                  description="All customer invoices are fully settled."
                  className="min-h-[180px] p-6"
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
