"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowDownRight,
  CreditCard,
  DollarSign,
  FileText,
  PiggyBank,
  Receipt,
  Users,
  Wallet,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
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

    const today = new Date()
    const agingBuckets = [
      { label: "Current", amount: 0 },
      { label: "1-30 days", amount: 0 },
      { label: "31-60 days", amount: 0 },
      { label: "60+ days", amount: 0 },
    ]

    invoices
      .filter((invoice) => ["unpaid", "partial", "overdue"].includes(invoice.status))
      .forEach((invoice) => {
        const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : new Date(invoice.invoiceDate)
        const daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
        const value = invoice.balanceDue ?? invoice.outstandingAmt ?? 0

        if (daysLate === 0) agingBuckets[0].amount += value
        else if (daysLate <= 30) agingBuckets[1].amount += value
        else if (daysLate <= 60) agingBuckets[2].amount += value
        else agingBuckets[3].amount += value
      })

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
  }, [customers, invoices, orders])

  const metricCards = [
    {
      label: "Booked Revenue",
      value: formatCurrency(metrics.bookedRevenue),
      hint: `${orders.length} total orders in OS`,
      icon: DollarSign,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Receivables",
      value: formatCurrency(metrics.receivables),
      hint: `${metrics.overdueInvoices.length} overdue invoices`,
      icon: Receipt,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Cash Collected",
      value: formatCurrency(metrics.paidCash),
      hint: `${metrics.recentPayments.length} recent payments logged`,
      icon: Wallet,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Avg Order Value",
      value: formatCurrency(metrics.averageOrderValue),
      hint: "Across non-draft, non-cancelled orders",
      icon: PiggyBank,
      color: "text-violet-600 bg-violet-50",
    },
  ]

  return (
    <AppShell title="Finance" breadcrumbs={[{ label: "Finance" }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Overview</h1>
          <p className="text-muted-foreground">Live finance visibility from invoices, payments, credit, and sales orders.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${metric.color}`}>
                    <metric.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">{metric.label}</p>
                    <p className="text-xl font-bold">{loading ? "..." : metric.value}</p>
                    <p className="text-xs text-muted-foreground">{metric.hint}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receivables aging</CardTitle>
              <CardDescription>Outstanding invoice balances by lateness.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {metrics.agingBuckets.map((bucket) => (
                <div key={bucket.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{bucket.label}</span>
                    <span className="font-medium">{formatCurrency(bucket.amount)}</span>
                  </div>
                  <Progress value={bucket.percent} className="h-2" />
                </div>
              ))}

              {metrics.overdueInvoices.length > 0 ? (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mr-2 inline h-4 w-4" />
                  {metrics.overdueInvoices.length} overdue invoices need follow-up.
                </div>
              ) : (
                <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                  <ArrowDownRight className="mr-2 inline h-4 w-4" />
                  No overdue invoices right now.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Customer credit health
              </CardTitle>
              <CardDescription>Outstanding customer credit exposure across active accounts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm text-muted-foreground">Customers on credit</p>
                  <p className="mt-2 text-2xl font-semibold">{metrics.customersOnCredit.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm text-muted-foreground">Outstanding credit</p>
                  <p className="mt-2 text-2xl font-semibold">{formatCurrencyShort(metrics.outstandingCredit)}</p>
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

                    return (
                      <div key={customer.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(used)} used of {formatCurrency(customer.creditLimit)}
                            </p>
                          </div>
                          <Badge className={utilization >= 90 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}>
                            {Math.round(utilization)}%
                          </Badge>
                        </div>
                        <Progress value={Math.min(utilization, 100)} className="mt-3 h-2" />
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent payments</CardTitle>
              <CardDescription>Latest cash receipts recorded against invoices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {metrics.recentPayments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                  No payments have been recorded yet.
                </div>
              ) : (
                metrics.recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between rounded-lg p-3 hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium">{payment.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.invoiceNumber} • {payment.method.replace(/_/g, " ")} • {formatDate(payment.paidAt)}
                      </p>
                    </div>
                    <span className="font-semibold text-emerald-600">{formatCurrency(payment.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice watchlist</CardTitle>
              <CardDescription>Open invoices with the highest remaining balance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {invoices
                .filter((invoice) => ["unpaid", "partial", "overdue"].includes(invoice.status))
                .sort((left, right) => (right.balanceDue ?? right.outstandingAmt) - (left.balanceDue ?? left.outstandingAmt))
                .slice(0, 5)
                .map((invoice) => (
                  <div key={invoice.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{invoice.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">{invoice.customer?.name || "Unknown customer"}</p>
                      </div>
                      <Badge className={invoice.status === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>
                        {invoice.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Due {invoice.dueDate ? formatDate(invoice.dueDate) : formatDate(invoice.invoiceDate)}</span>
                      <span className="font-semibold">{formatCurrency(invoice.balanceDue ?? invoice.outstandingAmt)}</span>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Invoices", desc: "Review invoices and payment status", icon: FileText, href: "/invoices" },
            { label: "Banking", desc: "Check bank accounts and payment flow", icon: Wallet, href: "/finance/banking" },
            { label: "Reconciliation", desc: "Balance statements and bank lines", icon: CreditCard, href: "/finance/reconciliation" },
            { label: "Chart", desc: "Manage chart of accounts and structure", icon: DollarSign, href: "/finance/chart-of-accounts" },
            { label: "Ledger", desc: "Post journals and review balances", icon: PiggyBank, href: "/finance/ledger" },
            { label: "Credit", desc: "Manage customer credit exposure", icon: Users, href: "/customers/credit" },
          ].map((link) => (
            <Link key={link.label} href={link.href}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <link.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{link.label}</p>
                    <p className="text-sm text-muted-foreground">{link.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
