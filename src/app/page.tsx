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
  PieChart as LucidePieChart,
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

export const SESSION_CACHE_KEY = "dashboard_v2"
export const CACHE_TTL_MS = 5 * 60 * 1000

interface CachedDashboard {
  data: DashboardData
  savedAt: number
}

export function readCache(): DashboardData | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedDashboard
    if (!parsed || !parsed.data || typeof parsed.savedAt !== "number") return null
    if (Date.now() - parsed.savedAt < CACHE_TTL_MS) {
      return parsed.data
    }
    return null
  } catch (error) {
    console.error("Failed to read dashboard cache from sessionStorage:", error)
    return null
  }
}

export function writeCache(data: DashboardData) {
  if (typeof window === "undefined") return
  try {
    const payload: CachedDashboard = {
      data,
      savedAt: Date.now(),
    }
    window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.error("Failed to write dashboard cache to sessionStorage:", error)
  }
}

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
    const cached = readCache()
    if (cached) {
      setData(cached)
      setLoading(false)
      void refreshDashboard({ background: true })
    } else {
      void refreshDashboard({ initial: true })
    }

    const interval = window.setInterval(() => {
      void refreshDashboard({ background: true })
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [])

  async function refreshDashboard(options?: { initial?: boolean; background?: boolean; force?: boolean }) {
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

      const nextData = buildDashboardData({ orders, customers, inventory, invoices, pickLists, routes })
      setData(nextData)
      writeCache(nextData)
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
                variant="ghost"
                size="sm"
                onClick={() => void refreshDashboard({ force: true })}
                disabled={refreshing || loading}
                className="text-muted-foreground hover:text-foreground rounded-xl border border-border/60 bg-card/40 backdrop-blur-md"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
                {refreshing ? "Syncing..." : "Sync"}
              </Button>
              <Link href="/orders?action=new">
                <Button size="sm" className="rounded-xl bg-gradient-to-r from-primary to-blue-600 text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:brightness-110">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Order
                </Button>
              </Link>
              <Link href="/customers?action=new">
                <Button variant="outline" size="sm" className="rounded-xl border-border/80 bg-card/40 backdrop-blur-md hover:bg-accent">
                  <Users className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  Customer
                </Button>
              </Link>
              <Link href="/invoices">
                <Button variant="outline" size="sm" className="rounded-xl border-border/80 bg-card/40 backdrop-blur-md hover:bg-accent">
                  <FileText className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  Invoices
                </Button>
              </Link>
            </div>
          }
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-semibold text-emerald-400 border border-emerald-500/25 shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Autonomous Operations Pulse
            </span>
            <span>•</span>
            <span>Auto-refreshing 30s</span>
            <span>•</span>
            <span className="font-mono text-[11px]">{loading && !lastUpdatedAt ? "Syncing telemetry..." : `Last synced ${formatShortTime(lastUpdatedAt)}`}</span>
          </div>
        </PageHeader>

        {error ? (
          <Card className="border-rose-500/30 bg-rose-500/10 rounded-2xl">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-rose-400 font-medium">
              <XCircle className="h-4 w-4" />
              <span>{error}</span>
            </CardContent>
          </Card>
        ) : null}

        {/* Pulse Highlights */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/60 shadow-xl backdrop-blur-xl">
            <div className="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
            <CardHeader className="pb-4 relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    Revenue & Financial Velocity
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">Live demand, receivables, and cashflow movement across the last 7 days.</CardDescription>
                </div>
                <Badge variant="outline" className="text-[11px] font-semibold border-primary/25 bg-primary/10 text-primary">
                  7-Day Trend
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 relative z-10">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-gradient-to-b from-card/80 to-muted/20 p-4 transition-all hover:border-emerald-500/40 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today&apos;s Sales</p>
                  <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground">{formatCurrencyShort(data.todaySales)}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={salesDelta >= 0 ? "font-semibold text-emerald-400 inline-flex items-center" : "font-semibold text-rose-400 inline-flex items-center"}>
                      {salesDelta >= 0 ? "+" : ""}{salesDelta.toFixed(1)}%
                    </span>
                    <span className="text-[11px]">vs yesterday</span>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-gradient-to-b from-card/80 to-muted/20 p-4 transition-all hover:border-primary/40 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">7-Day Run Rate</p>
                  <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground">{formatCurrencyShort(data.weekSales)}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={weeklyDelta >= 0 ? "font-semibold text-emerald-400 inline-flex items-center" : "font-semibold text-rose-400 inline-flex items-center"}>
                      {weeklyDelta >= 0 ? "+" : ""}{weeklyDelta.toFixed(1)}%
                    </span>
                    <span className="text-[11px]">vs prev week</span>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-gradient-to-b from-card/80 to-muted/20 p-4 transition-all hover:border-amber-500/40 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Outstanding AR</p>
                  <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground">{formatCurrencyShort(data.outstandingReceivables)}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-amber-400">{data.overdueInvoices} overdue</span> invoice{data.overdueInvoices === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground text-xs">Fulfillment Pipeline Distribution</span>
                  <span className="font-mono text-[11px] text-primary">{data.openOrders} Active Orders</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
                  {data.fulfillmentStages.map((stage) => (
                    <div key={stage.key} className="rounded-lg border border-border/40 bg-card/60 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground">{stage.label}</span>
                        <span className="font-bold text-xs text-foreground font-mono">{stage.value}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
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

          <Card className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/60 shadow-xl backdrop-blur-xl">
            <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
            <CardHeader className="pb-4 relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    <Truck className="h-4.5 w-4.5 text-emerald-400" />
                    Fulfilment & Dispatch Pulse
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">Real-time picking queues, vehicle dispatches, and driver runs.</CardDescription>
                </div>
                <Badge variant="outline" className="text-[11px] font-semibold border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                  Live Dispatch
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="rounded-xl border border-border/70 bg-gradient-to-b from-card/80 to-muted/20 p-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Delivery Completion</p>
                    <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">{routeCompletion.toFixed(0)}%</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-emerald-400">{data.deliveredToday} delivered</span> • {data.remainingStops} open stops
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/25">
                    <Truck className="h-5 w-5" />
                  </div>
                </div>
                <Progress value={routeCompletion} className="mt-3.5 h-2 bg-muted/60" />
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-muted-foreground">Pick Queue</p>
                    <Warehouse className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <p className="mt-1 text-xl font-extrabold text-foreground">{data.pickQueue + data.picksInProgress}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {data.pickQueue} waiting • {data.picksInProgress} in progress
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-muted-foreground">Active Routes</p>
                    <Truck className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <p className="mt-1 text-xl font-extrabold text-foreground">{data.routesInProgress}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {data.remainingStops} stop{data.remainingStops === 1 ? "" : "s"} left to deliver
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-muted-foreground">Pending Approvals</p>
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                  <p className="mt-1 text-xl font-extrabold text-foreground">{data.pendingApprovals}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Awaiting warehouse release</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/60 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-muted-foreground">COD In-Field</p>
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <p className="mt-1 text-xl font-extrabold text-foreground">{formatCurrencyShort(data.outstandingCod)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Driver field collections</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 7 Telemetry KPI Cards Grid */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <KpiCard
            title="Sales Today"
            value={formatCurrencyShort(data.todaySales)}
            description={`${data.todayOrders} orders booked`}
            icon={DollarSign}
            variant="success"
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
            variant="primary"
          />
          <KpiCard
            title="Outstanding AR"
            value={formatCurrencyShort(data.outstandingReceivables)}
            description={`${data.overdueInvoices} overdue invoices`}
            icon={BarChart3}
            variant="warning"
          />
          <KpiCard
            title="Low Stock"
            value={String(data.lowStockItems)}
            description={`${data.lowStockUnitsShort} units below reorder`}
            icon={AlertTriangle}
            variant="danger"
          />
          <KpiCard
            title="Active Customers"
            value={String(data.activeCustomers)}
            description="Trading accounts"
            icon={Users}
            variant="default"
          />
          <KpiCard
            title="Commerce Orders"
            value={String(data.commerceOrders)}
            description={`${data.websiteOrders} web • ${data.appOrders} app`}
            icon={Package}
            variant="purple"
          />
          <KpiCard
            title="Delivered Today"
            value={String(data.deliveredToday)}
            description={`${data.routesInProgress} live route${data.routesInProgress === 1 ? "" : "s"}`}
            icon={CheckCircle}
            variant="success"
          />
        </div>

        {/* Charts & Pipeline Tabs */}
        <Tabs defaultValue="revenue" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList className="bg-card/80 border border-border/80 p-1 rounded-2xl backdrop-blur-md">
              <TabsTrigger value="revenue" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/25">
                Revenue & Financial Analytics
              </TabsTrigger>
              <TabsTrigger value="operations" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/25">
                Operations & Warehouse Dispatch
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="revenue" className="space-y-0">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/60 shadow-xl backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-400" />
                    Sales Velocity Trend (Last 7 Days)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">Daily sales revenue and order intake volume.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.salesTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
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
                            backgroundColor: "rgba(11, 16, 29, 0.95)",
                            borderColor: "rgba(59, 130, 246, 0.3)",
                            borderRadius: "12px",
                            color: "#f8fafc",
                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                            backdropFilter: "blur(12px)",
                          }}
                        />
                        <Line
                          yAxisId="sales"
                          type="monotone"
                          dataKey="sales"
                          stroke="#10b981"
                          strokeWidth={3}
                          dot={{ fill: "#10b981", r: 4, strokeWidth: 2, stroke: "#070a12" }}
                          activeDot={{ r: 6, fill: "#34d399" }}
                        />
                        <Line
                          yAxisId="orders"
                          type="monotone"
                          dataKey="orders"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          dot={{ fill: "#3b82f6", r: 3.5, strokeWidth: 2, stroke: "#070a12" }}
                          activeDot={{ r: 5, fill: "#60a5fa" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/60 shadow-xl backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Top Customers by Revenue
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">Highest volume trading accounts in active period.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.topCustomers} layout="vertical" margin={{ left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
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
                            backgroundColor: "rgba(11, 16, 29, 0.95)",
                            borderColor: "rgba(59, 130, 246, 0.3)",
                            borderRadius: "12px",
                            color: "#f8fafc",
                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                            backdropFilter: "blur(12px)",
                          }}
                        />
                        <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="operations" className="space-y-0">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              <Card className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/60 shadow-xl backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    <LucidePieChart className="h-4 w-4 text-purple-400" />
                    Order Status Pipeline
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">Distribution of order statuses across fulfillment stages.</CardDescription>
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
                          paddingAngle={3}
                        >
                          {data.orderStatusDistribution.map((entry) => (
                            <Cell
                              key={entry.status}
                              fill={
                                {
                                  draft: "#64748b",
                                  pending_approval: "#f59e0b",
                                  approved: "#3b82f6",
                                  picking: "#f97316",
                                  packed: "#8b5cf6",
                                  dispatched: "#06b6d4",
                                  delivered: "#10b981",
                                  invoiced: "#14b8a6",
                                  cancelled: "#f43f5e",
                                } [entry.status] || "#64748b"
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [value, "Orders"]}
                          contentStyle={{
                            backgroundColor: "rgba(11, 16, 29, 0.95)",
                            borderColor: "rgba(59, 130, 246, 0.3)",
                            borderRadius: "12px",
                            color: "#f8fafc",
                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                            backdropFilter: "blur(12px)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {data.orderStatusDistribution.map((item) => (
                      <Badge
                        key={item.status}
                        variant="outline"
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[item.status] || STATUS_COLORS.draft}`}
                      >
                        {(STATUS_LABELS[item.status] || item.status).replace("_", " ")}: <span className="font-bold ml-1">{item.count}</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/60 shadow-xl backdrop-blur-xl">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                      <Truck className="h-4 w-4 text-emerald-400" />
                      Live Delivery & Receivables Feed
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">Latest route telemetry and pending collections.</CardDescription>
                  </div>
                  <Link href="/routes">
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary rounded-xl text-xs">
                      View routes →
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Route Activity</p>
                    {data.activityFeed.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                        No route activity yet.
                      </div>
                    ) : (
                      data.activityFeed.map((activity) => (
                        <div key={activity.id} className="rounded-xl border border-border/60 bg-card/60 p-2.5 transition-all hover:bg-card/90 shadow-xs">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground">{activity.label}</p>
                            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">{activity.routeNumber}</Badge>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(activity.at)}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Receivables Due</p>
                    {data.openInvoices.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                        No open receivables right now.
                      </div>
                    ) : (
                      data.openInvoices.map((invoice) => (
                        <div key={invoice.id} className="rounded-xl border border-border/60 bg-card/60 p-2.5 transition-all hover:bg-card/90 shadow-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-foreground">{invoice.invoiceNumber}</p>
                              <p className="text-[11px] text-muted-foreground truncate max-w-[120px]">{invoice.customerName}</p>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                invoice.status === "overdue"
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/25 text-[10px] font-semibold"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/25 text-[10px] font-semibold"
                              }
                            >
                              {invoice.status}
                            </Badge>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{invoice.dueDate ? `Due ${formatDate(invoice.dueDate)}` : "No due date"}</span>
                            <span className="font-bold text-foreground font-mono">{formatCurrencyShort(invoice.balanceDue)}</span>
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

        {/* Operational Telemetry Cards Row */}
        <div className="grid gap-6 xl:grid-cols-3">
          {/* Route Board */}
          <Card className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/60 shadow-xl backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <Truck className="h-4 w-4 text-emerald-400" />
                  Live Route Telemetry
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Active vehicle routes and next drop-off points.</CardDescription>
              </div>
              <Link href="/routes">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary rounded-xl text-xs">
                  All Routes →
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.routeSnapshots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  No delivery routes scheduled yet.
                </div>
              ) : (
                data.routeSnapshots.map((route) => (
                  <div key={route.id} className="rounded-xl border border-border/70 bg-card/60 p-3.5 shadow-sm transition-all hover:border-primary/40 hover:bg-card/90">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-foreground">{route.routeNumber}</p>
                        <p className="text-xs text-muted-foreground">{route.driverName} • {route.vehicle}</p>
                      </div>
                      <Badge variant="outline" className={`rounded-lg text-[10px] font-semibold ${ROUTE_STATUS_COLORS[route.status] || ROUTE_STATUS_COLORS.planned}`}>
                        {route.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{route.completedStops}/{route.totalStops} stops serviced</span>
                        <span className="font-bold text-foreground font-mono">{route.progress}%</span>
                      </div>
                      <Progress value={route.progress} className="h-1.5 bg-muted/60" />
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px]">Next Stop:</span>
                        <span className="font-semibold text-foreground text-right truncate max-w-[180px] text-[11px]">{route.nextStopLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px]">Warehouse:</span>
                        <span className="text-foreground text-[11px]">{route.warehouseName}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px]">Open COD:</span>
                        <span className="font-bold text-emerald-400 font-mono text-[11px]">{formatCurrencyShort(route.outstandingCod)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Pick Queue */}
          <Card className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/60 shadow-xl backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-primary" />
                  Wave Pick Queue
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Active batches moving through warehouse picking.</CardDescription>
              </div>
              <Link href="/warehouse/picking">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary rounded-xl text-xs">
                  Picking View →
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.pickSnapshots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  No active pick lists right now.
                </div>
              ) : (
                data.pickSnapshots.map((pick) => (
                  <div key={pick.id} className="rounded-xl border border-border/70 bg-card/60 p-3.5 shadow-sm transition-all hover:border-primary/40 hover:bg-card/90">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-foreground">{pick.pickNumber}</p>
                        <p className="text-xs text-muted-foreground">{pick.orderNumber} • {pick.customerName}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {pick.priority === "high" ? (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/25 text-[10px] font-bold">High</Badge>
                        ) : null}
                        <Badge variant="outline" className={`rounded-lg text-[10px] font-semibold ${PICK_STATUS_COLORS[pick.status] || PICK_STATUS_COLORS.pending}`}>
                          {pick.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{pick.itemCount} line item{pick.itemCount === 1 ? "" : "s"}</span>
                        <span className="font-bold text-foreground font-mono">{pick.progress}%</span>
                      </div>
                      <Progress value={pick.progress} className="h-1.5 bg-muted/60" />
                    </div>
                    <p className="mt-2.5 text-[11px] text-muted-foreground">
                      Assigned: <span className="font-semibold text-foreground">{pick.assignedTo || "Warehouse Queue"}</span>
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Orders */}
          <Card className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card/95 via-card/85 to-card/60 shadow-xl backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  Recent Orders
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Latest transactions logged in the system.</CardDescription>
              </div>
              <Link href="/orders">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary rounded-xl text-xs">
                  View all →
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  Orders will appear here once created.
                </div>
              ) : (
                data.recentOrders.map((order) => (
                  <div key={order.id} className="rounded-xl border border-border/70 bg-card/60 p-3.5 shadow-sm transition-all hover:border-primary/40 hover:bg-card/90">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-foreground">{order.orderNumber}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <p className="text-xs text-muted-foreground">{order.customer?.name || "Unknown Customer"}</p>
                          <Badge
                            variant="outline"
                            className={`rounded-md text-[10px] font-semibold ${
                              COMMERCE_CHANNEL_COLORS[normalizeCommerceChannel(order.sourceChannel)] ||
                              COMMERCE_CHANNEL_COLORS.admin
                            }`}
                          >
                            {COMMERCE_CHANNEL_LABELS[normalizeCommerceChannel(order.sourceChannel)]}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="outline" className={`rounded-lg text-[10px] font-semibold ${STATUS_COLORS[order.status] || STATUS_COLORS.draft}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatDate(order.orderDate)}</span>
                      <span className="font-extrabold text-foreground font-mono">{formatCurrencyShort(order.totalAmount)}</span>
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
