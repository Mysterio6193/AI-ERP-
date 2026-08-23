"use client"

import { useState, useEffect } from "react"
import { 
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  CheckCircle,
  Clock,
  DollarSign,
  Download,
  FileSpreadsheet,
  Layers,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { KpiCard } from "@/components/ui/kpi-card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, formatCurrencyShort, formatDate } from "@/lib/types"
import {
  periodLabel,
  withinPeriod,
  type ReportPeriod,
} from "@/lib/reporting-period"

interface DashboardData {
  totalRevenue: number
  totalOrders: number
  totalCustomers: number
  totalProducts: number
  pendingOrders: number
  lowStockItems: number
  outstandingAmount: number
  recentOrders: any[]
  topProducts: any[]
  topCustomers: any[]
  salesTrend: { date: string; amount: number }[]
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending_approval: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  approved: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  picking: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  packed: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  dispatched: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  delivered: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  invoiced: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  cancelled: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
}

export default function ReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<ReportPeriod>("month")

  useEffect(() => {
    fetchDashboardData()
  }, [period])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      // Fetch all data in parallel
      const [ordersRes, customersRes, productsRes, inventoryRes, invoicesRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/customers"),
        fetch("/api/products"),
        fetch("/api/inventory"),
        fetch("/api/invoices"),
      ])

      const ordersData = await ordersRes.json()
      const customersData = await customersRes.json()
      const productsData = await productsRes.json()
      const inventoryData = await inventoryRes.json()
      const invoicesData = await invoicesRes.json()

      if (ordersData.success && customersData.success && productsData.success) {
        const allOrders = ordersData.data || []
        const allInvoices = invoicesData.success ? invoicesData.data || [] : []

        const orders = allOrders.filter((order: any) =>
          withinPeriod(order.orderDate ?? order.createdAt, period)
        )
        const invoices = allInvoices.filter((invoice: any) =>
          withinPeriod(invoice.invoiceDate ?? invoice.createdAt, period)
        )

        const customers = customersData.data || []
        const products = productsData.data || []
        const inventory = inventoryData.data || []

        // Calculate metrics
        const completedOrders = orders.filter((o: any) => 
          !["draft", "cancelled"].includes(o.status)
        )
        const totalRevenue = completedOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0)
        const pendingOrders = orders.filter((o: any) => 
          ["approved", "picking", "packed", "dispatched"].includes(o.status)
        )
        const lowStockItems = inventory.filter((i: any) => i.quantity <= i.reorderLevel)
        const outstandingAmount = invoices
          .filter((invoice: any) => ["unpaid", "partial", "overdue"].includes(invoice.status))
          .reduce((sum: number, invoice: any) => sum + (invoice.balanceDue || invoice.outstandingAmt || 0), 0)

        // Top products by order quantity
        const productSales: Record<string, { product: any; quantity: number; revenue: number }> = {}
        orders.forEach((order: any) => {
          order.items?.forEach((item: any) => {
            if (!productSales[item.productId]) {
              productSales[item.productId] = { product: item.product, quantity: 0, revenue: 0 }
            }
            productSales[item.productId].quantity += item.quantity
            productSales[item.productId].revenue += item.total
          })
        })
        const topProducts = Object.values(productSales)
          .sort((a: any, b: any) => b.revenue - a.revenue)
          .slice(0, 5)

        // Top customers by revenue
        const customerRevenue: Record<string, { customer: any; orders: number; revenue: number }> = {}
        orders.forEach((order: any) => {
          if (!customerRevenue[order.customerId]) {
            customerRevenue[order.customerId] = { customer: order.customer, orders: 0, revenue: 0 }
          }
          customerRevenue[order.customerId].orders += 1
          customerRevenue[order.customerId].revenue += order.totalAmount
        })
        const topCustomers = Object.values(customerRevenue)
          .sort((a: any, b: any) => b.revenue - a.revenue)
          .slice(0, 5)

        // Sales trend (last 7 days)
        const salesTrend: Array<{ date: string; amount: number }> = []
        for (let i = 6; i >= 0; i--) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          const dateStr = date.toISOString().split("T")[0]
          const dayOrders = allOrders.filter((o: any) =>
            (o.orderDate || o.createdAt || "").split("T")[0] === dateStr &&
            !["draft", "cancelled"].includes(o.status)
          )
          salesTrend.push({
            date: date.toLocaleDateString("en-US", { weekday: "short" }),
            amount: dayOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0)
          })
        }

        setData({
          totalRevenue,
          totalOrders: orders.length,
          totalCustomers: customers.length,
          totalProducts: products.length,
          pendingOrders: pendingOrders.length,
          lowStockItems: lowStockItems.length,
          outstandingAmount,
          recentOrders: orders.slice(0, 5),
          topProducts,
          topCustomers,
          salesTrend,
        })
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = () => {
    if (!data) return
    const rows = [
      ["Metric", "Value"],
      ["Total Revenue", data.totalRevenue.toFixed(2)],
      ["Total Orders", String(data.totalOrders)],
      ["Total Customers", String(data.totalCustomers)],
      ["Total Products", String(data.totalProducts)],
      ["Pending Orders", String(data.pendingOrders)],
      ["Low Stock Items", String(data.lowStockItems)],
      ["Outstanding Invoiced Amount", data.outstandingAmount.toFixed(2)],
    ]
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `Executive_Report_${period}_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <AppShell title="Reports" breadcrumbs={[{ label: "Analytics & Reports" }]}>
      <div className="space-y-6 pb-6">
        {/* Page Header */}
        <PageHeader
          title="Executive Reports & Analytics"
          description="Business insights, financial performance, inventory velocity, and order summaries."
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <Select value={period} onValueChange={(value) => setPeriod(value as ReportPeriod)}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={exportCsv}
                disabled={!data}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          }
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary border border-primary/20">
              <Clock className="h-3 w-3" />
              Reporting Window: {periodLabel(period)}
            </span>
          </div>
        </PageHeader>

        {/* 4 KPI Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Booked Revenue"
            value={formatCurrencyShort(data?.totalRevenue || 0)}
            description={`Live sales from ${data?.totalOrders || 0} non-draft orders`}
            icon={DollarSign}
          />
          <KpiCard
            title="Total Orders"
            value={String(data?.totalOrders || 0)}
            description={`${data?.pendingOrders || 0} pending fulfillment pipeline`}
            icon={ShoppingCart}
          />
          <KpiCard
            title="Trading Accounts"
            value={String(data?.totalCustomers || 0)}
            description={`${data?.topCustomers?.length || 0} key revenue drivers`}
            icon={Users}
          />
          <KpiCard
            title="Outstanding AR"
            value={formatCurrencyShort(data?.outstandingAmount || 0)}
            description="Open and overdue invoice balances"
            icon={TrendingUp}
          />
        </div>

        {/* Charts & Health Section */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Sales Trend Bar Chart */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                <BarChart3 className="h-4 w-4 text-primary" />
                Sales Velocity (Last 7 Days)
              </CardTitle>
              <CardDescription>Daily revenue intake volume across all accounts.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.salesTrend || []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs text-muted-foreground" stroke="currentColor" />
                    <YAxis
                      className="text-xs text-muted-foreground"
                      stroke="currentColor"
                      tickFormatter={(val) => formatCurrencyShort(Number(val))}
                    />
                    <Tooltip
                      formatter={(val: number) => [formatCurrency(val), "Revenue"]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--card-foreground))",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Alerts & Stock Overview */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Package className="h-4 w-4 text-primary" />
                Inventory & Stock Overview
              </CardTitle>
              <CardDescription>Real-time catalog size and reorder health.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 transition-all hover:bg-rose-500/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <TrendingDown className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Low Stock Items</p>
                    <p className="text-xs text-muted-foreground">Inventory below safety reorder thresholds</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-base font-bold px-3 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
                  {data?.lowStockItems || 0}
                </Badge>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-4 transition-all hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Total Active SKUs</p>
                    <p className="text-xs text-muted-foreground">Active products maintained in product catalog</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-base font-bold px-3 py-1">
                  {data?.totalProducts || 0}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Breakdown Tabs */}
        <Tabs defaultValue="products" className="space-y-4">
          <TabsList>
            <TabsTrigger value="products">Top Products</TabsTrigger>
            <TabsTrigger value="customers">Top Customers</TabsTrigger>
            <TabsTrigger value="orders">Recent Orders</TabsTrigger>
          </TabsList>

          {/* Top Products */}
          <TabsContent value="products">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground">Top Selling Products</CardTitle>
                <CardDescription>Ranked by revenue contribution in selected period.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Units Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">% of Period Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-sm text-muted-foreground">
                          Loading products data...
                        </TableCell>
                      </TableRow>
                    ) : (data?.topProducts?.length || 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="p-6">
                          <EmptyState
                            icon={Package}
                            title="No product sales data"
                            description="No products were sold during the selected reporting window."
                            className="border-none bg-transparent"
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.topProducts?.map((item: any, index: number) => (
                        <TableRow key={index} className="hover:bg-muted/40 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs shrink-0">
                                {index + 1}
                              </span>
                              <div>
                                <p className="font-medium text-sm text-foreground">{item.product?.name || "Unknown Product"}</p>
                                <p className="text-xs font-mono text-muted-foreground">{item.product?.sku || "—"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-medium text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right font-semibold text-sm text-foreground">
                            {formatCurrency(item.revenue)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className="font-normal text-xs">
                              {((item.revenue / (data?.totalRevenue || 1)) * 100).toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Top Customers */}
          <TabsContent value="customers">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground">Top Customers</CardTitle>
                <CardDescription>Ranked by total booked order value.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer Account</TableHead>
                      <TableHead className="text-center">Orders</TableHead>
                      <TableHead className="text-right">Total Booked Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-12 text-sm text-muted-foreground">
                          Loading customer accounts...
                        </TableCell>
                      </TableRow>
                    ) : (data?.topCustomers?.length || 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="p-6">
                          <EmptyState
                            icon={Users}
                            title="No customer revenue"
                            description="No customer accounts traded during the selected reporting window."
                            className="border-none bg-transparent"
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.topCustomers?.map((item: any, index: number) => (
                        <TableRow key={index} className="hover:bg-muted/40 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs shrink-0">
                                {index + 1}
                              </span>
                              <div>
                                <p className="font-medium text-sm text-foreground">{item.customer?.name || "Unknown Customer"}</p>
                                <p className="text-xs text-muted-foreground">{item.customer?.phone || item.customer?.email || "—"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-medium text-sm">{item.orders}</TableCell>
                          <TableCell className="text-right font-semibold text-sm text-foreground">
                            {formatCurrency(item.revenue)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recent Orders */}
          <TabsContent value="orders">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground">Recent Orders</CardTitle>
                <CardDescription>Latest orders booked in selected window.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                          Loading orders...
                        </TableCell>
                      </TableRow>
                    ) : (data?.recentOrders?.length || 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="p-6">
                          <EmptyState
                            icon={ShoppingCart}
                            title="No orders found"
                            description="No orders were placed during the selected reporting window."
                            className="border-none bg-transparent"
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.recentOrders?.map((order: any) => (
                        <TableRow key={order.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-mono text-sm font-semibold text-foreground">{order.orderNumber}</TableCell>
                          <TableCell className="text-sm font-medium text-foreground">{order.customer?.name || "Unknown Customer"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {order.orderDate ? formatDate(order.orderDate) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm text-foreground">
                            {formatCurrency(order.totalAmount)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={STATUS_BADGE_CLASSES[order.status] || STATUS_BADGE_CLASSES.draft}
                            >
                              {order.status?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}

