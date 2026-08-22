"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { 
  Plus, Search, MoreHorizontal, Edit, Trash2, Building2, Phone, Mail,
  MapPin, FileText, Package, Eye, DollarSign, Clock, AlertCircle
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
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { 
  AUSTRALIAN_STATES, STATE_NAMES, PAYMENT_TERMS_OPTIONS, formatCurrency, 
  formatABN, type AustralianState 
} from "@/lib/types"

interface Supplier {
  id: string
  name: string
  tradingName?: string
  abn?: string
  contactPerson?: string
  email?: string
  phone?: string
  website?: string
  address?: string
  city?: string
  state?: string
  postcode?: string
  paymentTerms: number
  creditLimit: number
  status: string
  _count?: { purchaseOrders: number }
  products?: { productId: string }[]
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    tradingName: "",
    abn: "",
    contactPerson: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    state: "NSW" as AustralianState,
    postcode: "",
    paymentTerms: "30",
    creditLimit: "0",
    status: "active",
  })

  useEffect(() => {
    fetchSuppliers()
  }, [])

  const fetchSuppliers = async () => {
    try {
      const response = await fetch("/api/suppliers")
      const data = await response.json()
      if (data.success) {
        setSuppliers(data.data)
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredSuppliers = suppliers.filter((supplier) => {
    const matchesSearch = 
      supplier.name.toLowerCase().includes(search.toLowerCase()) ||
      supplier.tradingName?.toLowerCase().includes(search.toLowerCase()) ||
      supplier.abn?.includes(search) ||
      supplier.email?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || supplier.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = selectedSupplier ? `/api/suppliers/${selectedSupplier.id}` : "/api/suppliers"
      const method = selectedSupplier ? "PUT" : "POST"
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          paymentTerms: parseInt(formData.paymentTerms),
          creditLimit: parseFloat(formData.creditLimit) || 0,
        }),
      })

      const data = await response.json()
      if (data.success) {
        fetchSuppliers()
        setIsDialogOpen(false)
        resetForm()
      }
    } catch (error) {
      console.error("Error saving supplier:", error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      tradingName: "",
      abn: "",
      contactPerson: "",
      email: "",
      phone: "",
      website: "",
      address: "",
      city: "",
      state: "NSW",
      postcode: "",
      paymentTerms: "30",
      creditLimit: "0",
      status: "active",
    })
    setSelectedSupplier(null)
  }

  const openEditDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setFormData({
      name: supplier.name,
      tradingName: supplier.tradingName || "",
      abn: supplier.abn || "",
      contactPerson: supplier.contactPerson || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      website: supplier.website || "",
      address: supplier.address || "",
      city: supplier.city || "",
      state: (supplier.state as AustralianState) || "NSW",
      postcode: supplier.postcode || "",
      paymentTerms: supplier.paymentTerms.toString(),
      creditLimit: supplier.creditLimit.toString(),
      status: supplier.status,
    })
    setIsDialogOpen(true)
  }

  const getStatusColor = (status: string) => {
    if (status === "active") return "bg-green-100 text-green-700"
    if (status === "inactive") return "bg-gray-100 text-gray-700"
    if (status === "blocked") return "bg-red-100 text-red-700"
    return "bg-gray-100 text-gray-700"
  }

  const activeSuppliers = suppliers.filter(s => s.status === "active").length

  return (
    <AppShell title="Suppliers" breadcrumbs={[{ label: "Suppliers" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
            <p className="text-muted-foreground">Manage supplier relationships and purchase orders</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true) }} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-2 h-4 w-4" />
              Add Supplier
            </Button>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{selectedSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
                <DialogDescription>
                  {selectedSupplier ? "Update supplier details" : "Create a new supplier record"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="basic">Business Info</TabsTrigger>
                    <TabsTrigger value="contact">Contact</TabsTrigger>
                    <TabsTrigger value="terms">Terms</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="basic" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Company Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Coca-Cola Amatil"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tradingName">Trading Name</Label>
                        <Input
                          id="tradingName"
                          value={formData.tradingName}
                          onChange={(e) => setFormData({ ...formData, tradingName: e.target.value })}
                          placeholder="CCA"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="abn">ABN (Australian Business Number)</Label>
                      <Input
                        id="abn"
                        value={formData.abn}
                        onChange={(e) => setFormData({ ...formData, abn: e.target.value })}
                        placeholder="51 824 753 419"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter ABN with or without spaces (e.g., 51 824 753 419 or 51824753419)
                      </p>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="contact" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contactPerson">Contact Person</Label>
                        <Input
                          id="contactPerson"
                          value={formData.contactPerson}
                          onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                          placeholder="David Miller"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="02 9876 5432"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="orders@supplier.com.au"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          value={formData.website}
                          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                          placeholder="www.supplier.com.au"
                        />
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="Street address"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>City</Label>
                        <Input
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          placeholder="Sydney"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>State</Label>
                        <Select value={formData.state} onValueChange={(value) => setFormData({ ...formData, state: value as AustralianState })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AUSTRALIAN_STATES.map((state) => (
                              <SelectItem key={state} value={state}>{state}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Postcode</Label>
                        <Input
                          value={formData.postcode}
                          onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
                          placeholder="2000"
                        />
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="terms" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Payment Terms</Label>
                        <Select value={formData.paymentTerms} onValueChange={(value) => setFormData({ ...formData, paymentTerms: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_TERMS_OPTIONS.map((term) => (
                              <SelectItem key={term.value} value={term.value.toString()}>
                                {term.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Credit Limit</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                          <Input
                            type="number"
                            value={formData.creditLimit}
                            onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                            placeholder="0"
                            className="pl-8"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
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
                    {selectedSupplier ? "Update" : "Create"} Supplier
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
              <CardDescription>Total Suppliers</CardDescription>
              <CardTitle className="text-2xl">{suppliers.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Suppliers</CardDescription>
              <CardTitle className="text-2xl">{activeSuppliers}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending POs</CardDescription>
              <CardTitle className="text-2xl">12</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outstanding Payables</CardDescription>
              <CardTitle className="text-2xl text-orange-600">$85.2K</CardTitle>
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
                  placeholder="Search suppliers..."
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
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Suppliers Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Payment Terms</TableHead>
                  <TableHead className="text-center">Products</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading suppliers...
                    </TableCell>
                  </TableRow>
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-medium">
                            {supplier.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">{supplier.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {supplier.tradingName && `Trading as: ${supplier.tradingName}`}
                            </div>
                            {supplier.abn && (
                              <div className="text-xs text-muted-foreground font-mono">
                                ABN: {formatABN(supplier.abn)}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 text-sm">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {supplier.phone || "-"}
                          </div>
                          {supplier.email && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {supplier.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {supplier.city && supplier.state ? (
                            <>
                              <p>{supplier.city}</p>
                              <p className="text-xs text-muted-foreground">{STATE_NAMES[supplier.state as AustralianState] || supplier.state}</p>
                            </>
                          ) : (
                            "-"
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          Net {supplier.paymentTerms}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{supplier.products?.length || 0}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={getStatusColor(supplier.status)}>
                          {supplier.status}
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
                              setSelectedSupplier(supplier)
                              setIsDetailOpen(true)
                            }}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(supplier)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <Link href={`/purchase-orders?supplier=${supplier.id}`}>
                              <DropdownMenuItem>
                                <FileText className="mr-2 h-4 w-4" />
                                Create Purchase Order
                              </DropdownMenuItem>
                            </Link>
                            <DropdownMenuItem>
                              <Package className="mr-2 h-4 w-4" />
                              View Products
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

        {/* Supplier Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl">
            {selectedSupplier && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedSupplier.name}
                    <Badge className={getStatusColor(selectedSupplier.status)}>
                      {selectedSupplier.status}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    {selectedSupplier.tradingName && `Trading as: ${selectedSupplier.tradingName}`}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">ABN</Label>
                      <p className="font-medium font-mono">
                        {selectedSupplier.abn ? formatABN(selectedSupplier.abn) : "-"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Payment Terms</Label>
                      <p className="font-medium">Net {selectedSupplier.paymentTerms}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Contact Person</Label>
                      <p className="font-medium">{selectedSupplier.contactPerson || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Phone</Label>
                      <p className="font-medium">{selectedSupplier.phone || "-"}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground text-xs">Email</Label>
                      <p className="font-medium">{selectedSupplier.email || "-"}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground text-xs">Address</Label>
                      <p className="font-medium">
                        {[selectedSupplier.address, selectedSupplier.city, selectedSupplier.state, selectedSupplier.postcode]
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </p>
                    </div>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                    Close
                  </Button>
                  <Link href={`/purchase-orders?supplier=${selectedSupplier.id}`}>
                    <Button className="bg-emerald-600 hover:bg-emerald-700">
                      <FileText className="h-4 w-4 mr-2" />
                      Create Purchase Order
                    </Button>
                  </Link>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
