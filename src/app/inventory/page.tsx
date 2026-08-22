"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { 
  Search, Package, Warehouse, AlertTriangle, 
  Plus, Minus
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
      (stockFilter === "low" && item.quantity <= item.reorderLevel) ||
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

  return (
    <AppShell title="Inventory" breadcrumbs={[{ label: "Inventory" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Inventory Management</h1>
            <p className="text-muted-foreground">Track stock levels across warehouses</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/warehouses">
              <Warehouse className="mr-2 h-4 w-4" />
              Manage Locations
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total SKUs</CardDescription>
              <CardTitle className="text-2xl">{totalSKUs}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Low Stock</CardDescription>
              <CardTitle className="text-2xl text-orange-600">{lowStockItems.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Out of Stock</CardDescription>
              <CardTitle className="text-2xl text-red-600">{outOfStockItems.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Stock Value</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(totalValue)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product name or SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="w-48">
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
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Stock Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="by-product" className="space-y-4">
          <TabsList>
            <TabsTrigger value="by-product">By Product</TabsTrigger>
            <TabsTrigger value="by-warehouse">By Warehouse</TabsTrigger>
          </TabsList>

          <TabsContent value="by-product">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Total Stock</TableHead>
                      <TableHead className="text-center">Reorder Level</TableHead>
                      <TableHead className="text-center">Warehouses</TableHead>
                      <TableHead className="text-right">Stock Value</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Loading inventory...
                        </TableCell>
                      </TableRow>
                    ) : productInventory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No products found
                        </TableCell>
                      </TableRow>
                    ) : (
                      productInventory.map((product) => (
                        <TableRow key={product.id} className="group">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                                <Package className="h-5 w-5 text-gray-500" />
                              </div>
                              <div>
                                <div className="font-medium">{product.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">{product.sku}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-medium ${product.totalStock === 0 ? "text-red-600" : product.isLowStock ? "text-orange-600" : ""}`}>
                              {product.totalStock}
                            </span>
                            <span className="text-muted-foreground text-xs ml-1 capitalize">({product.baseUnit})</span>
                          </TableCell>
                          <TableCell className="text-center">{product.minReorderLevel}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{product.warehouseCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.totalStock * (product.inventory?.[0]?.product?.wholesalePrice || 0))}
                          </TableCell>
                          <TableCell className="text-center">
                            {product.totalStock === 0 ? (
                              <Badge className="bg-red-100 text-red-700">Out of Stock</Badge>
                            ) : product.isLowStock ? (
                              <Badge className="bg-orange-100 text-orange-700">Low Stock</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-700">In Stock</Badge>
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {warehouses.map((warehouse) => {
                const warehouseInventory = inventory.filter(i => i.warehouseId === warehouse.id)
                const totalItems = warehouseInventory.length
                const lowStock = warehouseInventory.filter(i => i.quantity <= i.reorderLevel).length
                const totalValue = warehouseInventory.reduce((sum, i) => sum + (i.quantity * i.product.wholesalePrice), 0)
                
                return (
                  <Card key={warehouse.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Warehouse className="h-5 w-5" />
                            {warehouse.name}
                          </CardTitle>
                          <CardDescription>{warehouse.code}</CardDescription>
                        </div>
                        <Badge variant="outline">{totalItems} items</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-2xl font-bold">{totalItems}</p>
                            <p className="text-xs text-muted-foreground">Total Items</p>
                          </div>
                          <div>
                            <p className={`text-2xl font-bold ${lowStock > 0 ? "text-orange-600" : ""}`}>
                              {lowStock}
                            </p>
                            <p className="text-xs text-muted-foreground">Low Stock</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
                            <p className="text-xs text-muted-foreground">Value</p>
                          </div>
                        </div>
                        
                        <Separator />
                        
                        <div className="space-y-2">
                          {warehouseInventory.slice(0, 5).map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-sm">
                              <div className="flex-1 min-w-0">
                                <p className="truncate">{item.product.name}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={item.quantity <= item.reorderLevel ? "text-orange-600 font-medium" : ""}>
                                  {item.quantity}
                                </span>
                                {item.quantity <= item.reorderLevel && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                                )}
                              </div>
                            </div>
                          ))}
                          {warehouseInventory.length > 5 && (
                            <p className="text-xs text-muted-foreground text-center">
                              +{warehouseInventory.length - 5} more items
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Stock Adjustment</DialogTitle>
              <DialogDescription>
                Adjust stock for {selectedItem?.product.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{selectedItem?.product.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedItem?.product.sku}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">Current: {selectedItem?.quantity}</p>
                  <p className="text-sm text-muted-foreground">{selectedItem?.warehouse.name}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Adjustment Type</Label>
                  <Select 
                    value={adjustmentType} 
                    onValueChange={(value) => setAdjustmentType(value as "in" | "out")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">
                        <div className="flex items-center gap-2">
                          <Plus className="h-4 w-4 text-green-600" />
                          Stock In
                        </div>
                      </SelectItem>
                      <SelectItem value="out">
                        <div className="flex items-center gap-2">
                          <Minus className="h-4 w-4 text-red-600" />
                          Stock Out
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={adjustmentQty}
                    onChange={(e) => setAdjustmentQty(e.target.value)}
                    placeholder="Enter quantity"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                  placeholder="Reason for adjustment..."
                  rows={2}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAdjustmentDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700"
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
