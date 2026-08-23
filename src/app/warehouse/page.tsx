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
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Warehouse & Logistics Operations</h1>
            <p className="text-muted-foreground">
              Manage multi-depot inventory, picking lists, receiving docks, and mobile floor operations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none"
            >
              <Smartphone className="mr-2 h-4 w-4" />
              Launch Mobile Companion (Port 3001)
              <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
            </a>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Warehouses</CardTitle>
              <WarehouseIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{warehouses.length || 1}</div>
              <p className="text-xs text-muted-foreground">Across Australian logistics network</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Pick Lists</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{pendingPicks.length}</div>
              <p className="text-xs text-muted-foreground">Awaiting or in picking flow</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Stocked SKUs</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inventoryStats.totalItems}</div>
              <p className="text-xs text-muted-foreground">
                Est. value: ${inventoryStats.totalValue.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
              <Boxes className={`h-4 w-4 ${inventoryStats.lowStock > 0 ? "text-red-500" : "text-emerald-500"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${inventoryStats.lowStock > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {inventoryStats.lowStock}
              </div>
              <p className="text-xs text-muted-foreground">Below reorder threshold</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Nav Links */}
        <div className="grid gap-4 md:grid-cols-4">
          <Link href="/warehouse/picking" className="block">
            <Card className="hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  Picking Queue
                </CardTitle>
                <CardDescription>View, assign and pick sales order batches</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/inventory" className="block">
            <Card className="hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-emerald-600" />
                  Live Inventory & Bins
                </CardTitle>
                <CardDescription>Browse stock levels, bins and adjust quantities</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/purchase-orders" className="block">
            <Card className="hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4 text-amber-600" />
                  Inbound Receiving
                </CardTitle>
                <CardDescription>Receive purchase shipments from suppliers</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/warehouses" className="block">
            <Card className="hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <WarehouseIcon className="h-4 w-4 text-purple-600" />
                  Manage Facilities
                </CardTitle>
                <CardDescription>Configure depots, zones, and capacity limits</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>

        {/* Warehouses Facilities Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Warehouse Facilities & Cold Stores</CardTitle>
              <CardDescription>Primary storage facilities, bay capacities, and manager contacts</CardDescription>
            </div>
            <Link href="/warehouses">
              <Button variant="outline" size="sm">Manage Warehouses</Button>
            </Link>
          </CardHeader>
          <CardContent>
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
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No warehouses found. Click &quot;Manage Warehouses&quot; to add one.
                    </TableCell>
                  </TableRow>
                ) : (
                  warehouses.map((wh) => (
                    <TableRow key={wh.id}>
                      <TableCell className="font-medium">
                        {wh.name} {wh.isDefault && <Badge variant="secondary" className="ml-2">Default</Badge>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{wh.code}</Badge></TableCell>
                      <TableCell>{wh.city || wh.location}, {wh.state || "NSW"}</TableCell>
                      <TableCell>{wh.contactName || "—"}</TableCell>
                      <TableCell>{wh.capacity ? `${wh.capacity.toLocaleString()} pallets` : "Unlimited"}</TableCell>
                      <TableCell className="font-semibold text-emerald-600">
                        ${(wh.totalValue || 0).toLocaleString("en-AU", { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-100 text-emerald-800 border-0">
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Picking Queue</CardTitle>
              <CardDescription>Orders currently being picked or queued for the warehouse floor</CardDescription>
            </div>
            <Link href="/warehouse/picking">
              <Button variant="outline" size="sm">Open Picking Floor</Button>
            </Link>
          </CardHeader>
          <CardContent>
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
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No active pick lists. Create one from an approved Sales Order.
                    </TableCell>
                  </TableRow>
                ) : (
                  pickLists.slice(0, 5).map((pick) => (
                    <TableRow key={pick.id}>
                      <TableCell className="font-mono font-medium">{pick.pickNumber}</TableCell>
                      <TableCell>{pick.orderNumber || "—"}</TableCell>
                      <TableCell className="font-medium">{pick.customerName || "Customer"}</TableCell>
                      <TableCell>{pick.items?.length || 0} line items</TableCell>
                      <TableCell>{pick.assignedTo || "Unassigned"}</TableCell>
                      <TableCell>
                        <Badge variant={pick.priority === "high" ? "destructive" : "secondary"}>
                          {pick.priority || "normal"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            pick.status === "in_progress"
                              ? "border-blue-500 text-blue-600 bg-blue-50"
                              : pick.status === "completed"
                              ? "border-emerald-500 text-emerald-600 bg-emerald-50"
                              : "border-gray-300 text-gray-700"
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
