"use client"

import { useState, useEffect } from "react"
import { 
  TrendingUp, TrendingDown, DollarSign, Package, Users, 
  ShoppingCart, BarChart3
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatCurrencyShort } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

export default function ReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<ReportPeriod>("month")

  useEffect(() => {
    fetchDashboardData()
  }, [period])

  const fetchDashboardData = async () => {
    try {
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
        // The selector used to change nothing: it sat in this effect's
        // dependencies and in the export filename, and every period produced
        // identical figures. Anything dated is now filtered to the window.
        const allOrders = ordersData.data || []
        const allInvoices = invoicesData.success ? invoicesData.data || [] : []

        const orders = allOrders.filter((order: any) =>
          withinPeriod(order.orderDate ?? order.createdAt, period)
        )
        const invoices = allInvoices.filter((invoice: any) =>
          withinPeriod(invoice.invoiceDate ?? invoice.createdAt, period)
        )

        // Catalogue counts stay absolute — "how many customers do we have" is
        // not a question about a date range.
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

  // Using imported formatCurrency and formatCurrencyShort from @/lib/types

  const maxSalesTrend = data?.salesTrend ? Math.max(...data.salesTrend.map(t => t.amount), 1) : 1

  return (
    <AppShell title="Reports" breadcrumbs={[{ label: "Reports" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
            <p className="text-muted-foreground">Business insights, financial summaries, and performance metrics</p>
            <p className="text-xs text-muted-foreground">Figures cover {periodLabel(period)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(value) => setPeriod(value as ReportPeriod)}>
              <SelectTrigger className="w-36">
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
              onClick={() => {
                if (!data) return
                const rows = [
                  ["Metric", "Value"],
                  ["Total Revenue", data.totalRevenue.toFixed(2)],
                  ["Total Orders", data.totalOrders],
                  ["Total Customers", data.totalCustomers],
                  ["Total Products", data.totalProducts],
                  ["Pending Orders", data.pendingOrders],
                  ["Low Stock Items", data.lowStockItems],
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
              }}
            >
              Export CSV Report
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Total Revenue</CardDescription>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrencyShort(data?.totalRevenue || 0)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Live booked revenue from non-draft orders
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Total Orders</CardDescription>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.totalOrders || 0}</div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {data?.pendingOrders || 0} pending fulfillment
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Active Customers</CardDescription>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.totalCustomers || 0}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {data?.topCustomers?.length || 0} customers currently driving the most revenue
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Outstanding</CardDescription>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrencyShort(data?.outstandingAmount || 0)}
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                Accounts receivable
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Sales Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Sales Trend
              </CardTitle>
              <CardDescription>Last 7 days revenue</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-40">
                {data?.salesTrend.map((day, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2">
                    <div 
                      className="w-full bg-emerald-500 rounded-t transition-all"
                      style={{ 
                        height: `${(day.amount / maxSalesTrend) * 100}%`,
                        minHeight: day.amount > 0 ? "8px" : "2px"
                      }}
                    />
                    <span className="text-xs text-muted-foreground">{day.date}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Inventory Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Inventory Alerts
              </CardTitle>
              <CardDescription>Stock status overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-medium text-red-700">Low Stock Items</p>
                      <p className="text-sm text-red-600">Below reorder level</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-red-600">{data?.lowStockItems || 0}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Package className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="font-medium text-yellow-700">Total Products</p>
                      <p className="text-sm text-yellow-600">In catalog</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-yellow-700">{data?.totalProducts || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Top Products/Customers */}
        <Tabs defaultValue="products" className="space-y-4">
          <TabsList>
            <TabsTrigger value="products">Top Products</TabsTrigger>
            <TabsTrigger value="customers">Top Customers</TabsTrigger>
            <TabsTrigger value="orders">Recent Orders</TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            <Card>
              <CardHeader>
                <CardTitle>Top Selling Products</CardTitle>
                <CardDescription>By revenue generated</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Units Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : (data?.topProducts?.length || 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No sales data yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.topProducts?.map((item: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-medium text-sm">
                                {index + 1}
                              </span>
                              <div>
                                <p className="font-medium">{item.product.name}</p>
                                <p className="text-xs text-muted-foreground">{item.product.sku}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.revenue)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm text-muted-foreground">
                              {((item.revenue / (data?.totalRevenue || 1)) * 100).toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers">
            <Card>
              <CardHeader>
                <CardTitle>Top Customers</CardTitle>
                <CardDescription>By total order value</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-center">Orders</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : (data?.topCustomers?.length || 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          No customer data yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.topCustomers?.map((item: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-medium text-sm">
                                {index + 1}
                              </span>
                              <div>
                                <p className="font-medium">{item.customer.name}</p>
                                <p className="text-xs text-muted-foreground">{item.customer.phone}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{item.orders}</TableCell>
                          <TableCell className="text-right font-medium">
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

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Recent Orders</CardTitle>
                <CardDescription>Latest transactions</CardDescription>
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
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : (data?.recentOrders?.length || 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No orders yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.recentOrders?.map((order: any) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono">{order.orderNumber}</TableCell>
                          <TableCell>{order.customer.name}</TableCell>
                          <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(order.totalAmount)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-blue-100 text-blue-700">{order.status}</Badge>
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
