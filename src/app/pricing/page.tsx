"use client"

import { useState, useEffect } from "react"
import { 
  Plus, Search, MoreHorizontal, Edit, Trash2, DollarSign,
  Tag, Percent, Users, Package, Eye, Copy, Settings
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { 
  PRICE_LIST_TYPES, formatCurrency, 
} from "@/lib/types"

interface PriceListItem {
  id: string
  productId: string
  product: { sku: string; name: string; baseUnit: string; wholesalePrice: number }
  price: number
  minQty: number
  maxQty?: number
  discountPercent: number
  discountFlat: number
}

interface PriceList {
  id: string
  name: string
  description?: string
  type: string
  status: string
  isDefault: boolean
  validFrom?: string
  validTo?: string
  items?: PriceListItem[]
  _count?: { customers: number; items: number }
}

interface Product {
  id: string
  sku: string
  name: string
  baseUnit: string
  wholesalePrice: number
  category?: { name: string }
}

export default function PricingPage() {
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedPriceList, setSelectedPriceList] = useState<PriceList | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "wholesale",
    status: "active",
    isDefault: false,
    validFrom: "",
    validTo: "",
  })

  useEffect(() => {
    fetchPriceLists()
    fetchProducts()
  }, [])

  const fetchPriceLists = async () => {
    try {
      const response = await fetch("/api/pricing")
      const data = await response.json()
      if (data.success) {
        setPriceLists(data.data)
      }
    } catch (error) {
      console.error("Error fetching price lists:", error)
    } finally {
      setLoading(false)
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

  const filteredPriceLists = priceLists.filter((pl) => {
    const matchesSearch = pl.name.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === "all" || pl.type === typeFilter
    return matchesSearch && matchesType
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      if (data.success) {
        fetchPriceLists()
        setIsDialogOpen(false)
        resetForm()
      }
    } catch (error) {
      console.error("Error saving price list:", error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      type: "wholesale",
      status: "active",
      isDefault: false,
      validFrom: "",
      validTo: "",
    })
    setSelectedPriceList(null)
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      wholesale: "bg-blue-100 text-blue-700",
      retail: "bg-purple-100 text-purple-700",
      contract: "bg-green-100 text-green-700",
      promotional: "bg-orange-100 text-orange-700",
    }
    return colors[type] || "bg-gray-100 text-gray-700"
  }

  return (
    <AppShell title="Pricing" breadcrumbs={[{ label: "Pricing" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pricing Engine</h1>
            <p className="text-muted-foreground">Manage price lists, contract pricing, and discount rules</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true) }} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-2 h-4 w-4" />
              Create Price List
            </Button>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Price List</DialogTitle>
                <DialogDescription>
                  Create a new pricing structure for customers
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Price List Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Wholesale Standard"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Standard wholesale pricing for retailers"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRICE_LIST_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Valid From</Label>
                      <Input
                        type="date"
                        value={formData.validFrom}
                        onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Valid To</Label>
                      <Input
                        type="date"
                        value={formData.validTo}
                        onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isDefault"
                      checked={formData.isDefault}
                      onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
                    />
                    <Label htmlFor="isDefault">Set as default price list</Label>
                  </div>
                </div>
                
                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                    Create Price List
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Price Lists</CardDescription>
              <CardTitle className="text-2xl">{priceLists.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Lists</CardDescription>
              <CardTitle className="text-2xl">{priceLists.filter(pl => pl.status === "active").length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Contract Pricing</CardDescription>
              <CardTitle className="text-2xl">{priceLists.filter(pl => pl.type === "contract").length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Products Priced</CardDescription>
              <CardTitle className="text-2xl">{products.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="cursor-pointer hover:border-emerald-300 transition-colors" onClick={() => setIsDialogOpen(true)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 bg-emerald-100 rounded-lg">
                <Plus className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium">Create Price List</p>
                <p className="text-sm text-muted-foreground">Set up new pricing structure</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-blue-300 transition-colors">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Percent className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">Discount Rules</p>
                <p className="text-sm text-muted-foreground">Configure volume discounts</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-purple-300 transition-colors">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Settings className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-medium">Approval Thresholds</p>
                <p className="text-sm text-muted-foreground">Set discount limits</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search price lists..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {PRICE_LIST_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Price Lists Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Price List</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Products</TableHead>
                  <TableHead className="text-center">Customers</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading price lists...
                    </TableCell>
                  </TableRow>
                ) : filteredPriceLists.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No price lists found. Create your first price list to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPriceLists.map((pl) => (
                    <TableRow key={pl.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                            <Tag className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {pl.name}
                              {pl.isDefault && (
                                <Badge variant="secondary" className="text-xs">Default</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {pl.description || "No description"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getTypeColor(pl.type)}>
                          {pl.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{pl._count?.items || 0}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{pl._count?.customers || 0}</span>
                      </TableCell>
                      <TableCell>
                        {pl.validFrom && pl.validTo ? (
                          <div className="text-sm">
                            <div>{new Date(pl.validFrom).toLocaleDateString()}</div>
                            <div className="text-xs text-muted-foreground">
                              to {new Date(pl.validTo).toLocaleDateString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Always valid</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={pl.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                          {pl.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => {
                              setSelectedPriceList(pl)
                              setIsDetailOpen(true)
                            }}>
                              <Eye className="mr-2 h-4 w-4" />
                              View & Edit Items
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Price List Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedPriceList && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedPriceList.name}
                    <Badge className={getTypeColor(selectedPriceList.type)}>
                      {selectedPriceList.type}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    {selectedPriceList.description || "Manage pricing for this list"}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Priced Products</h4>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Products
                    </Button>
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Base Price</TableHead>
                        <TableHead className="text-right">List Price</TableHead>
                        <TableHead className="text-center">Min Qty</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPriceList.items?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.product.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(item.product.wholesalePrice)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.price)}
                          </TableCell>
                          <TableCell className="text-center">{item.minQty}</TableCell>
                          <TableCell className="text-right">
                            {item.discountPercent > 0 && (
                              <span className="text-green-600">-{item.discountPercent}%</span>
                            )}
                            {item.discountFlat > 0 && (
                              <span className="text-green-600">-{formatCurrency(item.discountFlat)}</span>
                            )}
                            {!item.discountPercent && !item.discountFlat && "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!selectedPriceList.items || selectedPriceList.items.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No products added yet. Click "Add Products" to start.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                    Close
                  </Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    Save Changes
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
