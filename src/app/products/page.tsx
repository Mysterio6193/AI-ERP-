"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import {
  Plus, Search, MoreHorizontal, Edit, Trash2, Package,
  ArrowUpDown, ChevronDown, AlertTriangle, Eye, DollarSign,
  Warehouse, BarChart3, History, Copy, X, Layers, Download, Upload, FolderTree
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import {
  UNITS_OF_MEASURE, PRODUCT_STATUS_OPTIONS, formatCurrency,
  type ProductStatus, type UnitOfMeasure
} from "@/lib/types"

interface Product {
  id: string
  sku: string
  name: string
  description?: string
  imageUrl?: string | null
  category?: { id: string; name: string }
  brand?: string
  baseUnit: string
  packSize: number
  packUnit?: string
  costPrice: number
  wholesalePrice: number
  retailPrice?: number
  minMargin: number
  gstRate: number
  gstExempt: boolean
  status: string
  barcode?: string
  inventory?: {
    quantity: number
    reserved: number
    reorderLevel: number
    warehouse: { name: string; code: string }
  }[]
  totalStock?: number
  totalReserved?: number
  isLowStock?: boolean
  variants?: Variant[]
}

interface Variant {
  id?: string
  sku: string
  name?: string
  attributes?: string | any
  costPrice?: number
  wholesalePrice?: number
  retailPrice?: number
  status: string
  barcode?: string
}

interface Category {
  id: string
  name: string
}

export default function ProductsPage() {
  const { toast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importCsv, setImportCsv] = useState("")
  const [importSummary, setImportSummary] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    imageUrl: "",
    categoryId: "",
    brand: "",
    baseUnit: "carton" as UnitOfMeasure,
    packSize: "1",
    packUnit: "",
    costPrice: "",
    wholesalePrice: "",
    retailPrice: "",
    minMargin: "20",
    gstRate: "10",
    gstExempt: false,
    status: "active" as ProductStatus,
    barcode: "",
    variants: [] as Variant[],
  })

  useEffect(() => {
    fetchProducts()
    fetchCategories()
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/products")
      const data = await response.json()
      if (data.success) {
        setProducts(data.data)
      }
    } catch (error) {
      console.error("Error fetching products:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories")
      const data = await response.json()
      if (data.success) {
        setCategories(data.data)
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
    }
  }

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.sku.toLowerCase().includes(search.toLowerCase()) ||
      product.barcode?.includes(search)
    const matchesStatus = statusFilter === "all" || product.status === statusFilter
    const matchesCategory = categoryFilter === "all" || product.category?.id === categoryFilter
    return matchesSearch && matchesStatus && matchesCategory
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = selectedProduct ? `/api/products/${selectedProduct.id}` : "/api/products"
      const method = selectedProduct ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          costPrice: parseFloat(formData.costPrice) || 0,
          wholesalePrice: parseFloat(formData.wholesalePrice) || 0,
          retailPrice: parseFloat(formData.retailPrice) || null,
          packSize: parseInt(formData.packSize) || 1,
          minMargin: parseFloat(formData.minMargin) || 20,
          gstRate: formData.gstExempt ? 0 : parseFloat(formData.gstRate),
          categoryId: formData.categoryId || null,
          imageUrl: formData.imageUrl || null,
          variants: formData.variants, // Pass variants
        }),
      })

      const data = await response.json()
      if (data.success) {
        fetchProducts()
        setIsDialogOpen(false)
        resetForm()
        toast({
          title: selectedProduct ? "Product updated" : "Product created",
          description: `${data.data?.name || "Product"} saved successfully.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Could not save product",
          description: data.error || "Failed to save product",
        })
      }
    } catch (error) {
      console.error("Error saving product:", error)
      toast({
        variant: "destructive",
        title: "Could not save product",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return
    try {
      const response = await fetch(`/api/products/${id}`, { method: "DELETE" })
      const data = await response.json()
      if (data.success) {
        fetchProducts()
      }
    } catch (error) {
      console.error("Error deleting product:", error)
    }
  }

  const handleExport = () => {
    window.open("/api/products/export", "_blank")
  }

  const handleImport = async () => {
    const response = await fetch("/api/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: importCsv }),
    })
    const data = await response.json()
    if (data.success) {
      await fetchProducts()
      setImportSummary(`Imported ${data.data.totalRows} rows. Created ${data.data.created}, updated ${data.data.updated}.`)
      setImportCsv("")
    } else {
      setImportSummary(data.error || "Failed to import products")
    }
  }

  const resetForm = () => {
    setFormData({
      sku: "",
      name: "",
      description: "",
      imageUrl: "",
      categoryId: "",
      brand: "",
      baseUnit: "carton",
      packSize: "1",
      packUnit: "",
      costPrice: "",
      wholesalePrice: "",
      retailPrice: "",
      minMargin: "20",
      gstRate: "10",
      gstExempt: false,
      status: "active",
      barcode: "",
      variants: [],
    })
    setSelectedProduct(null)
  }

  const openEditDialog = (product: Product) => {
    setSelectedProduct(product)
    setFormData({
      sku: product.sku,
      name: product.name,
      description: product.description || "",
      imageUrl: product.imageUrl || "",
      categoryId: product.category?.id || "",
      brand: product.brand || "",
      baseUnit: product.baseUnit as UnitOfMeasure,
      packSize: product.packSize.toString(),
      packUnit: product.packUnit || "",
      costPrice: product.costPrice.toString(),
      wholesalePrice: product.wholesalePrice.toString(),
      retailPrice: product.retailPrice?.toString() || "",
      minMargin: product.minMargin.toString(),
      gstRate: product.gstRate.toString(),
      gstExempt: product.gstExempt,
      status: product.status as ProductStatus,
      barcode: product.barcode || "",
      variants: product.variants || [],
    })
    setIsDialogOpen(true)
  }

  const openDetailDialog = (product: Product) => {
    setSelectedProduct(product)
    setIsDetailOpen(true)
  }

  const getStatusBadge = (status: string) => {
    if (status === "active") return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-medium">active</Badge>
    if (status === "inactive") return <Badge variant="secondary" className="font-medium">inactive</Badge>
    if (status === "discontinued") return <Badge variant="destructive" className="font-medium">discontinued</Badge>
    return <Badge variant="outline" className="font-medium">{status}</Badge>
  }

  // Calculate margin
  const calculateMargin = (cost: number, wholesale: number) => {
    if (wholesale === 0) return 0
    return ((wholesale - cost) / wholesale * 100)
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setUploadingImage(true)
      const payload = new FormData()
      payload.append("file", file)

      const response = await fetch("/api/products/upload", {
        method: "POST",
        body: payload,
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        toast({
          variant: "destructive",
          title: "Image upload failed",
          description: data.error || "Failed to upload image",
        })
        return
      }

      setFormData((current) => ({
        ...current,
        imageUrl: data.data?.path || data.data?.url || "",
      }))
      toast({
        title: "Image uploaded",
        description: "Product image uploaded successfully.",
      })
    } catch (error) {
      console.error("Error uploading image:", error)
      toast({
        variant: "destructive",
        title: "Upload error",
        description: error instanceof Error ? error.message : "Failed to upload image",
      })
    } finally {
      setUploadingImage(false)
      if (event.target) {
        event.target.value = ""
      }
    }
  }

  const lowStockCount = products.filter(p => p.isLowStock).length
  const activeCount = products.filter(p => p.status === "active").length

  return (
    <AppShell title="Products" breadcrumbs={[{ label: "Products" }]}>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Products Catalog"
          description="Manage SKUs, unit of measures, variants, margins, and warehouse inventory links."
          actions={
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href="/categories">
                  <FolderTree className="mr-2 h-4 w-4" />
                  Categories
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    Import CSV
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Import products from CSV</DialogTitle>
                    <DialogDescription>Paste CSV with headers: sku, name, description, category, brand, baseUnit, packSize, packUnit, costPrice, wholesalePrice, retailPrice, gstRate, status, barcode.</DialogDescription>
                  </DialogHeader>
                  <Textarea
                    rows={12}
                    value={importCsv}
                    onChange={(event) => setImportCsv(event.target.value)}
                    placeholder="sku,name,description,category,brand,baseUnit,packSize,packUnit,costPrice,wholesalePrice,retailPrice,gstRate,status,barcode"
                    className="font-mono text-xs"
                  />
                  {importSummary ? <p className="text-sm font-medium text-primary">{importSummary}</p> : null}
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setIsImportOpen(false)}>Close</Button>
                    <Button onClick={handleImport}>Run Import</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={resetForm} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{selectedProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
                    <DialogDescription>
                      {selectedProduct ? "Update product details, pricing, and variant configuration" : "Enter product details to add to master catalog"}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit}>
                    <Tabs defaultValue="basic" className="w-full">
                      <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="basic">Basic Info</TabsTrigger>
                        <TabsTrigger value="units">Units</TabsTrigger>
                        <TabsTrigger value="variants">Variants</TabsTrigger>
                        <TabsTrigger value="pricing">Pricing</TabsTrigger>
                        <TabsTrigger value="tax">Tax</TabsTrigger>
                      </TabsList>

                      <TabsContent value="basic" className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="sku">SKU *</Label>
                            <Input
                              id="sku"
                              value={formData.sku}
                              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                              placeholder="COCA-CAN-24"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="name">Product Name *</Label>
                            <Input
                              id="name"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              placeholder="Coca-Cola Can 375ml (Carton 24)"
                              required
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Product description..."
                            rows={2}
                          />
                        </div>
                        <div className="grid grid-cols-[120px,1fr] gap-4 rounded-lg bg-muted/40 p-4 border border-border">
                          <div className="flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-md bg-background border border-border">
                            {formData.imageUrl ? (
                              <img
                                src={formData.imageUrl}
                                alt={formData.name || "Product preview"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <Label htmlFor="imageUrl">Product Image URL</Label>
                              <Input
                                id="imageUrl"
                                value={formData.imageUrl}
                                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                                placeholder="/uploads/products/your-image.jpg or https://..."
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => imageInputRef.current?.click()}
                                disabled={uploadingImage}
                              >
                                <Upload className="mr-2 h-4 w-4" />
                                {uploadingImage ? "Uploading..." : "Upload Photo"}
                              </Button>
                              {formData.imageUrl ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setFormData((current) => ({ ...current, imageUrl: "" }))}
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Remove Image
                                </Button>
                              ) : null}
                            </div>
                            <input
                              ref={imageInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              onChange={handleImageUpload}
                            />
                            <p className="text-xs text-muted-foreground">
                              Upload JPG, PNG, WEBP, or GIF up to 5MB. The image displays across all modules and catalog views.
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                            <Select value={formData.categoryId} onValueChange={(value) => setFormData({ ...formData, categoryId: value })}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="brand">Brand</Label>
                            <Input
                              id="brand"
                              value={formData.brand}
                              onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                              placeholder="Coca-Cola"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="barcode">Barcode</Label>
                            <Input
                              id="barcode"
                              value={formData.barcode}
                              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                              placeholder="9300650123456"
                            />
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="units" className="space-y-4 mt-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="baseUnit">Base Unit *</Label>
                            <Select value={formData.baseUnit} onValueChange={(value) => setFormData({ ...formData, baseUnit: value as UnitOfMeasure })}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {UNITS_OF_MEASURE.map((u) => (
                                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="packSize">Pack Size</Label>
                            <Input
                              id="packSize"
                              type="number"
                              value={formData.packSize}
                              onChange={(e) => setFormData({ ...formData, packSize: e.target.value })}
                              placeholder="24"
                              min="1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="packUnit">Pack Description</Label>
                            <Input
                              id="packUnit"
                              value={formData.packUnit}
                              onChange={(e) => setFormData({ ...formData, packUnit: e.target.value })}
                              placeholder="carton of 24 cans"
                            />
                          </div>
                        </div>
                        <div className="p-3.5 bg-primary/10 rounded-lg border border-primary/20">
                          <p className="text-xs text-foreground">
                            <strong>Pack Size</strong> defines how many inventory baseline items compose each packaging unit.
                            E.g. Pack Size = 24 for a carton containing 24 individual cans.
                          </p>
                        </div>
                      </TabsContent>

                      <TabsContent value="variants" className="space-y-4 mt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold">Product Variants</h3>
                            <p className="text-xs text-muted-foreground">Add SKU child variants for colors, flavors, or sizes.</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newVariant: Variant = {
                                sku: `${formData.sku}-${formData.variants.length + 1}`,
                                name: "",
                                status: "active",
                              }
                              setFormData({ ...formData, variants: [...formData.variants, newVariant] })
                            }}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Variant
                          </Button>
                        </div>

                        <div className="border border-border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>SKU</TableHead>
                                <TableHead>Name/Attributes</TableHead>
                                <TableHead>Price (Opt)</TableHead>
                                <TableHead className="w-12"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {formData.variants.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-xs">
                                    No variants defined. Add variants for different sizes, colors, or flavors.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                formData.variants.map((variant, index) => (
                                  <TableRow key={index}>
                                    <TableCell>
                                      <Input
                                        value={variant.sku}
                                        onChange={(e) => {
                                          const newVariants = [...formData.variants]
                                          newVariants[index].sku = e.target.value
                                          setFormData({ ...formData, variants: newVariants })
                                        }}
                                        className="h-8 text-xs font-mono"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={variant.name || ""}
                                        placeholder="e.g. Red / XL"
                                        onChange={(e) => {
                                          const newVariants = [...formData.variants]
                                          newVariants[index].name = e.target.value
                                          setFormData({ ...formData, variants: newVariants })
                                        }}
                                        className="h-8 text-xs"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1.5 text-[10px] text-muted-foreground">$</span>
                                        <Input
                                          type="number"
                                          value={variant.wholesalePrice || ""}
                                          onChange={(e) => {
                                            const newVariants = [...formData.variants]
                                            newVariants[index].wholesalePrice = parseFloat(e.target.value) || undefined
                                            setFormData({ ...formData, variants: newVariants })
                                          }}
                                          className="h-8 text-xs pl-5"
                                          placeholder="Base"
                                        />
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive/80"
                                        onClick={() => {
                                          const newVariants = formData.variants.filter((_, i) => i !== index)
                                          setFormData({ ...formData, variants: newVariants })
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>

                      <TabsContent value="pricing" className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="costPrice">Cost Price (ex. GST) *</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-muted-foreground text-xs">$</span>
                              <Input
                                id="costPrice"
                                type="number"
                                step="0.01"
                                value={formData.costPrice}
                                onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                                placeholder="22.00"
                                className="pl-8"
                                required
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="wholesalePrice">Wholesale Price (ex. GST) *</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-muted-foreground text-xs">$</span>
                              <Input
                                id="wholesalePrice"
                                type="number"
                                step="0.01"
                                value={formData.wholesalePrice}
                                onChange={(e) => setFormData({ ...formData, wholesalePrice: e.target.value })}
                                placeholder="28.50"
                                className="pl-8"
                                required
                              />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="retailPrice">RRP (inc. GST)</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-muted-foreground text-xs">$</span>
                              <Input
                                id="retailPrice"
                                type="number"
                                step="0.01"
                                value={formData.retailPrice}
                                onChange={(e) => setFormData({ ...formData, retailPrice: e.target.value })}
                                placeholder="35.00"
                                className="pl-8"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="minMargin">Min Margin %</Label>
                            <div className="relative">
                              <Input
                                id="minMargin"
                                type="number"
                                step="0.1"
                                value={formData.minMargin}
                                onChange={(e) => setFormData({ ...formData, minMargin: e.target.value })}
                                placeholder="20"
                              />
                              <span className="absolute right-3 top-2.5 text-muted-foreground text-xs">%</span>
                            </div>
                          </div>
                        </div>

                        {formData.costPrice && formData.wholesalePrice && (
                          <div className="p-3.5 bg-muted/40 rounded-lg border border-border">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Gross Margin:</span>
                              <span className="font-semibold text-foreground">
                                {((parseFloat(formData.wholesalePrice) - parseFloat(formData.costPrice)) / parseFloat(formData.wholesalePrice) * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between text-xs mt-1.5">
                              <span className="text-muted-foreground">Gross Profit / Unit:</span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(parseFloat(formData.wholesalePrice) - parseFloat(formData.costPrice))}
                              </span>
                            </div>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="tax" className="space-y-4 mt-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="gstExempt"
                            checked={formData.gstExempt}
                            onChange={(e) => setFormData({ ...formData, gstExempt: e.target.checked, gstRate: e.target.checked ? "0" : "10" })}
                            className="h-4 w-4 rounded border-border"
                          />
                          <Label htmlFor="gstExempt" className="text-sm font-normal">GST Free (no GST applies to this product)</Label>
                        </div>

                        {!formData.gstExempt && (
                          <div className="space-y-2">
                            <Label htmlFor="gstRate">GST Rate</Label>
                            <Select value={formData.gstRate} onValueChange={(value) => setFormData({ ...formData, gstRate: value })}>
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="10">10% (Standard AU)</SelectItem>
                                <SelectItem value="0">0% (GST Free)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <div className="p-3.5 bg-muted/40 rounded-lg border border-border">
                          <p className="text-xs text-muted-foreground">
                            <strong>Australian GST</strong> standard rate is 10%. Certain basic food categories, agricultural inputs, and medical supplies are GST-free.
                          </p>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <Label htmlFor="status">Product Status</Label>
                          <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as ProductStatus })}>
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PRODUCT_STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TabsContent>
                    </Tabs>

                    <DialogFooter className="mt-6 gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {selectedProduct ? "Update Product" : "Create Product"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Products"
            value={products.length}
            description="Total catalog items"
            icon={Package}
          />
          <KpiCard
            title="Active Products"
            value={activeCount}
            description="Available for ordering"
            icon={BarChart3}
          />
          <KpiCard
            title="Low Stock Items"
            value={lowStockCount}
            description="Below reorder threshold"
            icon={AlertTriangle}
          />
          <KpiCard
            title="Categories"
            value={categories.length}
            description="Catalog taxonomy"
            icon={FolderTree}
          />
        </div>

        {/* Search & Filters */}
        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, SKU, or barcode..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {PRODUCT_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card className="border-border shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-36 font-semibold">SKU</TableHead>
                  <TableHead className="font-semibold">Product</TableHead>
                  <TableHead className="font-semibold">Category</TableHead>
                  <TableHead className="text-right font-semibold">Cost</TableHead>
                  <TableHead className="text-right font-semibold">Wholesale</TableHead>
                  <TableHead className="text-right font-semibold">Margin</TableHead>
                  <TableHead className="text-center font-semibold">Stock</TableHead>
                  <TableHead className="text-center font-semibold">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                      Loading products catalog...
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12">
                      <EmptyState
                        icon={Package}
                        title="No products found"
                        description="Try adjusting your search query or status/category filters."
                        action={
                          <Button size="sm" variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); setCategoryFilter("all") }}>
                            Clear Filters
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => {
                    const margin = product.wholesalePrice > 0
                      ? ((product.wholesalePrice - product.costPrice) / product.wholesalePrice * 100)
                      : 0
                    const isLowMargin = margin < product.minMargin

                    return (
                      <TableRow key={product.id} className="group hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs font-semibold text-foreground">{product.sku}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/60 border border-border">
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Package className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-foreground text-sm truncate">{product.name}</div>
                              <div className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                                {product.packUnit || product.baseUnit}
                                {product.variants && product.variants.length > 0 && (
                                  <Badge variant="outline" className="ml-1 px-1 py-0 h-4 text-[10px] bg-primary/10 text-primary border-primary/20">
                                    <Layers className="h-2.5 w-2.5 mr-0.5" />
                                    {product.variants.length}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{product.category?.name || "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(product.costPrice)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm text-foreground">
                          {formatCurrency(product.wholesalePrice)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <span className={isLowMargin ? "text-destructive font-semibold" : "text-muted-foreground"}>
                            {margin.toFixed(1)}%
                          </span>
                          {isLowMargin && (
                            <AlertTriangle className="inline h-3.5 w-3.5 text-destructive ml-1" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1 text-sm">
                            <span className={product.isLowStock ? "text-destructive font-semibold" : "font-medium text-foreground"}>
                              {product.totalStock || 0}
                            </span>
                            {(product.totalReserved || 0) > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({product.totalReserved} res)
                              </span>
                            )}
                            {product.isLowStock && (
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(product.status)}
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
                              <DropdownMenuItem onClick={() => openDetailDialog(product)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(product)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Product
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(product.id)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Product Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedProduct && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedProduct.name}
                    {getStatusBadge(selectedProduct.status)}
                  </DialogTitle>
                  <DialogDescription className="font-mono text-xs">
                    SKU: {selectedProduct.sku}
                  </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="variants">Variants</TabsTrigger>
                    <TabsTrigger value="stock">Stock by Warehouse</TabsTrigger>
                    <TabsTrigger value="pricing">Pricing</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/30 p-4 border border-border">
                      <div>
                        <Label className="text-muted-foreground text-xs">Category</Label>
                        <p className="font-medium text-sm text-foreground">{selectedProduct.category?.name || "Uncategorized"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Brand</Label>
                        <p className="font-medium text-sm text-foreground">{selectedProduct.brand || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Unit of Measure</Label>
                        <p className="font-medium text-sm text-foreground capitalize">{selectedProduct.packUnit || selectedProduct.baseUnit}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Barcode</Label>
                        <p className="font-medium text-sm font-mono text-foreground">{selectedProduct.barcode || "—"}</p>
                      </div>
                    </div>

                    {selectedProduct.description && (
                      <div className="rounded-lg bg-muted/20 p-4 border border-border">
                        <Label className="text-muted-foreground text-xs">Description</Label>
                        <p className="text-sm text-foreground mt-1">{selectedProduct.description}</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="variants" className="space-y-4 mt-4">
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="font-semibold">SKU</TableHead>
                            <TableHead className="font-semibold">Variant Name</TableHead>
                            <TableHead className="text-right font-semibold">Price</TableHead>
                            <TableHead className="text-center font-semibold">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!selectedProduct.variants || selectedProduct.variants.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-xs">
                                No variants configured for this product.
                              </TableCell>
                            </TableRow>
                          ) : (
                            selectedProduct.variants.map((v) => (
                              <TableRow key={v.sku}>
                                <TableCell className="font-mono text-xs font-semibold text-foreground">{v.sku}</TableCell>
                                <TableCell className="text-sm">{v.name || "—"}</TableCell>
                                <TableCell className="text-right text-sm">
                                  {v.wholesalePrice ? formatCurrency(v.wholesalePrice) : "Default"}
                                </TableCell>
                                <TableCell className="text-center">
                                  {getStatusBadge(v.status)}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="stock" className="space-y-4 mt-4">
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="font-semibold">Warehouse</TableHead>
                            <TableHead className="text-center font-semibold">Available</TableHead>
                            <TableHead className="text-center font-semibold">Reserved</TableHead>
                            <TableHead className="text-center font-semibold">On Order</TableHead>
                            <TableHead className="text-center font-semibold">Reorder Level</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedProduct.inventory?.map((inv) => (
                            <TableRow key={inv.warehouse.code}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm text-foreground">{inv.warehouse.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center text-sm">
                                <span className={inv.quantity <= inv.reorderLevel ? "text-destructive font-semibold" : "text-foreground"}>
                                  {inv.quantity}
                                </span>
                              </TableCell>
                              <TableCell className="text-center text-sm text-muted-foreground">{inv.reserved}</TableCell>
                              <TableCell className="text-center text-sm text-muted-foreground">—</TableCell>
                              <TableCell className="text-center text-sm font-mono">{inv.reorderLevel}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="pricing" className="space-y-4 mt-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Card className="border-border shadow-sm">
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">Cost Price (ex. GST)</Label>
                          <p className="text-2xl font-bold text-foreground">{formatCurrency(selectedProduct.costPrice)}</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border shadow-sm">
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">Wholesale Price (ex. GST)</Label>
                          <p className="text-2xl font-bold text-foreground">{formatCurrency(selectedProduct.wholesalePrice)}</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border shadow-sm">
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">RRP (inc. GST)</Label>
                          <p className="text-2xl font-bold text-foreground">{formatCurrency(selectedProduct.retailPrice || 0)}</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-muted/30 rounded-lg border border-border">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Gross Margin:</span>
                          <span className="font-bold text-foreground">{((selectedProduct.wholesalePrice - selectedProduct.costPrice) / selectedProduct.wholesalePrice * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between text-sm mt-2">
                          <span className="text-muted-foreground">Gross Profit / Unit:</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedProduct.wholesalePrice - selectedProduct.costPrice)}</span>
                        </div>
                      </div>
                      <div className="p-4 bg-muted/30 rounded-lg border border-border">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">GST Treatment:</span>
                          <span className="font-bold text-foreground">{selectedProduct.gstExempt ? "GST Free" : `${selectedProduct.gstRate}%`}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-2">
                          <span className="text-muted-foreground">GST per Unit:</span>
                          <span className="font-bold text-foreground">{formatCurrency(selectedProduct.wholesalePrice * (selectedProduct.gstRate / 100))}</span>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                    Close
                  </Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                    setIsDetailOpen(false)
                    openEditDialog(selectedProduct)
                  }}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Product
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
