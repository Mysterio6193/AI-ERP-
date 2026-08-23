"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Boxes,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Truck,
  Warehouse as WarehouseIcon,
  AlertTriangle,
  ArrowRight
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function WarehouseDashboardPage() {
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [pickLists, setPickLists] = useState<any[]>([])
  const [inventoryStats, setInventoryStats] = useState({ totalItems: 0, totalValue: 0, lowStock: 0 })
  const [loading, setLoading] = useState(true)

  async function loadData() {
    try {
      setLoading(true)
      const [whRes, pickRes, invRes] = await Promise.all([
        fetch("/api/warehouses").then((r) => r.json()).catch(() => ({ success: false })),
        fetch("/api/pick-lists").then((r) => r.json()).catch(() => ({ success: false })),
        fetch("/api/inventory").then((r) => r.json()).catch(() => ({ success: false })),
      ])

      if (whRes.success) setWarehouses(whRes.data || [])
      if (pickRes.success) setPickLists(pickRes.data || [])
      if (invRes.success) {
        const items = invRes.data || []
        const totalValue = items.reduce(
          (sum: number, i: any) => sum + (i.quantity || 0) * (i.avgCost || i.product?.costPrice || 0),
          0
        )
        const lowStock = items.filter((i: any) => i.isLowStock || i.quantity <= (i.reorderLevel || 10)).length
        setInventoryStats({
          totalItems: items.length,
          totalValue,
          lowStock,
        })
      }
    } catch (err) {
      console.error("Failed to load warehouse data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const pendingPicks = pickLists.filter((p) => p.status === "pending" || p.status === "in_progress")

  return (
    <AppShell title="Warehouse & Logistics" breadcrumbs={[{ label: "Warehouse" }]}>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Warehouse & Logistics Operations"
          description="Manage multi-depot inventory, wave picking lists, receiving docks, and mobile floor operations."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <a
                href="http://localhost:3001"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" variant="default" className="shadow-sm">
                  <Smartphone className="mr-2 h-4 w-4" />
                  Mobile Companion
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
                </Button>
              </a>
            </>
          }
        />

        {/* Metric Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Active Facilities"
            value={warehouses.length || 1}
            description="Depots across logistics network"
            icon={WarehouseIcon}
          />
          <KpiCard
            title="Pending Pick Lists"
            value={pendingPicks.length}
            description="Awaiting or active on picking floor"
            icon={Package}
          />
          <KpiCard
            title="Total Stocked SKUs"
            value={inventoryStats.totalItems}
            description={`Est. value: $${inventoryStats.totalValue.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`}
            icon={Layers}
          />
          <KpiCard
            title="Low Stock Alerts"
            value={inventoryStats.lowStock}
            description="Below replenishment reorder level"
            icon={Boxes}
          />
        </div>

        {/* Quick Action Navigation Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/warehouse/picking" className="block group">
            <Card className="h-full border border-border shadow-sm hover:border-primary/50 hover:shadow-md transition-all">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Package className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <CardTitle className="text-sm font-semibold mt-3 text-foreground">Picking Queue</CardTitle>
                <CardDescription className="text-xs">View, assign and pick sales order batches</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/inventory" className="block group">
            <Card className="h-full border border-border shadow-sm hover:border-primary/50 hover:shadow-md transition-all">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Boxes className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <CardTitle className="text-sm font-semibold mt-3 text-foreground">Live Inventory & Bins</CardTitle>
                <CardDescription className="text-xs">Browse stock levels, bins and adjust quantities</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/purchase-orders" className="block group">
            <Card className="h-full border border-border shadow-sm hover:border-primary/50 hover:shadow-md transition-all">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Truck className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <CardTitle className="text-sm font-semibold mt-3 text-foreground">Inbound Receiving</CardTitle>
                <CardDescription className="text-xs">Receive purchase shipments from suppliers</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/warehouses" className="block group">
            <Card className="h-full border border-border shadow-sm hover:border-primary/50 hover:shadow-md transition-all">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <WarehouseIcon className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
                <CardTitle className="text-sm font-semibold mt-3 text-foreground">Manage Facilities</CardTitle>
                <CardDescription className="text-xs">Configure depots, zones, and capacity limits</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>

        {/* Warehouses Facilities Table */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <WarehouseIcon className="h-4 w-4 text-primary" />
                Warehouse Facilities & Storage Hubs
              </CardTitle>
              <CardDescription>Primary storage facilities, bay capacities, and facility manager contacts</CardDescription>
            </div>
            <Link href="/warehouses">
              <Button variant="outline" size="sm">Manage Warehouses</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Stock Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-6">
                      <EmptyState
                        icon={WarehouseIcon}
                        title="No warehouses found"
                        description="Click 'Manage Warehouses' to configure your storage depots."
                        action={
                          <Link href="/warehouses">
                            <Button size="sm">Manage Warehouses</Button>
                          </Link>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  warehouses.map((wh) => (
                    <TableRow key={wh.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-semibold text-foreground">
                        {wh.name} {wh.isDefault && <Badge variant="secondary" className="ml-2 text-[10px]">Default</Badge>}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="font-mono text-xs">{wh.code}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{wh.city || wh.location}, {wh.state || "NSW"}</TableCell>
                      <TableCell className="text-sm">{wh.contactName || "—"}</TableCell>
                      <TableCell className="text-sm">{wh.capacity ? `${wh.capacity.toLocaleString()} pallets` : "Unlimited"}</TableCell>
                      <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                        ${(wh.totalValue || 0).toLocaleString("en-AU", { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-xs font-medium">
                          {wh.status || "active"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Active Picking Queue Table */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Active Picking Queue
              </CardTitle>
              <CardDescription>Orders currently being picked or queued for the warehouse floor</CardDescription>
            </div>
            <Link href="/warehouse/picking">
              <Button variant="outline" size="sm">Open Picking Floor</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pick #</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pickLists.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-6">
                      <EmptyState
                        icon={Package}
                        title="No active pick lists"
                        description="Pick lists are generated from approved and released Sales Orders."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  pickLists.slice(0, 5).map((pick) => (
                    <TableRow key={pick.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-mono font-semibold text-foreground text-xs">{pick.pickNumber}</TableCell>
                      <TableCell className="text-sm">{pick.orderNumber || "—"}</TableCell>
                      <TableCell className="font-medium text-sm">{pick.customerName || "Customer"}</TableCell>
                      <TableCell className="text-sm">{pick.items?.length || 0} line items</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{pick.assignedTo || "Unassigned"}</TableCell>
                      <TableCell>
                        <Badge variant={pick.priority === "high" ? "destructive" : "secondary"} className="text-[10px]">
                          {pick.priority || "normal"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            pick.status === "in_progress"
                              ? "border-blue-500/30 text-blue-700 dark:text-blue-400 bg-blue-500/10 text-xs"
                              : pick.status === "completed"
                              ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 text-xs"
                              : "border-border text-muted-foreground text-xs"
                          }
                        >
                          {pick.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

