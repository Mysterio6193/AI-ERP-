"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  DollarSign,
  Package,
  Receipt,
  Truck,
  Users,
  CheckCircle2,
  Boxes,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { KpiCard } from "@/components/ui/kpi-card"
import { PageHeader } from "@/components/ui/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, formatCurrencyShort, formatDate } from "@/lib/types"

interface SupplierLite {
  id: string
  name: string
  status: string
  _count?: {
    purchaseOrders: number
  }
}

interface PurchaseOrderLite {
  id: string
  poNumber: string
  orderDate: string
  expectedDate?: string | null
  totalAmount: number
  status: string
  supplier: {
    name: string
  }
  items: Array<{
    id: string
    quantity: number
    receivedQty: number
  }>
}

interface InventoryLite {
  id: string
  quantity: number
  reorderLevel: number
  stockValue: number
  product: {
    id: string
    name: string
    sku: string
    costPrice: number
  }
}

async function fetchCollection<T>(path: string): Promise<T[]> {
  const response = await fetch(path)
  const payload = await response.json()
  if (!payload.success) return []
  return payload.data || []
}

const statusBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  confirmed: "default",
  partial: "secondary",
  received: "default",
  cancelled: "destructive",
}

export default function ExpensesPage() {
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderLite[]>([])
  const [inventory, setInventory] = useState<InventoryLite[]>([])

  useEffect(() => {
    async function load() {
      try {
        const [nextSuppliers, nextPurchaseOrders, nextInventory] = await Promise.all([
          fetchCollection<SupplierLite>("/api/suppliers"),
          fetchCollection<PurchaseOrderLite>("/api/purchase-orders"),
          fetchCollection<InventoryLite>("/api/inventory"),
        ])

        setSuppliers(nextSuppliers)
        setPurchaseOrders(nextPurchaseOrders)
        setInventory(nextInventory)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const insights = useMemo(() => {
    const activeSuppliers = suppliers.filter((supplier) => supplier.status === "active").length
    const openPurchaseOrders = purchaseOrders.filter((order) =>
      ["draft", "submitted", "confirmed", "partial"].includes(order.status)
    )
    const lowStockItems = inventory.filter((item) => item.quantity <= item.reorderLevel)
    const replenishmentRisk = lowStockItems.reduce((sum, item) => {
      const deficit = Math.max(item.reorderLevel - item.quantity, 0)
      return sum + deficit * (item.product.costPrice || 0)
    }, 0)

    const supplierCoverage = suppliers
      .map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        poCount: supplier._count?.purchaseOrders || 0,
      }))
      .sort((left, right) => right.poCount - left.poCount)
      .slice(0, 6)

    const replenishmentWatchlist = lowStockItems
      .map((item) => ({
        id: item.id,
        name: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        reorderLevel: item.reorderLevel,
        stockValue: item.stockValue,
      }))
      .sort((left, right) => left.quantity - right.quantity)
      .slice(0, 6)

    return {
      activeSuppliers,
      openPurchaseOrders,
      lowStockItems,
      replenishmentRisk,
      supplierCoverage,
      replenishmentWatchlist,
      totalPurchaseOrderValue: purchaseOrders.reduce((sum, order) => sum + order.totalAmount, 0),
      openPurchaseOrderValue: openPurchaseOrders.reduce((sum, order) => sum + order.totalAmount, 0),
      inventoryValue: inventory.reduce((sum, item) => sum + item.stockValue, 0),
    }
  }, [inventory, purchaseOrders, suppliers])

  return (
    <AppShell title="Expenses & Spend" breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Expenses" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Expenses & Spend Controls"
          description="Live procurement commitments, supplier spend coverage, and inventory replenishment pressure."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/suppliers">
                  <Users className="mr-2 h-4 w-4" />
                  Suppliers
                </Link>
              </Button>
              <Button asChild>
                <Link href="/purchase-orders">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Purchase Orders
                </Link>
              </Button>
            </div>
          }
        />

        {/* Metrics Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Active Suppliers"
            value={loading ? "..." : insights.activeSuppliers}
            description="Verified supply partners"
            icon={Users}
          />
          <KpiCard
            title="Open PO Value"
            value={loading ? "..." : formatCurrencyShort(insights.openPurchaseOrderValue)}
            description={`${insights.openPurchaseOrders.length} orders in pipeline`}
            icon={Receipt}
          />
          <KpiCard
            title="Inventory Value"
            value={loading ? "..." : formatCurrencyShort(insights.inventoryValue)}
            description={`${inventory.length} active SKU stock lines`}
            icon={Boxes}
          />
          <KpiCard
            title="Replenishment Risk"
            value={loading ? "..." : formatCurrencyShort(insights.replenishmentRisk)}
            description={`${insights.lowStockItems.length} SKUs below reorder`}
            icon={AlertTriangle}
          />
        </div>

        <Tabs defaultValue="activity" className="space-y-6">
          <TabsList className="grid w-full max-w-xl grid-cols-3 bg-muted/60 p-1">
            <TabsTrigger value="activity">
              <Receipt className="mr-2 h-4 w-4" />
              Spend Activity
            </TabsTrigger>
            <TabsTrigger value="suppliers">
              <Truck className="mr-2 h-4 w-4" />
              Supplier Coverage
            </TabsTrigger>
            <TabsTrigger value="risk">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Replenishment Risk
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Spend Activity */}
          <TabsContent value="activity" className="space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Recent Purchase Orders</CardTitle>
                <CardDescription>Live inbound procurement activity and committed supplier spend.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {purchaseOrders.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No purchase orders"
                    description="Create a purchase order to start tracking procurement spend."
                    action={
                      <Button asChild size="sm">
                        <Link href="/purchase-orders">Create Purchase Order</Link>
                      </Button>
                    }
                    className="min-h-[200px]"
                  />
                ) : (
                  purchaseOrders.slice(0, 6).map((order) => (
                    <div
                      key={order.id}
                      className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-sm font-semibold text-foreground">{order.poNumber}</p>
                            <Badge variant={statusBadgeVariants[order.status] || "secondary"} className="capitalize text-xs">
                              {order.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {order.supplier.name} • Ordered {formatDate(order.orderDate)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {order.items.length} item lines
                            {order.expectedDate ? ` • Expected ETA: ${formatDate(order.expectedDate)}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-foreground">{formatCurrency(order.totalAmount)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Supplier Coverage */}
          <TabsContent value="suppliers" className="space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Supplier Procurement Network</CardTitle>
                <CardDescription>Suppliers ranked by total purchase order volume and spend frequency.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.supplierCoverage.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No supplier records"
                    description="Add suppliers to monitor procurement coverage and spend concentration."
                    action={
                      <Button asChild size="sm">
                        <Link href="/suppliers">Add Supplier</Link>
                      </Button>
                    }
                    className="min-h-[200px]"
                  />
                ) : (
                  insights.supplierCoverage.map((supplier) => (
                    <Link
                      key={supplier.id}
                      href="/suppliers"
                      className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30 group"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{supplier.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Total purchase orders raised: <span className="font-medium text-foreground">{supplier.poCount}</span>
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: Replenishment Risk */}
          <TabsContent value="risk" className="space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Low-Stock Replenishment Watchlist</CardTitle>
                <CardDescription>Stock lines reaching critical reorder levels that require immediate purchase orders.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.replenishmentWatchlist.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Healthy inventory levels"
                    description="No inventory items are currently at or below their minimum reorder point."
                    className="min-h-[200px]"
                  />
                ) : (
                  insights.replenishmentWatchlist.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground">{item.name}</p>
                            <Badge variant="destructive" className="text-[10px]">Low Stock</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            SKU: <span className="font-mono">{item.sku}</span> • On Hand: <span className="font-bold text-destructive">{item.quantity}</span> (Reorder Level: {item.reorderLevel})
                          </p>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-xs text-muted-foreground uppercase font-semibold">Holding Value</p>
                          <p className="text-base font-bold text-foreground">{formatCurrency(item.stockValue)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {insights.lowStockItems.length > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">{insights.lowStockItems.length} inventory lines are at or below reorder threshold</p>
                  <p className="text-xs opacity-90">Estimated capital required to replenish safe stock buffers: {formatCurrency(insights.replenishmentRisk)}.</p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Bottom Quick Links */}
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Purchase Orders", desc: "Raise and manage supplier orders", href: "/purchase-orders", icon: ClipboardList },
            { label: "Suppliers Directory", desc: "Maintain verified vendor records", href: "/suppliers", icon: Users },
            { label: "Inventory Health", desc: "Audit warehouse stock & valuation", href: "/inventory", icon: Package },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="group">
              <Card className="h-full border-border bg-card shadow-sm transition-all hover:border-primary/50 hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground group-hover:text-primary">{item.label}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{item.desc}</p>
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

