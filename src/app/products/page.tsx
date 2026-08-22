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
      } else {
        alert("Error: " + (data.error || "Failed to save product"))
      }
    } catch (error) {
      console.error("Error saving product:", error)
      alert("An unexpected error occurred. Please check the console.")
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

  const getStatusColor = (status: string) => {
    const option = PRODUCT_STATUS_OPTIONS.find(o => o.value === status)
    if (status === "active") return "bg-green-100 text-green-700"
    if (status === "inactive") return "bg-gray-100 text-gray-700"
    if (status === "discontinued") return "bg-red-100 text-red-700"
    return "bg-gray-100 text-gray-700"
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
        alert(data.error || "Failed to upload image")
        return
      }

      setFormData((current) => ({
        ...current,
        imageUrl: data.data?.path || data.data?.url || "",
      }))
    } catch (error) {
      console.error("Error uploading image:", error)
      alert("Failed to upload image")
    } finally {
      setUploadingImage(false)
      if (event.target) {
        event.target.value = ""
      }
    }
  }

  return (
    <AppShell title="Products" breadcrumbs={[{ label: "Products" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Products</h1>
            <p className="text-muted-foreground">Manage your product catalog and pricing</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/categories">
                <FolderTree className="mr-2 h-4 w-4" />
                Categories
              </Link>
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  Import CSV
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Import products</DialogTitle>
                  <DialogDescription>Paste CSV with headers like `sku,name,description,category,brand,baseUnit,packSize,packUnit,costPrice,wholesalePrice,retailPrice,gstRate,status,barcode`.</DialogDescription>
                </DialogHeader>
                <Textarea rows={14} value={importCsv} onChange={(event) => setImportCsv(event.target.value)} placeholder="sku,name,description,category,brand,baseUnit,packSize,packUnit,costPrice,wholesalePrice,retailPrice,gstRate,status,barcode" />
                {importSummary ? <p className="text-sm text-muted-foreground">{importSummary}</p> : null}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsImportOpen(false)}>Close</Button>
                  <Button onClick={handleImport}>Run Import</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm} className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{selectedProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
                <DialogDescription>
                  {selectedProduct ? "Update product details" : "Enter product details to add to catalog"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
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
                    <div className="grid grid-cols-[120px,1fr] gap-4 rounded-[1.5rem] bg-[#f5f5f7] p-4">
                      <div className="flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-[1.25rem] bg-white">
                        {formData.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
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
                          <Label htmlFor="imageUrl">Product image</Label>
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
                          Upload JPG, PNG, WEBP, or GIF up to 5MB. The saved image will be used across admin, website, and app product displays.
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
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-700">
                        <strong>Pack Size</strong> indicates how many individual units are in each selling unit.
                        E.g., Pack Size = 24 for a carton of 24 cans.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="variants" className="space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Product Variants</h3>
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

                    <div className="border rounded-lg overflow-hidden">
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
                              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
                                    className="h-8 w-8 text-red-500"
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
                          <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
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
                          <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
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
                          <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
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
                          <span className="absolute right-3 top-2.5 text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>

                    {formData.costPrice && formData.wholesalePrice && (
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span>Gross Margin:</span>
                          <span className="font-medium">
                            {((parseFloat(formData.wholesalePrice) - parseFloat(formData.costPrice)) / parseFloat(formData.wholesalePrice) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span>Gross Profit:</span>
                          <span className="font-medium">
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
                        className="h-4 w-4"
                      />
                      <Label htmlFor="gstExempt">GST Free (no GST applies)</Label>
                    </div>

                    {!formData.gstExempt && (
                      <div className="space-y-2">
                        <Label htmlFor="gstRate">GST Rate</Label>
                        <Select value={formData.gstRate} onValueChange={(value) => setFormData({ ...formData, gstRate: value })}>
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10% (Standard)</SelectItem>
                            <SelectItem value="0">0% (GST Free)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-700">
                        <strong>Australian GST</strong> is 10% for most goods. Some products (fresh food, medical) are GST-free.
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
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

                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                    {selectedProduct ? "Update" : "Create"} Product
                  </Button>
                </DialogFooter>
              </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Products</CardDescription>
              <CardTitle className="text-2xl">{products.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Products</CardDescription>
              <CardTitle className="text-2xl">{products.filter(p => p.status === "active").length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Low Stock Items</CardDescription>
              <CardTitle className="text-2xl text-red-600">
                {products.filter(p => p.isLowStock).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Categories</CardDescription>
              <CardTitle className="text-2xl">{categories.length}</CardTitle>
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
                  placeholder="Search by name, SKU, or barcode..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
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
                <SelectTrigger className="w-48">
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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Wholesale</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Loading products...
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No products found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => {
                    const margin = product.wholesalePrice > 0
                      ? ((product.wholesalePrice - product.costPrice) / product.wholesalePrice * 100)
                      : 0
                    const isLowMargin = margin < product.minMargin

                    return (
                      <TableRow key={product.id} className="group">
                        <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
                              {product.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Package className="h-5 w-5 text-gray-500" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{product.name}</div>
                              <div className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                                {product.packUnit || product.baseUnit}
                                {product.variants && product.variants.length > 0 && (
                                  <Badge variant="outline" className="ml-1 px-1 py-0 h-4 text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                    <Layers className="h-2.5 w-2.5 mr-0.5" />
                                    {product.variants.length}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{product.category?.name || "-"}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(product.costPrice)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(product.wholesalePrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={isLowMargin ? "text-red-600 font-medium" : ""}>
                            {margin.toFixed(1)}%
                          </span>
                          {isLowMargin && (
                            <AlertTriangle className="inline h-3.5 w-3.5 text-red-500 ml-1" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className={product.isLowStock ? "text-red-600 font-medium" : ""}>
                              {product.totalStock || 0}
                            </span>
                            {(product.totalReserved || 0) > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({product.totalReserved} res)
                              </span>
                            )}
                            {product.isLowStock && (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={getStatusColor(product.status)}>
                            {product.status}
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
                              <DropdownMenuItem onClick={() => openDetailDialog(product)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(product)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <History className="mr-2 h-4 w-4" />
                                Stock Movements
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <DollarSign className="mr-2 h-4 w-4" />
                                Pricing History
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(product.id)}>
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
                    <Badge className={getStatusColor(selectedProduct.status)}>
                      {selectedProduct.status}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="font-mono">
                    SKU: {selectedProduct.sku}
                  </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="overview" className="w-full">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="variants">Variants</TabsTrigger>
                    <TabsTrigger value="stock">Stock by Warehouse</TabsTrigger>
                    <TabsTrigger value="pricing">Pricing</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground text-xs">Category</Label>
                        <p className="font-medium">{selectedProduct.category?.name || "Uncategorized"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Brand</Label>
                        <p className="font-medium">{selectedProduct.brand || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Unit</Label>
                        <p className="font-medium capitalize">{selectedProduct.packUnit || selectedProduct.baseUnit}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Barcode</Label>
                        <p className="font-medium font-mono">{selectedProduct.barcode || "-"}</p>
                      </div>
                    </div>

                    {selectedProduct.description && (
                      <div>
                        <Label className="text-muted-foreground text-xs">Description</Label>
                        <p className="text-sm">{selectedProduct.description}</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="variants" className="space-y-4 mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Variant Name</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!selectedProduct.variants || selectedProduct.variants.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                              No variants defined for this product.
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedProduct.variants.map((v) => (
                            <TableRow key={v.sku}>
                              <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                              <TableCell>{v.name || "-"}</TableCell>
                              <TableCell className="text-right">
                                {v.wholesalePrice ? formatCurrency(v.wholesalePrice) : "Default"}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className={getStatusColor(v.status)}>
                                  {v.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="stock" className="space-y-4 mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Warehouse</TableHead>
                          <TableHead className="text-center">Available</TableHead>
                          <TableHead className="text-center">Reserved</TableHead>
                          <TableHead className="text-center">On Order</TableHead>
                          <TableHead className="text-center">Reorder Level</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedProduct.inventory?.map((inv) => (
                          <TableRow key={inv.warehouse.code}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Warehouse className="h-4 w-4 text-muted-foreground" />
                                {inv.warehouse.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={inv.quantity <= inv.reorderLevel ? "text-red-600 font-medium" : ""}>
                                {inv.quantity}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">{inv.reserved}</TableCell>
                            <TableCell className="text-center">-</TableCell>
                            <TableCell className="text-center">{inv.reorderLevel}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="pricing" className="space-y-4 mt-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">Cost Price (ex. GST)</Label>
                          <p className="text-2xl font-bold">{formatCurrency(selectedProduct.costPrice)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">Wholesale Price (ex. GST)</Label>
                          <p className="text-2xl font-bold">{formatCurrency(selectedProduct.wholesalePrice)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">RRP (inc. GST)</Label>
                          <p className="text-2xl font-bold">{formatCurrency(selectedProduct.retailPrice || 0)}</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Gross Margin:</span>
                          <span className="font-bold">{((selectedProduct.wholesalePrice - selectedProduct.costPrice) / selectedProduct.wholesalePrice * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between mt-2">
                          <span className="text-muted-foreground">Gross Profit:</span>
                          <span className="font-bold">{formatCurrency(selectedProduct.wholesalePrice - selectedProduct.costPrice)}</span>
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">GST Rate:</span>
                          <span className="font-bold">{selectedProduct.gstExempt ? "GST Free" : `${selectedProduct.gstRate}%`}</span>
                        </div>
                        <div className="flex justify-between mt-2">
                          <span className="text-muted-foreground">GST per unit:</span>
                          <span className="font-bold">{formatCurrency(selectedProduct.wholesalePrice * (selectedProduct.gstRate / 100))}</span>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                    Close
                  </Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
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
