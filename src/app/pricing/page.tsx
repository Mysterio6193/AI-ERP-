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
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
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
      const response = await fetch(editingId ? `/api/pricing/${editingId}` : "/api/pricing", {
        method: editingId ? "PATCH" : "POST",
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
    setEditingId(null)
    setActionError(null)
  }

  const startEdit = (priceList: PriceList) => {
    setEditingId(priceList.id)
    setActionError(null)
    setFormData({
      name: priceList.name,
      description: priceList.description || "",
      type: priceList.type,
      status: priceList.status,
      isDefault: priceList.isDefault,
      validFrom: priceList.validFrom ? String(priceList.validFrom).slice(0, 10) : "",
      validTo: priceList.validTo ? String(priceList.validTo).slice(0, 10) : "",
    })
    setIsDialogOpen(true)
  }

  const duplicatePriceList = async (priceList: PriceList) => {
    setActionError(null)
    const response = await fetch(`/api/pricing/${priceList.id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then((r) => r.json())

    if (response.success) {
      fetchPriceLists()
    } else {
      setActionError(response.error || "Could not duplicate that price list.")
    }
  }

  const deletePriceList = async (priceList: PriceList) => {
    setActionError(null)
    if (!window.confirm(`Delete "${priceList.name}"? Its price lines go with it.`)) {
      return
    }

    const response = await fetch(`/api/pricing/${priceList.id}`, { method: "DELETE" }).then((r) =>
      r.json()
    )

    if (response.success) {
      fetchPriceLists()
    } else {
      setActionError(response.error || "Could not delete that price list.")
    }
  }

  const getTypeBadge = (type: string) => {
    if (type === "wholesale") return <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 font-medium">wholesale</Badge>
    if (type === "retail") return <Badge className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20 font-medium">retail</Badge>
    if (type === "contract") return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-medium">contract</Badge>
    if (type === "promotional") return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-medium">promotional</Badge>
    return <Badge variant="outline" className="font-medium">{type}</Badge>
  }

  return (
    <AppShell title="Pricing" breadcrumbs={[{ label: "Pricing" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Pricing Engine"
          description="Manage price lists, contract customer tiers, and volume discount rules."
          actions={
            <Button
              onClick={() => { resetForm(); setIsDialogOpen(true) }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Price List
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Price Lists"
            value={priceLists.length}
            description="Active & draft lists"
            icon={Tag}
          />
          <KpiCard
            title="Active Lists"
            value={priceLists.filter(pl => pl.status === "active").length}
            description="Applied in live orders"
            icon={DollarSign}
          />
          <KpiCard
            title="Contract Pricing"
            value={priceLists.filter(pl => pl.type === "contract").length}
            description="Customer specific tiers"
            icon={Users}
          />
          <KpiCard
            title="Products Priced"
            value={products.length}
            description="Catalog SKUs"
            icon={Package}
          />
        </div>

        {/* Filters */}
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search price lists..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-48 text-xs">
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

        {actionError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium">
            {actionError}
          </div>
        ) : null}

        {/* Price Lists Table */}
        <Card className="border-border shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold">Price List</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="text-center font-semibold">Products</TableHead>
                  <TableHead className="text-center font-semibold">Customers</TableHead>
                  <TableHead className="font-semibold">Validity</TableHead>
                  <TableHead className="text-center font-semibold">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      Loading price lists...
                    </TableCell>
                  </TableRow>
                ) : filteredPriceLists.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12">
                      <EmptyState
                        icon={Tag}
                        title="No price lists found"
                        description="Create your first price list to configure wholesale tiers and customer contract pricing."
                        action={
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { resetForm(); setIsDialogOpen(true) }}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Price List
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPriceLists.map((pl) => (
                    <TableRow key={pl.id} className="group hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
                            <Tag className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-foreground flex items-center gap-2">
                              <span className="truncate">{pl.name}</span>
                              {pl.isDefault && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Default</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {pl.description || "No description"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getTypeBadge(pl.type)}
                      </TableCell>
                      <TableCell className="text-center text-sm font-semibold text-foreground">
                        {pl._count?.items || 0}
                      </TableCell>
                      <TableCell className="text-center text-sm font-semibold text-foreground">
                        {pl._count?.customers || 0}
                      </TableCell>
                      <TableCell className="text-sm">
                        {pl.validFrom && pl.validTo ? (
                          <div className="text-xs">
                            <span className="text-foreground">{new Date(pl.validFrom).toLocaleDateString()}</span>
                            <span className="text-muted-foreground"> to {new Date(pl.validTo).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Always valid</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {pl.status === "active" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-medium">active</Badge>
                        ) : (
                          <Badge variant="secondary" className="font-medium">{pl.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
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
                            <DropdownMenuItem onClick={() => startEdit(pl)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void duplicatePriceList(pl)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void deletePriceList(pl)}
                            >
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

        {/* Create / Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Price List" : "Create Price List"}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? "Changes apply to every order priced from this list from now on."
                  : "Create a new pricing structure for customers and accounts"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Price List Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Tier 1 Wholesale Standard"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Standard wholesale pricing for food distributors"
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
                <div className="flex items-center space-x-2 pt-2">
                  <Switch
                    id="isDefault"
                    checked={formData.isDefault}
                    onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
                  />
                  <Label htmlFor="isDefault" className="text-sm font-normal">Set as default price list for new customers</Label>
                </div>
              </div>
              
              <DialogFooter className="mt-6 gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {editingId ? "Save Changes" : "Create Price List"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Price List Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedPriceList && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedPriceList.name}
                    {getTypeBadge(selectedPriceList.type)}
                  </DialogTitle>
                  <DialogDescription>
                    {selectedPriceList.description || "Manage item-specific pricing overrides and volume breaks for this list."}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-2">
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="font-semibold">Product</TableHead>
                          <TableHead className="text-right font-semibold">Base Price</TableHead>
                          <TableHead className="text-right font-semibold">List Price</TableHead>
                          <TableHead className="text-center font-semibold">Min Qty</TableHead>
                          <TableHead className="text-right font-semibold">Discount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPriceList.items?.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm text-foreground">{item.product.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {formatCurrency(item.product.wholesalePrice)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-sm text-foreground">
                              {formatCurrency(item.price)}
                            </TableCell>
                            <TableCell className="text-center text-sm">{item.minQty}</TableCell>
                            <TableCell className="text-right text-sm">
                              {item.discountPercent > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">-{item.discountPercent}%</span>
                              )}
                              {item.discountFlat > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">-{formatCurrency(item.discountFlat)}</span>
                              )}
                              {!item.discountPercent && !item.discountFlat && "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(!selectedPriceList.items || selectedPriceList.items.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">
                              No product lines customized for this list yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                    Close
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
