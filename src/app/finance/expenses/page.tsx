"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Package,
  Receipt,
  Truck,
  Users,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

const statusClasses: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  partial: "bg-amber-100 text-amber-700",
  received: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
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
    <AppShell title="Expenses & Spend" breadcrumbs={[{ label: "Finance" }, { label: "Expenses" }]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expenses & Spend Controls</h1>
            <p className="text-muted-foreground">
              Live procurement and spend pressure based on suppliers, purchase orders, and inventory health.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/suppliers">
                <Users className="mr-2 h-4 w-4" />
                Suppliers
              </Link>
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" asChild>
              <Link href="/purchase-orders">
                <ClipboardList className="mr-2 h-4 w-4" />
                Purchase Orders
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active suppliers</p>
              <p className="mt-2 text-2xl font-bold">{loading ? "..." : insights.activeSuppliers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Open PO value</p>
              <p className="mt-2 text-2xl font-bold">{loading ? "..." : formatCurrencyShort(insights.openPurchaseOrderValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Inventory value</p>
              <p className="mt-2 text-2xl font-bold">{loading ? "..." : formatCurrencyShort(insights.inventoryValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Replenishment risk</p>
              <p className="mt-2 text-2xl font-bold">{loading ? "..." : formatCurrencyShort(insights.replenishmentRisk)}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="activity" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
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

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent purchase orders</CardTitle>
                <CardDescription>Live inbound spend activity recorded inside SupplySure OS.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {purchaseOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                    No purchase orders recorded yet.
                  </div>
                ) : (
                  purchaseOrders.slice(0, 6).map((order) => (
                    <div key={order.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900">{order.poNumber}</p>
                            <Badge className={statusClasses[order.status] || "bg-slate-100 text-slate-700"}>
                              {order.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {order.supplier.name} • Ordered {formatDate(order.orderDate)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.items.length} items
                            {order.expectedDate ? ` • ETA ${formatDate(order.expectedDate)}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">{formatCurrency(order.totalAmount)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supplier network</CardTitle>
                <CardDescription>Suppliers ranked by live purchase-order activity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.supplierCoverage.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                    Add suppliers to start monitoring procurement coverage.
                  </div>
                ) : (
                  insights.supplierCoverage.map((supplier) => (
                    <div key={supplier.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                      <div>
                        <p className="font-medium text-slate-900">{supplier.name}</p>
                        <p className="text-sm text-muted-foreground">Purchase orders raised: {supplier.poCount}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Low-stock replenishment watchlist</CardTitle>
                <CardDescription>SKUs most likely to trigger near-term procurement spend.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.replenishmentWatchlist.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                    No low-stock items are currently forcing replenishment action.
                  </div>
                ) : (
                  insights.replenishmentWatchlist.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.sku} • On hand {item.quantity} vs reorder level {item.reorderLevel}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Current stock value</p>
                          <p className="font-semibold text-slate-900">{formatCurrency(item.stockValue)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {insights.lowStockItems.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <AlertTriangle className="mr-2 inline h-4 w-4" />
                {insights.lowStockItems.length} inventory lines are currently at or below reorder level.
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Purchase Orders", desc: "Raise and track inbound supplier orders", href: "/purchase-orders", icon: ClipboardList },
            { label: "Suppliers", desc: "Maintain supplier records and coverage", href: "/suppliers", icon: Users },
            { label: "Inventory", desc: "Review stock pressure before spending", href: "/inventory", icon: Package },
          ].map((item) => (
            <Link key={item.label} href={item.href}>
              <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
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
