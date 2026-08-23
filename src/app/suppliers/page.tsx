"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { 
  Plus, Search, MoreHorizontal, Edit, Building2, Phone, Mail,
  MapPin, FileText, Package, Eye, DollarSign, CheckCircle2,
  Users, CreditCard, ShieldCheck
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
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
  const { toast } = useToast()
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
        toast({
          title: selectedSupplier ? "Supplier updated" : "Supplier created",
          description: `${data.data?.name || "Supplier"} saved.`,
        })
      } else {
        // The route used to 404 silently; surface exactly what went wrong.
        toast({
          variant: "destructive",
          title: "Could not save supplier",
          description: data.error || `Request failed (${response.status})`,
        })
      }
    } catch (error) {
      console.error("Error saving supplier:", error)
      toast({
        variant: "destructive",
        title: "Could not save supplier",
        description: error instanceof Error ? error.message : "Network error",
      })
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-medium">Active</Badge>
      case "inactive":
        return <Badge variant="secondary" className="bg-muted text-muted-foreground font-medium">Inactive</Badge>
      case "blocked":
        return <Badge variant="destructive" className="font-medium">Blocked</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const activeSuppliers = suppliers.filter(s => s.status === "active").length
  const totalProductsSupplied = suppliers.reduce((acc, s) => acc + (s.products?.length || 0), 0)
  const avgPaymentTerms = suppliers.length > 0
    ? Math.round(suppliers.reduce((acc, s) => acc + s.paymentTerms, 0) / suppliers.length)
    : 30

  return (
    <AppShell title="Suppliers" breadcrumbs={[{ label: "Suppliers" }]}>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Suppliers & Vendors"
          description="Manage supplier directory, vendor agreements, payment terms, and procurement links."
          actions={
            <Button onClick={() => { resetForm(); setIsDialogOpen(true) }} className="shadow-sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Supplier
            </Button>
          }
        />

        {/* Dialog for Add / Edit */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
              <DialogDescription>
                {selectedSupplier ? "Update supplier vendor details and trade credit settings" : "Create a new supplier record for purchasing and goods receiving"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Business Info</TabsTrigger>
                  <TabsTrigger value="contact">Contact & Address</TabsTrigger>
                  <TabsTrigger value="terms">Terms & Status</TabsTrigger>
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
                        placeholder="CCA Beverages"
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
                      Enter 11-digit ABN with or without spaces (e.g. 51 824 753 419)
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
                    <Label>Street Address</Label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="123 Logistics Way"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>City / Suburb</Label>
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
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                        <Input
                          type="number"
                          value={formData.creditLimit}
                          onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                          placeholder="0"
                          className="pl-7"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger className="w-48">
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
                <Button type="submit">
                  {selectedSupplier ? "Update Supplier" : "Create Supplier"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* KPI Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Suppliers"
            value={suppliers.length}
            description="Registered procurement vendors"
            icon={Building2}
          />
          <KpiCard
            title="Active Vendors"
            value={activeSuppliers}
            description={`${Math.round((activeSuppliers / (suppliers.length || 1)) * 100)}% active trading rate`}
            icon={CheckCircle2}
          />
          <KpiCard
            title="Supplied SKUs"
            value={totalProductsSupplied}
            description="Catalog products mapped to suppliers"
            icon={Package}
          />
          <KpiCard
            title="Avg Payment Terms"
            value={`Net ${avgPaymentTerms}`}
            description="Standard supplier credit days"
            icon={CreditCard}
          />
        </div>

        {/* Filters and Search */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, trading name, ABN, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Suppliers Table */}
        <Card className="shadow-sm">
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
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      Loading suppliers...
                    </TableCell>
                  </TableRow>
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-6">
                      <EmptyState
                        icon={Building2}
                        title="No suppliers found"
                        description={search ? "No suppliers match your search criteria. Try a different search query." : "Get started by adding your first supplier record."}
                        action={
                          !search ? (
                            <Button onClick={() => { resetForm(); setIsDialogOpen(true) }} size="sm">
                              <Plus className="mr-2 h-4 w-4" /> Add Supplier
                            </Button>
                          ) : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="group hover:bg-muted/40 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-xs border border-primary/20">
                            {supplier.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{supplier.name}</div>
                            {supplier.tradingName && (
                              <div className="text-xs text-muted-foreground">
                                Trading as: {supplier.tradingName}
                              </div>
                            )}
                            {supplier.abn && (
                              <div className="text-[11px] text-muted-foreground font-mono">
                                ABN: {formatABN(supplier.abn)}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {supplier.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-foreground">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              {supplier.phone}
                            </div>
                          )}
                          {supplier.email && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" />
                              {supplier.email}
                            </div>
                          )}
                          {!supplier.phone && !supplier.email && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {supplier.city && supplier.state ? (
                            <>
                              <p className="font-medium text-xs">{supplier.city}</p>
                              <p className="text-[11px] text-muted-foreground">{STATE_NAMES[supplier.state as AustralianState] || supplier.state}</p>
                            </>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-medium text-xs">
                          Net {supplier.paymentTerms}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {supplier.products?.length || 0}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(supplier.status)}
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
                  <div className="flex items-center justify-between pr-4">
                    <DialogTitle className="flex items-center gap-2.5 text-lg">
                      <Building2 className="h-5 w-5 text-primary" />
                      {selectedSupplier.name}
                    </DialogTitle>
                    {getStatusBadge(selectedSupplier.status)}
                  </div>
                  <DialogDescription>
                    {selectedSupplier.tradingName ? `Trading as: ${selectedSupplier.tradingName}` : "Supplier Overview & Account Terms"}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-4 rounded-xl border bg-muted/30 p-4 text-sm">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ABN</p>
                      <p className="font-mono font-medium text-foreground mt-0.5">
                        {selectedSupplier.abn ? formatABN(selectedSupplier.abn) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Terms</p>
                      <p className="font-medium text-foreground mt-0.5">Net {selectedSupplier.paymentTerms} Days</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact Person</p>
                      <p className="font-medium text-foreground mt-0.5">{selectedSupplier.contactPerson || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</p>
                      <p className="font-medium text-foreground mt-0.5">{selectedSupplier.phone || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</p>
                      <p className="font-medium text-foreground mt-0.5">{selectedSupplier.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Credit Limit</p>
                      <p className="font-medium text-foreground mt-0.5">{formatCurrency(selectedSupplier.creditLimit || 0)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Address</p>
                      <p className="font-medium text-foreground mt-0.5">
                        {[selectedSupplier.address, selectedSupplier.city, selectedSupplier.state, selectedSupplier.postcode]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </p>
                    </div>
                  </div>
                </div>
                
                <DialogFooter className="gap-2 sm:justify-between">
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                    Close
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setIsDetailOpen(false); openEditDialog(selectedSupplier); }}>
                      <Edit className="h-4 w-4 mr-1.5" /> Edit
                    </Button>
                    <Link href={`/purchase-orders?supplier=${selectedSupplier.id}`}>
                      <Button>
                        <FileText className="h-4 w-4 mr-1.5" /> Create Purchase Order
                      </Button>
                    </Link>
                  </div>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
