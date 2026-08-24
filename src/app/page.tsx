"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  XCircle,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { AppShell } from "@/components/layout/app-shell"
import { COMMERCE_CHANNEL_COLORS, COMMERCE_CHANNEL_LABELS, isCustomerChannel, normalizeCommerceChannel } from "@/lib/commerce"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/ui/kpi-card"
import { PageHeader } from "@/components/ui/page-header"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, formatCurrencyShort, formatDate } from "@/lib/types"
import { truncateLabel } from "@/lib/truncate"

interface OrderItemLite {
  productId: string
  quantity: number
  total: number
  product?: {
    id: string
    name: string
    sku: string
  } | null
}

interface OrderLite {
  id: string
  orderNumber: string
  customerId: string
  orderDate: string
  requiredDate?: string | null
  totalAmount: number
  status: string
  sourceChannel?: string
  customer?: {
    name: string
  } | null
  items?: OrderItemLite[]
}

interface CustomerLite {
  id: string
  name: string
  status: string
}

interface InventoryLite {
  id: string
  quantity: number
  reorderLevel: number
  stockValue?: number
  warehouse?: {
    name: string
  } | null
  product?: {
    id: string
    name: string
    sku: string
  } | null
}

interface InvoiceLite {
  id: string
  invoiceNumber: string
  status: string
  createdAt: string
  dueDate?: string | null
  balanceDue?: number
  outstandingAmt?: number
  customer?: {
    name: string
  } | null
}

interface PickListLite {
  id: string
  pickNumber: string
  orderNumber: string
  customerName: string
  assignedTo: string | null
  status: string
  priority: string
  createdAt: string
  progress: number
  items: Array<{ id: string }>
}

interface RouteActivityLite {
  at: string
  label: string
}

interface RouteStopLite {
  id: string
  customerName: string
  status: string
  etaLabel: string
  codAmount: number
  codCollected: boolean
  deliveredAt?: string | null
}

interface RouteLite {
  id: string
  routeNumber: string
  driverName: string
  warehouseName: string
  vehicle: string
  status: string
  totalStops: number
  completedStops: number
  remainingStops: number
  failedStops: number
  progress: number
  outstandingCod: number
  nextStopId?: string | null
  recentActivity: RouteActivityLite[]
  stops: RouteStopLite[]
}

interface DashboardData {
  todaySales: number
  yesterdaySales: number
  weekSales: number
  previousWeekSales: number
  todayOrders: number
  totalOrders: number
  commerceOrders: number
  websiteOrders: number
  appOrders: number
  commerceRevenue: number
  openOrders: number
  pendingApprovals: number
  activeCustomers: number
  outstandingReceivables: number
  overdueInvoices: number
  lowStockItems: number
  lowStockUnitsShort: number
  pickQueue: number
  picksInProgress: number
  routesInProgress: number
  remainingStops: number
  deliveredToday: number
  outstandingCod: number
  recentOrders: OrderLite[]
  lowStockProducts: Array<{
    id: string
    name: string
    sku: string
    quantity: number
    reorderLevel: number
    warehouseName: string
  }>
  topProducts: Array<{
    name: string
    sku: string
    quantity: number
    revenue: number
  }>
  topCustomers: Array<{
    name: string
    orders: number
    revenue: number
  }>
  salesTrend: Array<{
    date: string
    sales: number
    orders: number
  }>
  orderStatusDistribution: Array<{
    status: string
    count: number
  }>
  fulfillmentStages: Array<{
    key: string
    label: string
    value: number
    color: string
  }>
  routeSnapshots: Array<{
    id: string
    routeNumber: string
    driverName: string
    warehouseName: string
    vehicle: string
    status: string
    progress: number
    remainingStops: number
    completedStops: number
    totalStops: number
    failedStops: number
    outstandingCod: number
    nextStopLabel: string
  }>
  pickSnapshots: Array<{
    id: string
    pickNumber: string
    orderNumber: string
    customerName: string
    assignedTo: string | null
    status: string
    priority: string
    progress: number
    itemCount: number
  }>
  activityFeed: Array<{
    id: string
    at: string
    label: string
    routeNumber: string
  }>
  openInvoices: Array<{
    id: string
    invoiceNumber: string
    customerName: string
    status: string
    balanceDue: number
    dueDate?: string | null
  }>
}

const REFRESH_INTERVAL_MS = 30000

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  picking: "Picking",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
}

const STATUS_COLORS: Record<string, string> = {
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

const ROUTE_STATUS_COLORS: Record<string, string> = {
  planned: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  cancelled: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
}

const PICK_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  cancelled: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
}

const CHART_COLORS = {
  emerald: "#10b981",
  blue: "#3b82f6",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  slate: "#64748b",
  red: "#ef4444",
}

const EMPTY_DASHBOARD: DashboardData = {
  todaySales: 0,
  yesterdaySales: 0,
  weekSales: 0,
  previousWeekSales: 0,
  todayOrders: 0,
  totalOrders: 0,
  commerceOrders: 0,
  websiteOrders: 0,
  appOrders: 0,
  commerceRevenue: 0,
  openOrders: 0,
  pendingApprovals: 0,
  activeCustomers: 0,
  outstandingReceivables: 0,
  overdueInvoices: 0,
  lowStockItems: 0,
  lowStockUnitsShort: 0,
  pickQueue: 0,
  picksInProgress: 0,
  routesInProgress: 0,
  remainingStops: 0,
  deliveredToday: 0,
  outstandingCod: 0,
  recentOrders: [],
  lowStockProducts: [],
  topProducts: [],
  topCustomers: [],
  salesTrend: [],
  orderStatusDistribution: [],
  fulfillmentStages: [],
  routeSnapshots: [],
  pickSnapshots: [],
  activityFeed: [],
  openInvoices: [],
}

function isSameDay(dateA: Date | string | null | undefined, dateB: Date) {
  if (!dateA) return false
  return new Date(dateA).toDateString() === dateB.toDateString()
}

function formatPercentChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0
  }

  return ((current - previous) / previous) * 100
}

function formatShortTime(date: Date | null) {
  if (!date) return "Waiting for first sync"
  return date.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  })
}

async function fetchCollection<T>(path: string) {
  try {
    const response = await fetch(path, { cache: "no-store" })
    const payload = await response.json()
    return payload?.success ? ((payload.data as T[]) || []) : []
  } catch (error) {
    console.error(`Failed to fetch ${path}:`, error)
    return [] as T[]
  }
}

function buildDashboardData({
  orders,
  customers,
  inventory,
  invoices,
  pickLists,
  routes,
}: {
  orders: OrderLite[]
  customers: CustomerLite[]
  inventory: InventoryLite[]
  invoices: InvoiceLite[]
  pickLists: PickListLite[]
  routes: RouteLite[]
}): DashboardData {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const liveOrders = orders.filter((order) => !["draft", "cancelled"].includes(order.status))
  const commerceOrders = orders.filter((order) => isCustomerChannel(order.sourceChannel))
  const websiteOrders = commerceOrders.filter((order) => normalizeCommerceChannel(order.sourceChannel) === "customer_web")
  const appOrders = commerceOrders.filter((order) => normalizeCommerceChannel(order.sourceChannel) === "customer_app")
  const todayOrders = liveOrders.filter((order) => isSameDay(order.orderDate, today))
  const yesterdayOrders = liveOrders.filter((order) => isSameDay(order.orderDate, yesterday))

  const todaySales = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0)
  const yesterdaySales = yesterdayOrders.reduce((sum, order) => sum + order.totalAmount, 0)

  const salesTrend = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - offset))
    const dayOrders = liveOrders.filter((order) => isSameDay(order.orderDate, date))

    return {
      date: date.toLocaleDateString("en-AU", { weekday: "short" }),
      sales: dayOrders.reduce((sum, order) => sum + order.totalAmount, 0),
      orders: dayOrders.length,
    }
  })

  const currentWeekOrders = liveOrders.filter((order) => {
    const orderDate = new Date(order.orderDate).getTime()
    return orderDate >= new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).getTime()
  })

  const previousWeekOrders = liveOrders.filter((order) => {
    const orderDate = new Date(order.orderDate).getTime()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13).getTime()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7).getTime()
    return orderDate >= start && orderDate <= end
  })

  const weekSales = currentWeekOrders.reduce((sum, order) => sum + order.totalAmount, 0)
  const previousWeekSales = previousWeekOrders.reduce((sum, order) => sum + order.totalAmount, 0)

  const outstandingReceivables = invoices
    .filter((invoice) => ["unpaid", "partial", "overdue"].includes(invoice.status))
    .reduce((sum, invoice) => sum + (invoice.balanceDue || invoice.outstandingAmt || 0), 0)

  const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue").length

  const lowStockProducts = inventory
    .filter((item) => item.quantity <= item.reorderLevel)
    .sort((left, right) => (right.reorderLevel - right.quantity) - (left.reorderLevel - left.quantity))
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      name: item.product?.name || "Unknown Product",
      sku: item.product?.sku || "N/A",
      quantity: item.quantity,
      reorderLevel: item.reorderLevel,
      warehouseName: item.warehouse?.name || "No warehouse",
    }))

  const lowStockUnitsShort = lowStockProducts.reduce((sum, item) => sum + Math.max(item.reorderLevel - item.quantity, 0), 0)

  const productSales: Record<string, { name: string; sku: string; quantity: number; revenue: number }> = {}
  for (const order of liveOrders) {
    for (const item of order.items || []) {
      const key = item.productId
      if (!productSales[key]) {
        productSales[key] = {
          name: item.product?.name || "Unknown Product",
          sku: item.product?.sku || "N/A",
          quantity: 0,
          revenue: 0,
        }
      }

      productSales[key].quantity += item.quantity
      productSales[key].revenue += item.total
    }
  }

  const topProducts = Object.values(productSales)
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 5)

  const customerRevenue: Record<string, { name: string; orders: number; revenue: number }> = {}
  for (const order of liveOrders) {
    if (!customerRevenue[order.customerId]) {
      customerRevenue[order.customerId] = {
        name: order.customer?.name || "Unknown Customer",
        orders: 0,
        revenue: 0,
      }
    }

    customerRevenue[order.customerId].orders += 1
    customerRevenue[order.customerId].revenue += order.totalAmount
  }

  const topCustomers = Object.values(customerRevenue)
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 5)

  const statusCounts: Record<string, number> = {}
  for (const order of orders) {
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1
  }

  const orderStatusDistribution = Object.entries(statusCounts)
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count)

  const fulfillmentStages = [
    { key: "approved", label: "Approved", color: "bg-blue-500" },
    { key: "picking", label: "Picking", color: "bg-orange-500" },
    { key: "packed", label: "Packed", color: "bg-purple-500" },
    { key: "dispatched", label: "Dispatched", color: "bg-indigo-500" },
    { key: "delivered", label: "Delivered", color: "bg-emerald-500" },
    { key: "invoiced", label: "Invoiced", color: "bg-teal-500" },
  ].map((stage) => ({
    ...stage,
    value: statusCounts[stage.key] || 0,
  }))

  const openOrders = orders.filter((order) =>
    ["pending_approval", "approved", "picking", "packed", "dispatched"].includes(order.status)
  ).length

  const pendingApprovals = statusCounts.pending_approval || 0
  const pickQueue = pickLists.filter((pick) => pick.status === "pending").length
  const picksInProgress = pickLists.filter((pick) => pick.status === "in_progress").length
  const routesInProgress = routes.filter((route) => route.status === "in_progress").length
  const remainingStops = routes.reduce((sum, route) => sum + route.remainingStops, 0)
  const outstandingCod = routes.reduce((sum, route) => sum + route.outstandingCod, 0)

  const deliveredToday = routes
    .flatMap((route) => route.stops)
    .filter((stop) => stop.status === "delivered" && isSameDay(stop.deliveredAt, today)).length

  const routeSnapshots = routes
    .filter((route) => route.totalStops > 0)
    .sort((left, right) => {
      const leftPriority = left.status === "in_progress" ? 0 : left.status === "planned" ? 1 : 2
      const rightPriority = right.status === "in_progress" ? 0 : right.status === "planned" ? 1 : 2
      return leftPriority - rightPriority
    })
    .slice(0, 4)
    .map((route) => {
      const nextStop = route.stops.find((stop) => !["delivered", "failed", "returned"].includes(stop.status)) || route.stops[0]

      return {
        id: route.id,
        routeNumber: route.routeNumber,
        driverName: route.driverName,
        warehouseName: route.warehouseName,
        vehicle: route.vehicle,
        status: route.status,
        progress: route.progress,
        remainingStops: route.remainingStops,
        completedStops: route.completedStops,
        totalStops: route.totalStops,
        failedStops: route.failedStops,
        outstandingCod: route.outstandingCod,
        nextStopLabel: nextStop ? `${nextStop.customerName} • ${nextStop.etaLabel}` : "Route complete",
      }
    })

  const pickSnapshots = pickLists
    .filter((pick) => !["completed", "cancelled"].includes(pick.status))
    .sort((left, right) => {
      const leftPriority = left.priority === "high" ? 0 : 1
      const rightPriority = right.priority === "high" ? 0 : 1
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      return +new Date(right.createdAt) - +new Date(left.createdAt)
    })
    .slice(0, 5)
    .map((pick) => ({
      id: pick.id,
      pickNumber: pick.pickNumber,
      orderNumber: pick.orderNumber,
      customerName: pick.customerName,
      assignedTo: pick.assignedTo,
      status: pick.status,
      priority: pick.priority,
      progress: pick.progress,
      itemCount: pick.items.length,
    }))

  const activityFeed = routes
    .flatMap((route) =>
      route.recentActivity.map((activity) => ({
        id: `${route.id}-${activity.at}-${activity.label}`,
        at: activity.at,
        label: activity.label,
        routeNumber: route.routeNumber,
      }))
    )
    .sort((left, right) => +new Date(right.at) - +new Date(left.at))
    .slice(0, 6)

  const openInvoices = invoices
    .filter((invoice) => ["unpaid", "partial", "overdue"].includes(invoice.status))
    .sort((left, right) => {
      const leftDate = left.dueDate ? +new Date(left.dueDate) : +new Date(left.createdAt)
      const rightDate = right.dueDate ? +new Date(right.dueDate) : +new Date(right.createdAt)
      return leftDate - rightDate
    })
    .slice(0, 5)
    .map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customer?.name || "Unknown Customer",
      status: invoice.status,
      balanceDue: invoice.balanceDue || invoice.outstandingAmt || 0,
      dueDate: invoice.dueDate,
    }))

  return {
    todaySales,
    yesterdaySales,
    weekSales,
    previousWeekSales,
    todayOrders: todayOrders.length,
    totalOrders: orders.length,
    commerceOrders: commerceOrders.length,
    websiteOrders: websiteOrders.length,
    appOrders: appOrders.length,
    commerceRevenue: commerceOrders.reduce((sum, order) => sum + order.totalAmount, 0),
    openOrders,
    pendingApprovals,
    activeCustomers: customers.filter((customer) => customer.status === "active").length,
    outstandingReceivables,
    overdueInvoices,
    lowStockItems: inventory.filter((item) => item.quantity <= item.reorderLevel).length,
    lowStockUnitsShort,
    pickQueue,
    picksInProgress,
    routesInProgress,
    remainingStops,
    deliveredToday,
    outstandingCod,
    recentOrders: orders.slice(0, 6),
    lowStockProducts,
    topProducts,
    topCustomers,
    salesTrend,
    orderStatusDistribution,
    fulfillmentStages,
    routeSnapshots,
    pickSnapshots,
    activityFeed,
    openInvoices,
  }
}


/**
 * A chart axis tick that stays on one line.
 *
 * Recharts' default tick wraps a long label to fit the axis width, so
 * "Independent Grocers Network" rendered as "Independent" stacked above
 * "Groce…" — two lines that read as two separate customers. This renders a
 * single <text> and shortens with an ellipsis instead, and carries the full
 * name in a <title> so hovering still gives the real one.
 */
function SingleLineTick(props: {
  x?: number
  y?: number
  payload?: { value?: unknown }
  fill?: string
}) {
  const full = String(props.payload?.value ?? "")

  return (
    <text
      x={props.x}
      y={props.y}
      dy={4}
      textAnchor="end"
      fill="#64748b"
      fontSize={11}
    >
      <title>{full}</title>
      {truncateLabel(full, 20)}
    </text>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const refreshInFlight = useRef(false)

  useEffect(() => {
    void refreshDashboard({ initial: true })

    const interval = window.setInterval(() => {
      void refreshDashboard({ background: true })
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [])

  async function refreshDashboard(options?: { initial?: boolean; background?: boolean }) {
    if (refreshInFlight.current) return

    refreshInFlight.current = true
    if (options?.initial) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      setError(null)

      const [orders, customers, inventory, invoices, pickLists, routes] = await Promise.all([
        fetchCollection<OrderLite>("/api/orders"),
        fetchCollection<CustomerLite>("/api/customers"),
        fetchCollection<InventoryLite>("/api/inventory"),
        fetchCollection<InvoiceLite>("/api/invoices"),
        fetchCollection<PickListLite>("/api/pick-lists"),
        fetchCollection<RouteLite>("/api/routes"),
      ])

      setData(buildDashboardData({ orders, customers, inventory, invoices, pickLists, routes }))
      setLastUpdatedAt(new Date())
    } catch (refreshError) {
      console.error(refreshError)
      setError("Unable to refresh the dashboard right now.")
    } finally {
      refreshInFlight.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }

  const salesDelta = formatPercentChange(data.todaySales, data.yesterdaySales)
  const weeklyDelta = formatPercentChange(data.weekSales, data.previousWeekSales)
  const routeCompletion = data.deliveredToday + data.remainingStops > 0
    ? (data.deliveredToday / (data.deliveredToday + data.remainingStops)) * 100
    : 0

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6 pb-6">
        {/* Page Header */}
        <PageHeader
          title="Operations Command Center"
          description="Orders, warehouse, delivery, and receivables in real-time."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshDashboard()}
                disabled={refreshing || loading}
              >
                {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
              <Link href="/orders?action=new">
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  New order
                </Button>
              </Link>
              <Link href="/customers?action=new">
                <Button variant="outline" size="sm">
                  <Users className="mr-2 h-4 w-4" />
                  Add customer
                </Button>
              </Link>
              <Link href="/invoices">
                <Button variant="outline" size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  Invoices
                </Button>
              </Link>
            </div>
          }
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Operations
            </span>
            <span>•</span>
            <span>Auto-refreshing 30s</span>
            <span>•</span>
            <span>{loading && !lastUpdatedAt ? "Syncing metrics..." : `Last synced ${formatShortTime(lastUpdatedAt)}`}</span>
          </div>
        </PageHeader>

        {error ? (
          <Card className="border-rose-500/30 bg-rose-500/5">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-rose-600 dark:text-rose-400">
              <XCircle className="h-4 w-4" />
              <span>{error}</span>
            </CardContent>
          </Card>
        ) : null}

        {/* Pulse Highlights */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">Revenue Pulse</CardTitle>
                  <CardDescription>Live demand and cash movement across the last 7 days.</CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  7-Day Trend
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 transition-all hover:bg-muted/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today&apos;s Sales</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{formatCurrencyShort(data.todaySales)}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={salesDelta >= 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-rose-600 dark:text-rose-400"}>
                      {salesDelta >= 0 ? "+" : ""}{salesDelta.toFixed(1)}%
                    </span>
                    <span>vs yesterday</span>
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 transition-all hover:bg-muted/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">7 Day Sales</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{formatCurrencyShort(data.weekSales)}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={weeklyDelta >= 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-rose-600 dark:text-rose-400"}>
                      {weeklyDelta >= 0 ? "+" : ""}{weeklyDelta.toFixed(1)}%
                    </span>
                    <span>vs prev week</span>
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 transition-all hover:bg-muted/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding AR</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{formatCurrencyShort(data.outstandingReceivables)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-rose-600 dark:text-rose-400">{data.overdueInvoices} overdue</span> invoice{data.overdueInvoices === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Fulfillment Pipeline Distribution</span>
                  <span>{data.openOrders} Active Orders</span>
                </div>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  {data.fulfillmentStages.map((stage) => (
                    <div key={stage.key} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted-foreground">{stage.label}</p>
                        <span className="text-sm font-bold text-foreground">{stage.value}</span>
                      </div>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${stage.color}`}
                          style={{
                            width: `${Math.min(
                              100,
                              data.openOrders > 0 ? (stage.value / Math.max(data.openOrders, 1)) * 100 : 0
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">Fulfilment Pulse</CardTitle>
                  <CardDescription>Picking, dispatch, and delivery queue.</CardDescription>
                </div>
                <Truck className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery Completion</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{routeCompletion.toFixed(0)}%</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data.deliveredToday} delivered today • {data.remainingStops} open stops
                    </p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Truck className="h-5 w-5" />
                  </div>
                </div>
                <Progress value={routeCompletion} className="mt-4 h-2" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Pick Queue</p>
                    <Warehouse className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-xl font-bold text-foreground">{data.pickQueue + data.picksInProgress}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.pickQueue} waiting • {data.picksInProgress} in progress
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Live Routes</p>
                    <Truck className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-xl font-bold text-foreground">{data.routesInProgress}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.remainingStops} stop{data.remainingStops === 1 ? "" : "s"} left to service
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Pending Approvals</p>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-xl font-bold text-foreground">{data.pendingApprovals}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Awaiting release to warehouse</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">COD Outstanding</p>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-xl font-bold text-foreground">{formatCurrencyShort(data.outstandingCod)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Driver collections in field</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 7 KPI Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <KpiCard
            title="Sales Today"
            value={formatCurrencyShort(data.todaySales)}
            description={`${data.todayOrders} orders booked today`}
            icon={DollarSign}
            change={
              typeof salesDelta === "number"
                ? {
                    value: `${salesDelta > 0 ? "+" : ""}${salesDelta.toFixed(1)}%`,
                    isPositive: salesDelta >= 0,
                  }
                : undefined
            }
          />
          <KpiCard
            title="Open Orders"
            value={String(data.openOrders)}
            description={`${data.totalOrders} total in pipeline`}
            icon={ShoppingCart}
          />
          <KpiCard
            title="Outstanding AR"
            value={formatCurrencyShort(data.outstandingReceivables)}
            description={`${data.overdueInvoices} overdue invoices`}
            icon={BarChart3}
          />
          <KpiCard
            title="Low Stock"
            value={String(data.lowStockItems)}
            description={`${data.lowStockUnitsShort} units below reorder`}
            icon={AlertTriangle}
          />
          <KpiCard
            title="Active Customers"
            value={String(data.activeCustomers)}
            description="Trading accounts"
            icon={Users}
          />
          <KpiCard
            title="Commerce Orders"
            value={String(data.commerceOrders)}
            description={`${data.websiteOrders} web • ${data.appOrders} app`}
            icon={Package}
          />
          <KpiCard
            title="Delivered Today"
            value={String(data.deliveredToday)}
            description={`${data.routesInProgress} route${data.routesInProgress === 1 ? "" : "s"} live`}
            icon={CheckCircle}
          />
        </div>

        {/* Charts & Pipeline Tabs */}
        <Tabs defaultValue="revenue" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="revenue">Revenue & Accounts</TabsTrigger>
              <TabsTrigger value="operations">Operations & Dispatch</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="revenue" className="space-y-0">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-foreground">Sales Trend (Last 7 Days)</CardTitle>
                  <CardDescription>Daily sales and order intake volume.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.salesTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" className="text-xs text-muted-foreground" stroke="currentColor" />
                        <YAxis
                          yAxisId="sales"
                          className="text-xs text-muted-foreground"
                          stroke="currentColor"
                          tickFormatter={(value) => formatCurrencyShort(Number(value))}
                        />
                        <YAxis yAxisId="orders" orientation="right" className="text-xs text-muted-foreground" stroke="currentColor" />
                        <Tooltip
                          formatter={(value: number, name: string) => {
                            if (name === "sales") return [formatCurrency(value), "Sales"]
                            return [value, "Orders"]
                          }}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "8px",
                            color: "hsl(var(--card-foreground))",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          }}
                        />
                        <Line
                          yAxisId="sales"
                          type="monotone"
                          dataKey="sales"
                          stroke={CHART_COLORS.emerald}
                          strokeWidth={2.5}
                          dot={{ fill: CHART_COLORS.emerald, r: 4 }}
                        />
                        <Line
                          yAxisId="orders"
                          type="monotone"
                          dataKey="orders"
                          stroke={CHART_COLORS.blue}
                          strokeWidth={2}
                          dot={{ fill: CHART_COLORS.blue, r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-foreground">Top Customers by Revenue</CardTitle>
                  <CardDescription>Highest volume trading accounts in active period.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.topCustomers} layout="vertical" margin={{ left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          type="number"
                          className="text-xs text-muted-foreground"
                          stroke="currentColor"
                          tickFormatter={(value) => formatCurrencyShort(Number(value))}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={150}
                          className="text-xs text-muted-foreground"
                          stroke="currentColor"
                          tick={<SingleLineTick />}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) => {
                            if (name === "revenue") return [formatCurrency(value), "Revenue"]
                            return [value, "Orders"]
                          }}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "8px",
                            color: "hsl(var(--card-foreground))",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          }}
                        />
                        <Bar dataKey="revenue" fill={CHART_COLORS.blue} radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="operations" className="space-y-0">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-foreground">Order Status Pipeline</CardTitle>
                  <CardDescription>Distribution of order statuses across workflow stages.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.orderStatusDistribution}
                          dataKey="count"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={88}
                          paddingAngle={2}
                        >
                          {data.orderStatusDistribution.map((entry) => (
                            <Cell
                              key={entry.status}
                              fill={
                                {
                                  draft: "#94a3b8",
                                  pending_approval: "#f59e0b",
                                  approved: "#3b82f6",
                                  picking: "#f97316",
                                  packed: "#8b5cf6",
                                  dispatched: "#6366f1",
                                  delivered: "#10b981",
                                  invoiced: "#14b8a6",
                                  cancelled: "#ef4444",
                                }[entry.status] || "#94a3b8"
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [value, "Orders"]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "8px",
                            color: "hsl(var(--card-foreground))",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {data.orderStatusDistribution.map((item) => (
                      <Badge
                        key={item.status}
                        variant="outline"
                        className={STATUS_COLORS[item.status] || STATUS_COLORS.draft}
                      >
                        {(STATUS_LABELS[item.status] || item.status).replace("_", " ")}: {item.count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">Live Delivery & AR Activity</CardTitle>
                    <CardDescription>Latest delivery updates and pending collections.</CardDescription>
                  </div>
                  <Link href="/routes">
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                      View routes
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Route Activity</p>
                    {data.activityFeed.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        No route activity yet.
                      </div>
                    ) : (
                      data.activityFeed.map((activity) => (
                        <div key={activity.id} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 transition-all hover:bg-muted/40">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-foreground">{activity.label}</p>
                            <Badge variant="outline" className="text-[10px]">{activity.routeNumber}</Badge>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(activity.at)}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receivables Due</p>
                    {data.openInvoices.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        No open receivables right now.
                      </div>
                    ) : (
                      data.openInvoices.map((invoice) => (
                        <div key={invoice.id} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 transition-all hover:bg-muted/40">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-medium text-foreground">{invoice.invoiceNumber}</p>
                              <p className="text-[11px] text-muted-foreground">{invoice.customerName}</p>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                invoice.status === "overdue"
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              }
                            >
                              {invoice.status}
                            </Badge>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{invoice.dueDate ? `Due ${formatDate(invoice.dueDate)}` : "No due date"}</span>
                            <span className="font-semibold text-foreground">{formatCurrencyShort(invoice.balanceDue)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Operational Cards Row */}
        <div className="grid gap-6 xl:grid-cols-3">
          {/* Route Board */}
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Route Board</CardTitle>
                <CardDescription>Live routes and next delivery stops.</CardDescription>
              </div>
              <Link href="/routes">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                  Open delivery
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.routeSnapshots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No delivery routes scheduled yet.
                </div>
              ) : (
                data.routeSnapshots.map((route) => (
                  <div key={route.id} className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm transition-all hover:border-border">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{route.routeNumber}</p>
                        <p className="text-xs text-muted-foreground">{route.driverName} • {route.vehicle}</p>
                      </div>
                      <Badge variant="outline" className={ROUTE_STATUS_COLORS[route.status] || ROUTE_STATUS_COLORS.planned}>
                        {route.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{route.completedStops}/{route.totalStops} stops completed</span>
                        <span className="font-medium text-foreground">{route.progress}%</span>
                      </div>
                      <Progress value={route.progress} className="h-1.5" />
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span>Next Stop:</span>
                        <span className="font-medium text-foreground text-right truncate max-w-[180px]">{route.nextStopLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Warehouse:</span>
                        <span className="text-foreground">{route.warehouseName}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Open COD:</span>
                        <span className="font-semibold text-foreground">{formatCurrencyShort(route.outstandingCod)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Pick Queue */}
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Pick Queue</CardTitle>
                <CardDescription>Orders moving through fulfillment.</CardDescription>
              </div>
              <Link href="/warehouse/picking">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                  Open picks
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.pickSnapshots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No active pick lists right now.
                </div>
              ) : (
                data.pickSnapshots.map((pick) => (
                  <div key={pick.id} className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm transition-all hover:border-border">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{pick.pickNumber}</p>
                        <p className="text-xs text-muted-foreground">{pick.orderNumber} • {pick.customerName}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {pick.priority === "high" ? (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">High</Badge>
                        ) : null}
                        <Badge variant="outline" className={PICK_STATUS_COLORS[pick.status] || PICK_STATUS_COLORS.pending}>
                          {pick.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{pick.itemCount} line item{pick.itemCount === 1 ? "" : "s"}</span>
                        <span className="font-medium text-foreground">{pick.progress}%</span>
                      </div>
                      <Progress value={pick.progress} className="h-1.5" />
                    </div>
                    <p className="mt-2.5 text-xs text-muted-foreground">
                      Assigned: <span className="font-medium text-foreground">{pick.assignedTo || "Warehouse Queue"}</span>
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Orders */}
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Recent Orders</CardTitle>
                <CardDescription>Latest orders booked in the system.</CardDescription>
              </div>
              <Link href="/orders">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Orders will appear here once created.
                </div>
              ) : (
                data.recentOrders.map((order) => (
                  <div key={order.id} className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm transition-all hover:border-border">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{order.orderNumber}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <p className="text-xs text-muted-foreground">{order.customer?.name || "Unknown Customer"}</p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              COMMERCE_CHANNEL_COLORS[normalizeCommerceChannel(order.sourceChannel)] ||
                              COMMERCE_CHANNEL_COLORS.admin
                            }`}
                          >
                            {COMMERCE_CHANNEL_LABELS[normalizeCommerceChannel(order.sourceChannel)]}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="outline" className={STATUS_COLORS[order.status] || STATUS_COLORS.draft}>
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatDate(order.orderDate)}</span>
                      <span className="font-semibold text-foreground">{formatCurrencyShort(order.totalAmount)}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alerts & Top Products */}
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Low Stock Alerts</CardTitle>
                <CardDescription>Inventory items below safe reorder thresholds.</CardDescription>
              </div>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {data.lowStockProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Stock levels look healthy across all warehouses.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.lowStockProducts.map((item) => (
                    <div key={item.id} className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 transition-all hover:bg-rose-500/10">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.name}</p>
                          <p className="text-xs font-mono text-muted-foreground">{item.sku}</p>
                        </div>
                        <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
                          Low
                        </Badge>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{item.warehouseName}</span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          {item.quantity} / {item.reorderLevel} units
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">Top Products by Revenue</CardTitle>
              <CardDescription>Highest revenue generating SKUs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.topProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Top products will populate as orders are recorded.
                </div>
              ) : (
                data.topProducts.map((product, index) => (
                  <div key={`${product.sku}-${index}`} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 transition-all hover:bg-muted/40">
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{product.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">{formatCurrencyShort(product.revenue)}</p>
                      <p className="text-xs text-muted-foreground">{product.quantity} units sold</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
