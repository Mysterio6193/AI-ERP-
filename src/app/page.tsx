"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
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
  draft: "bg-gray-100 text-gray-700",
  pending_approval: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  picking: "bg-orange-100 text-orange-700",
  packed: "bg-violet-100 text-violet-700",
  dispatched: "bg-indigo-100 text-indigo-700",
  delivered: "bg-emerald-100 text-emerald-700",
  invoiced: "bg-teal-100 text-teal-700",
  cancelled: "bg-red-100 text-red-700",
}

const ROUTE_STATUS_COLORS: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
}

const PICK_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
}

const CHART_COLORS = {
  emerald: "#059669",
  blue: "#2563eb",
  amber: "#d97706",
  violet: "#7c3aed",
  slate: "#64748b",
  red: "#dc2626",
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

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  iconClassName,
  change,
}: {
  title: string
  value: string
  hint: string
  icon: LucideIcon
  iconClassName: string
  change?: number
}) {
  const isPositive = (change || 0) >= 0
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight
  const changeTone = isPositive ? "text-[#0071e3]" : "text-rose-600"
  const changeLabel =
    typeof change === "number"
      ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%`
      : null

  return (
    <Card className="apple-kpi">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`rounded-2xl p-3 ${iconClassName}`}>
            <Icon className="h-5 w-5" />
          </div>
          {changeLabel ? (
            <div className={`inline-flex items-center gap-1 text-xs font-medium ${changeTone}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              <span>{changeLabel}</span>
            </div>
          ) : null}
        </div>
        <div className="mt-4 space-y-1">
          <p className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">{value}</p>
          <p className="text-sm font-medium tracking-[-0.014em] text-slate-700">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Load one collection for the dashboard.
 *
 * Returns the rows and, separately, whether the ask failed. The old shape
 * returned `[]` for both "nothing there" and "could not ask", so a dashboard
 * that could not reach the server rendered as a business that did nothing
 * today — on the first screen anyone sees each morning.
 */
async function fetchCollection<T>(path: string): Promise<{ rows: T[]; failed: boolean }> {
  try {
    const response = await fetch(path, { cache: "no-store" })
    const payload = await response.json()

    if (!payload?.success) {
      console.error(`Failed to fetch ${path}:`, payload?.error ?? response.status)
      return { rows: [], failed: true }
    }

    return { rows: (payload.data as T[]) || [], failed: false }
  } catch (error) {
    console.error(`Failed to fetch ${path}:`, error)
    return { rows: [], failed: true }
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
    { key: "packed", label: "Packed", color: "bg-violet-500" },
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

      const results = await Promise.all([
        fetchCollection<OrderLite>("/api/orders"),
        fetchCollection<CustomerLite>("/api/customers"),
        fetchCollection<InventoryLite>("/api/inventory"),
        fetchCollection<InvoiceLite>("/api/invoices"),
        fetchCollection<PickListLite>("/api/pick-lists"),
        fetchCollection<RouteLite>("/api/routes"),
      ])

      const [orders, customers, inventory, invoices, pickLists, routes] = results

      /**
       * One failed feed makes every figure below it wrong, not merely
       * incomplete — today's sales read as zero rather than unknown. The
       * dashboard still renders what it did get, and says the rest is missing,
       * because a blank screen is less useful than a flagged partial one.
       */
      const failed = results.filter((result) => result.failed).length

      if (failed > 0) {
        setError(
          failed === results.length
            ? "Could not load the dashboard. The figures below are not real — nothing was reached."
            : `${failed} of ${results.length} feeds could not be loaded, so some figures below are understated.`
        )
      }

      setData(
        buildDashboardData({
          orders: orders.rows,
          customers: customers.rows,
          inventory: inventory.rows,
          invoices: invoices.rows,
          pickLists: pickLists.rows,
          routes: routes.rows,
        })
      )
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
      <div className="apple-admin-page pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="apple-hero flex-1 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/14 bg-white/8 text-white">
                Live Operations
              </Badge>
              <Badge className="border-white/14 bg-white/8 text-white/82">
                Auto refresh every 30s
              </Badge>
            </div>
            <div>
              <h1 className="text-[36px] font-semibold tracking-[-0.04em] text-white md:text-[52px]">Operations command center</h1>
              <p className="max-w-2xl text-[17px] text-white/70">
                Orders, warehouse, delivery, and receivables, on one screen.
              </p>
            </div>
            <p className="text-xs uppercase tracking-[0.08em] text-white/46">
              {loading && !lastUpdatedAt ? "Loading live metrics..." : `Last synced at ${formatShortTime(lastUpdatedAt)}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => void refreshDashboard()}
              disabled={refreshing || loading}
            >
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Link href="/orders?action=new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New order
              </Button>
            </Link>
            <Link href="/customers?action=new">
              <Button variant="outline">
                <Users className="mr-2 h-4 w-4" />
                Add customer
              </Button>
            </Link>
            <Link href="/invoices">
              <Button variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                Invoices
              </Button>
            </Link>
          </div>
        </div>

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-red-700">
              <XCircle className="h-4 w-4" />
              <span>{error}</span>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Revenue pulse</CardTitle>
              <CardDescription>Live demand and cash movement across the last 7 days.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.5rem] bg-[#f5f5f7] p-4">
                  <p className="text-sm font-medium text-slate-700">Today&apos;s sales</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">{formatCurrencyShort(data.todaySales)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {data.todayOrders} live order{data.todayOrders === 1 ? "" : "s"} booked today
                  </p>
                </div>
                <div className="rounded-[1.5rem] bg-[#f5f5f7] p-4">
                  <p className="text-sm font-medium text-slate-700">7 day sales</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">{formatCurrencyShort(data.weekSales)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {weeklyDelta >= 0 ? "Ahead of" : "Behind"} previous 7 day window
                  </p>
                </div>
                <div className="rounded-[1.5rem] bg-[#f5f5f7] p-4">
                  <p className="text-sm font-medium text-slate-700">Outstanding AR</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">{formatCurrencyShort(data.outstandingReceivables)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {data.overdueInvoices} overdue invoice{data.overdueInvoices === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {data.fulfillmentStages.map((stage) => (
                  <div key={stage.key} className="rounded-[1.25rem] bg-[#f5f5f7] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-700">{stage.label}</p>
                      <span className="text-lg font-semibold text-slate-900">{stage.value}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-primary"
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Fulfilment pulse</CardTitle>
              <CardDescription>What needs action across picking, dispatch, and delivery.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[1.5rem] bg-[#f5f5f7] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Delivery progress</p>
                    <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{routeCompletion.toFixed(0)}%</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data.deliveredToday} delivered today, {data.remainingStops} stops still open
                    </p>
                  </div>
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <Progress value={routeCompletion} className="mt-4 h-2.5" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.25rem] bg-[#f5f5f7] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Pick queue</p>
                    <Warehouse className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{data.pickQueue + data.picksInProgress}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.pickQueue} waiting, {data.picksInProgress} in progress
                  </p>
                </div>
                <div className="rounded-[1.25rem] bg-[#f5f5f7] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Live routes</p>
                    <Truck className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{data.routesInProgress}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.remainingStops} open stop{data.remainingStops === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-[1.25rem] bg-[#f5f5f7] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Pending approvals</p>
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{data.pendingApprovals}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Orders awaiting release to fulfilment</p>
                </div>
                <div className="rounded-[1.25rem] bg-[#f5f5f7] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">COD still due</p>
                    <DollarSign className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrencyShort(data.outstandingCod)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Outstanding collection across routes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <MetricCard
            title="Sales Today"
            value={formatCurrencyShort(data.todaySales)}
            hint={`${data.todayOrders} orders booked today`}
            icon={DollarSign}
            iconClassName="bg-[#eaf3ff] text-[#0071e3]"
            change={salesDelta}
          />
          <MetricCard
            title="Open Orders"
            value={String(data.openOrders)}
            hint={`${data.totalOrders} total in pipeline`}
            icon={ShoppingCart}
            iconClassName="bg-[#f5f5f7] text-slate-900"
          />
          <MetricCard
            title="Outstanding AR"
            value={formatCurrencyShort(data.outstandingReceivables)}
            hint={`${data.overdueInvoices} overdue invoices need follow-up`}
            icon={BarChart3}
            iconClassName="bg-[#f5f5f7] text-slate-900"
          />
          <MetricCard
            title="Low Stock"
            value={String(data.lowStockItems)}
            hint={`${data.lowStockUnitsShort} units below reorder point`}
            icon={AlertTriangle}
            iconClassName="bg-[#f5f5f7] text-slate-900"
          />
          <MetricCard
            title="Active Customers"
            value={String(data.activeCustomers)}
            hint="Accounts trading on the platform"
            icon={Users}
            iconClassName="bg-[#f5f5f7] text-slate-900"
          />
          <MetricCard
            title="Commerce Orders"
            value={String(data.commerceOrders)}
            hint={`${data.websiteOrders} web • ${data.appOrders} app`}
            icon={ShoppingCart}
            iconClassName="bg-[#eaf3ff] text-[#0071e3]"
          />
          <MetricCard
            title="Delivered Today"
            value={String(data.deliveredToday)}
            hint={`${data.routesInProgress} route${data.routesInProgress === 1 ? "" : "s"} currently live`}
            icon={CheckCircle}
            iconClassName="bg-[#f5f5f7] text-slate-900"
          />
        </div>

        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="revenue">Revenue View</TabsTrigger>
            <TabsTrigger value="operations">Operations View</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="space-y-0">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Sales trend</CardTitle>
                  <CardDescription>Daily sales and order intake over the last 7 days.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.salesTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                        <YAxis
                          yAxisId="sales"
                          stroke="#64748b"
                          fontSize={12}
                          tickFormatter={(value) => formatCurrencyShort(Number(value))}
                        />
                        <YAxis yAxisId="orders" orientation="right" stroke="#94a3b8" fontSize={12} />
                        <Tooltip
                          formatter={(value: number, name: string) => {
                            if (name === "sales") return [formatCurrency(value), "Sales"]
                            return [value, "Orders"]
                          }}
                          contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
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

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Top customers by revenue</CardTitle>
                  <CardDescription>Most valuable trading accounts in the current data set.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.topCustomers} layout="vertical" margin={{ left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          type="number"
                          stroke="#64748b"
                          fontSize={12}
                          tickFormatter={(value) => formatCurrencyShort(Number(value))}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={150}
                          stroke="#64748b"
                          fontSize={11}
                          // A custom tick, because the default one wraps a
                          // name onto a second line to fit the axis width —
                          // "Independent Grocers Network" rendered as
                          // "Independent" above "Groce…", which reads as two
                          // separate rows. One line, shortened with an
                          // ellipsis, and the full name in the tooltip.
                          tick={<SingleLineTick />}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) => {
                            if (name === "revenue") return [formatCurrency(value), "Revenue"]
                            return [value, "Orders"]
                          }}
                          contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                        />
                        <Bar dataKey="revenue" fill={CHART_COLORS.blue} radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="operations" className="space-y-0">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Order pipeline</CardTitle>
                  <CardDescription>Distribution of order statuses across the workflow.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.orderStatusDistribution}
                          dataKey="count"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={95}
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
                        <Tooltip formatter={(value: number) => [value, "Orders"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {data.orderStatusDistribution.map((item) => (
                      <Badge
                        key={item.status}
                        variant="secondary"
                        className={STATUS_COLORS[item.status] || STATUS_COLORS.draft}
                      >
                        {(STATUS_LABELS[item.status] || item.status).replace("_", " ")}: {item.count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Live activity</CardTitle>
                    <CardDescription>Latest delivery events and open collections work.</CardDescription>
                  </div>
                  <Link href="/routes">
                    <Button variant="ghost" size="sm" className="text-emerald-700">
                      View routes
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    {data.activityFeed.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                        No route activity yet.
                      </div>
                    ) : (
                      data.activityFeed.map((activity) => (
                        <div key={activity.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-800">{activity.label}</p>
                            <Badge variant="outline">{activity.routeNumber}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDate(activity.at)}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-3">
                    {data.openInvoices.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                        No open receivables right now.
                      </div>
                    ) : (
                      data.openInvoices.map((invoice) => (
                        <div key={invoice.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{invoice.invoiceNumber}</p>
                              <p className="text-xs text-muted-foreground">{invoice.customerName}</p>
                            </div>
                            <Badge className={invoice.status === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>
                              {invoice.status}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{invoice.dueDate ? `Due ${formatDate(invoice.dueDate)}` : "Due date not set"}</span>
                            <span className="font-medium text-slate-800">{formatCurrencyShort(invoice.balanceDue)}</span>
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

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Route board</CardTitle>
                <CardDescription>Top live routes and their next stop.</CardDescription>
              </div>
              <Link href="/routes">
                <Button variant="ghost" size="sm" className="text-emerald-700">
                  Open delivery
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.routeSnapshots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                  No delivery routes are scheduled yet.
                </div>
              ) : (
                data.routeSnapshots.map((route) => (
                  <div key={route.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{route.routeNumber}</p>
                        <p className="text-xs text-muted-foreground">{route.driverName} • {route.vehicle}</p>
                      </div>
                      <Badge className={ROUTE_STATUS_COLORS[route.status] || ROUTE_STATUS_COLORS.planned}>
                        {route.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{route.completedStops}/{route.totalStops} stops completed</span>
                        <span>{route.progress}%</span>
                      </div>
                      <Progress value={route.progress} className="h-2" />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between gap-3">
                        <span>Next stop</span>
                        <span className="text-right text-slate-700">{route.nextStopLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Warehouse</span>
                        <span className="text-right text-slate-700">{route.warehouseName}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Open COD</span>
                        <span className="text-right font-medium text-slate-800">{formatCurrencyShort(route.outstandingCod)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Pick queue</CardTitle>
                <CardDescription>Orders moving through warehouse fulfilment.</CardDescription>
              </div>
              <Link href="/warehouse/picking">
                <Button variant="ghost" size="sm" className="text-emerald-700">
                  Open picks
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.pickSnapshots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                  No active pick lists right now.
                </div>
              ) : (
                data.pickSnapshots.map((pick) => (
                  <div key={pick.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{pick.pickNumber}</p>
                        <p className="text-xs text-muted-foreground">{pick.orderNumber} • {pick.customerName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {pick.priority === "high" ? (
                          <Badge className="bg-red-100 text-red-700">High</Badge>
                        ) : null}
                        <Badge className={PICK_STATUS_COLORS[pick.status] || PICK_STATUS_COLORS.pending}>
                          {pick.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{pick.itemCount} line{pick.itemCount === 1 ? "" : "s"}</span>
                        <span>{pick.progress}%</span>
                      </div>
                      <Progress value={pick.progress} className="h-2" />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Assigned to {pick.assignedTo || "warehouse queue"}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent orders</CardTitle>
                <CardDescription>Latest activity entering the pipeline.</CardDescription>
              </div>
              <Link href="/orders">
                <Button variant="ghost" size="sm" className="text-emerald-700">
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                  Orders will appear here once they are created.
                </div>
              ) : (
                data.recentOrders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{order.orderNumber}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-xs text-muted-foreground">{order.customer?.name || "Unknown Customer"}</p>
                          <Badge
                            className={
                              COMMERCE_CHANNEL_COLORS[normalizeCommerceChannel(order.sourceChannel)] ||
                              COMMERCE_CHANNEL_COLORS.admin
                            }
                          >
                            {COMMERCE_CHANNEL_LABELS[normalizeCommerceChannel(order.sourceChannel)]}
                          </Badge>
                        </div>
                      </div>
                      <Badge className={STATUS_COLORS[order.status] || STATUS_COLORS.draft}>
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(order.orderDate)}</span>
                      <span className="font-medium text-slate-800">{formatCurrencyShort(order.totalAmount)}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Low stock alerts</CardTitle>
                <CardDescription>Live products below reorder point across warehouses.</CardDescription>
              </div>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              {data.lowStockProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                  Stock levels look healthy right now.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.lowStockProducts.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                          <p className="text-xs font-mono text-muted-foreground">{item.sku}</p>
                        </div>
                        <Badge className="bg-red-100 text-red-700">Low</Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{item.warehouseName}</span>
                        <span className="font-medium text-red-700">
                          {item.quantity} / {item.reorderLevel}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Top products by revenue</CardTitle>
              <CardDescription>Best performing SKUs based on current order data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.topProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                  Top products will populate as order history grows.
                </div>
              ) : (
                data.topProducts.map((product, index) => (
                  <div key={`${product.sku}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{product.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{formatCurrencyShort(product.revenue)}</p>
                        <p className="text-xs text-muted-foreground">{product.quantity} units</p>
                      </div>
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
