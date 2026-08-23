"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { 
  Search, Package, Warehouse, AlertTriangle, 
  Plus, Minus, ArrowUpDown, History, DollarSign, Edit
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import { formatCurrency } from "@/lib/types"

interface InventoryItem {
  id: string
  productId: string
  warehouseId: string
  quantity: number
  reserved: number
  reorderLevel: number
  product: {
    id: string
    sku: string
    name: string
    baseUnit: string
    wholesalePrice: number
  }
  warehouse: {
    id: string
    name: string
    code: string
  }
}

interface Warehouse {
  id: string
  name: string
  code: string
  address?: string
}

interface Product {
  id: string
  sku: string
  name: string
  baseUnit: string
  wholesalePrice: number
  totalStock?: number
  inventory?: InventoryItem[]
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all")
  const [stockFilter, setStockFilter] = useState<string>("all")
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [adjustmentType, setAdjustmentType] = useState<"in" | "out">("in")
  const [adjustmentQty, setAdjustmentQty] = useState("")
  const [adjustmentNotes, setAdjustmentNotes] = useState("")

  useEffect(() => {
    fetchInventory()
    fetchWarehouses()
    fetchProducts()
  }, [])

  const fetchInventory = async () => {
    try {
      const response = await fetch("/api/inventory")
      const data = await response.json()
      if (data.success) {
        setInventory(data.data)
      }
    } catch (error) {
      console.error("Error fetching inventory:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchWarehouses = async () => {
    try {
      const response = await fetch("/api/warehouses")
      const data = await response.json()
      if (data.success) {
        setWarehouses(data.data)
      }
    } catch (error) {
      console.error("Error fetching warehouses:", error)
    }
  }

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/products")
      const data = await response.json()
      if (data.success) {
        setProducts(data.data)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    }
  }

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch = 
      item.product.name.toLowerCase().includes(search.toLowerCase()) ||
      item.product.sku.toLowerCase().includes(search.toLowerCase())
    const matchesWarehouse = warehouseFilter === "all" || item.warehouseId === warehouseFilter
    const matchesStock = 
      stockFilter === "all" ||
      (stockFilter === "low" && item.quantity <= item.reorderLevel && item.quantity > 0) ||
      (stockFilter === "out" && item.quantity === 0) ||
      (stockFilter === "normal" && item.quantity > item.reorderLevel)
    return matchesSearch && matchesWarehouse && matchesStock
  })

  const handleStockAdjustment = async () => {
    if (!selectedItem) return
    
    try {
      const response = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedItem.productId,
          warehouseId: selectedItem.warehouseId,
          type: adjustmentType,
          quantity: parseInt(adjustmentQty),
          notes: adjustmentNotes,
        }),
      })

      const data = await response.json()
      if (data.success) {
        fetchInventory()
        setIsAdjustmentDialogOpen(false)
        setSelectedItem(null)
        setAdjustmentQty("")
        setAdjustmentNotes("")
      }
    } catch (error) {
      console.error("Error adjusting stock:", error)
    }
  }

  // Calculate summary stats
  const totalSKUs = new Set(inventory.map(i => i.productId)).size
  const lowStockItems = inventory.filter(i => i.quantity <= i.reorderLevel && i.quantity > 0)
  const outOfStockItems = inventory.filter(i => i.quantity === 0)
  const totalValue = inventory.reduce((sum, i) => sum + (i.quantity * i.product.wholesalePrice), 0)

  // Group inventory by product for aggregated view
  const productInventory = products.map(product => {
    const items = inventory.filter(i => i.productId === product.id)
    const totalStock = items.reduce((sum, i) => sum + i.quantity, 0)
    const minReorderLevel = items.length > 0 ? Math.min(...items.map(i => i.reorderLevel)) : 0
    const isLowStock = items.some(i => i.quantity <= i.reorderLevel)
    
    return {
      ...product,
      totalStock,
      minReorderLevel,
      isLowStock,
      warehouseCount: items.length,
      inventory: items,
    }
  })

  const filteredProductInventory = productInventory.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
    const matchesStock = 
      stockFilter === "all" ||
      (stockFilter === "low" && p.isLowStock && p.totalStock > 0) ||
      (stockFilter === "out" && p.totalStock === 0) ||
      (stockFilter === "normal" && !p.isLowStock && p.totalStock > 0)
    return matchesSearch && matchesStock
  })

  return (
    <AppShell title="Inventory" breadcrumbs={[{ label: "Inventory" }]}>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Inventory Management"
          description="Real-time multi-warehouse stock tracking, inventory valuations, and manual stock balance adjustments."
          actions={
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/inventory/movements">
                  <History className="mr-2 h-4 w-4" />
                  Movement Logs
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/warehouses">
                  <Warehouse className="mr-2 h-4 w-4" />
                  Manage Locations
                </Link>
              </Button>
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Tracked SKUs"
            value={totalSKUs}
            description="Catalog line items"
            icon={Package}
          />
          <KpiCard
            title="Low Stock Items"
            value={lowStockItems.length}
            description="At or below reorder level"
            icon={AlertTriangle}
          />
          <KpiCard
            title="Out of Stock"
            value={outOfStockItems.length}
            description="Requires replenishment"
            icon={AlertTriangle}
          />
          <KpiCard
            title="Total Stock Value"
            value={formatCurrency(totalValue)}
            description="Wholesale valuation"
            icon={DollarSign}
          />
        </div>

        {/* Filters */}
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product name or SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="w-48 text-xs">
                  <SelectValue placeholder="All Warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="w-40 text-xs">
                  <SelectValue placeholder="Stock Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock Status</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                  <SelectItem value="normal">Adequate Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="by-product" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-xs">
            <TabsTrigger value="by-product">By Product</TabsTrigger>
            <TabsTrigger value="by-warehouse">By Warehouse</TabsTrigger>
          </TabsList>

          <TabsContent value="by-product" className="space-y-4">
            <Card className="border-border shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="font-semibold">Product</TableHead>
                      <TableHead className="text-center font-semibold">Total Stock</TableHead>
                      <TableHead className="text-center font-semibold">Reorder Level</TableHead>
                      <TableHead className="text-center font-semibold">Warehouses</TableHead>
                      <TableHead className="text-right font-semibold">Stock Value</TableHead>
                      <TableHead className="text-center font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                          Loading inventory balances...
                        </TableCell>
                      </TableRow>
                    ) : filteredProductInventory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12">
                          <EmptyState
                            icon={Package}
                            title="No inventory records found"
                            description="No products match the selected search criteria and filters."
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProductInventory.map((product) => (
                        <TableRow key={product.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground border border-border">
                                <Package className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-sm text-foreground truncate">{product.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">{product.sku}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            <span className={`font-semibold ${product.totalStock === 0 ? "text-destructive" : product.isLowStock ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                              {product.totalStock}
                            </span>
                            <span className="text-muted-foreground text-xs ml-1 capitalize">({product.baseUnit})</span>
                          </TableCell>
                          <TableCell className="text-center text-sm font-mono text-muted-foreground">{product.minReorderLevel}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono text-xs">{product.warehouseCount} locs</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-foreground">
                            {formatCurrency(product.totalStock * (product.inventory?.[0]?.product?.wholesalePrice || 0))}
                          </TableCell>
                          <TableCell className="text-center">
                            {product.totalStock === 0 ? (
                              <Badge variant="destructive" className="font-medium">Out of Stock</Badge>
                            ) : product.isLowStock ? (
                              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-medium">Low Stock</Badge>
                            ) : (
                              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-medium">In Stock</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="by-warehouse">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {warehouses.map((warehouse) => {
                const warehouseInventory = inventory.filter(i => i.warehouseId === warehouse.id)
                const totalItems = warehouseInventory.length
                const lowStock = warehouseInventory.filter(i => i.quantity <= i.reorderLevel).length
                const totalWhValue = warehouseInventory.reduce((sum, i) => sum + (i.quantity * i.product.wholesalePrice), 0)
                
                return (
                  <Card key={warehouse.id} className="border-border shadow-sm transition-all hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                            <Warehouse className="h-4 w-4 text-primary shrink-0" />
                            {warehouse.name}
                          </CardTitle>
                          <CardDescription className="font-mono text-xs mt-0.5">{warehouse.code}</CardDescription>
                        </div>
                        <Badge variant="outline" className="text-xs">{totalItems} SKUs</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-3 border border-border text-center">
                        <div>
                          <p className="text-lg font-bold text-foreground">{totalItems}</p>
                          <p className="text-[11px] text-muted-foreground">Total Lines</p>
                        </div>
                        <div>
                          <p className={`text-lg font-bold ${lowStock > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                            {lowStock}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Low Stock</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-foreground">{formatCurrency(totalWhValue)}</p>
                          <p className="text-[11px] text-muted-foreground">Valuation</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Stock Positions</p>
                        <div className="space-y-1">
                          {warehouseInventory.slice(0, 5).map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-xs rounded-md bg-card p-2 border border-border">
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="truncate font-medium text-foreground">{item.product.name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{item.product.sku}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`font-semibold ${item.quantity <= item.reorderLevel ? "text-destructive" : "text-foreground"}`}>
                                  {item.quantity}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-[10px]"
                                  onClick={() => {
                                    setSelectedItem(item)
                                    setAdjustmentType("in")
                                    setAdjustmentQty("")
                                    setAdjustmentNotes("")
                                    setIsAdjustmentDialogOpen(true)
                                  }}
                                >
                                  Adjust
                                </Button>
                              </div>
                            </div>
                          ))}
                          {warehouseInventory.length > 5 && (
                            <p className="text-[11px] text-muted-foreground text-center pt-1">
                              +{warehouseInventory.length - 5} more items in this warehouse
                            </p>
                          )}
                          {warehouseInventory.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              No inventory stock assigned to this location yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Stock Adjustment Dialog */}
        <Dialog open={isAdjustmentDialogOpen} onOpenChange={setIsAdjustmentDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowUpDown className="h-5 w-5 text-primary" />
                Stock Adjustment
              </DialogTitle>
              <DialogDescription>
                Manual count reconciliation or stock adjustment.
              </DialogDescription>
            </DialogHeader>
            
            {selectedItem && (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between p-3.5 bg-muted/40 rounded-lg border border-border">
                  <div>
                    <p className="font-medium text-sm text-foreground">{selectedItem.product.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{selectedItem.product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm text-foreground">Current: {selectedItem.quantity}</p>
                    <p className="text-xs text-muted-foreground">{selectedItem.warehouse.name}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Adjustment Type</Label>
                    <Select 
                      value={adjustmentType} 
                      onValueChange={(value) => setAdjustmentType(value as "in" | "out")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in">
                          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <Plus className="h-3.5 w-3.5" />
                            Stock In (Receipt)
                          </div>
                        </SelectItem>
                        <SelectItem value="out">
                          <div className="flex items-center gap-2 text-destructive">
                            <Minus className="h-3.5 w-3.5" />
                            Stock Out (Write-off)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={adjustmentQty}
                      onChange={(e) => setAdjustmentQty(e.target.value)}
                      placeholder="e.g. 10"
                    />
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-xs">Reason / Audit Notes</Label>
                  <Textarea
                    value={adjustmentNotes}
                    onChange={(e) => setAdjustmentNotes(e.target.value)}
                    placeholder="Stocktake variance, damage, supplier sample..."
                    rows={2}
                  />
                </div>
              </div>
            )}
            
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsAdjustmentDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleStockAdjustment}
                disabled={!adjustmentQty || parseInt(adjustmentQty) <= 0}
              >
                Confirm Adjustment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
