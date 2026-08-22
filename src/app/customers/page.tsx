"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Plus, Search, MoreHorizontal, Edit, Trash2, Users, Phone, Mail,
  MapPin, CreditCard, Building2, AlertCircle, Eye, FileText,
  DollarSign, TrendingUp, AlertTriangle, CheckCircle, XCircle
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import {
  AUSTRALIAN_STATES, STATE_NAMES, PAYMENT_TERMS_OPTIONS, CUSTOMER_STATUS_OPTIONS,
  CREDIT_STATUS_OPTIONS, CUSTOMER_TYPES, formatCurrency, formatCurrencyShort,
  formatABN, type AustralianState, type CustomerStatus, type CreditStatus,
  type CustomerType
} from "@/lib/types"

interface CustomerLocation {
  id: string
  label: string
  address: string
  city: string
  state: string
  postcode: string
  isBilling: boolean
  isShipping: boolean
  isDefault: boolean
}

interface Customer {
  id: string
  name: string
  tradingName?: string
  abn?: string
  acn?: string
  contactPerson?: string
  email?: string
  phone: string
  alternatePhone?: string
  website?: string
  creditLimit: number
  paymentTerms: number
  creditStatus: string
  creditRating?: string
  customerType: string
  industry?: string
  status: string
  priceList?: { id: string; name: string }
  locations: CustomerLocation[]
  parentId?: string
  parent?: { id: string; name: string }
  children?: { id: string; name: string }[]
  _count?: { orders: number; invoices: number }
  outstanding?: number
}

interface PriceList {
  id: string
  name: string
  type: string
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [detailTab, setDetailTab] = useState("overview")
  const [isDetailSaving, setIsDetailSaving] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [detailForm, setDetailForm] = useState({
    name: "",
    tradingName: "",
    abn: "",
    acn: "",
    contactPerson: "",
    email: "",
    phone: "",
    alternatePhone: "",
    website: "",
    creditLimit: "0",
    paymentTerms: "30",
    creditStatus: "active" as CreditStatus,
    creditRating: "",
    customerType: "wholesale" as CustomerType,
    industry: "",
    status: "active" as CustomerStatus,
    priceListId: "",
    setPassword: "",
  })
  const [formData, setFormData] = useState({
    name: "",
    tradingName: "",
    abn: "",
    acn: "",
    contactPerson: "",
    email: "",
    phone: "",
    alternatePhone: "",
    website: "",
    creditLimit: "0",
    paymentTerms: "30",
    creditStatus: "active" as CreditStatus,
    creditRating: "",
    customerType: "wholesale" as CustomerType,
    industry: "",
    status: "active" as CustomerStatus,
    priceListId: "",
    locations: [{
      label: "Head Office",
      address: "",
      city: "",
      state: "NSW" as AustralianState,
      postcode: "",
      isBilling: true,
      isShipping: true,
      isDefault: true,
    }],
  })

  useEffect(() => {
    fetchCustomers()
    fetchPriceLists()
  }, [])

  const fetchCustomers = async () => {
    try {
      const response = await fetch("/api/customers")
      const data = await response.json()
      if (data.success) {
        setCustomers(data.data)
      }
    } catch (error) {
      console.error("Error fetching customers:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPriceLists = async () => {
    try {
      const response = await fetch("/api/pricing")
      const data = await response.json()
      if (data.success) {
        setPriceLists(data.data)
      }
    } catch (error) {
      console.error("Error fetching price lists:", error)
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      customer.tradingName?.toLowerCase().includes(search.toLowerCase()) ||
      customer.phone.includes(search) ||
      customer.abn?.includes(search) ||
      customer.email?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || customer.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          creditLimit: parseFloat(formData.creditLimit) || 0,
          paymentTerms: parseInt(formData.paymentTerms) || 30,
          priceListId: formData.priceListId || null,
        }),
      })

      const data = await response.json()
      if (data.success) {
        fetchCustomers()
        setIsDialogOpen(false)
        resetForm()
      } else {
        setError(data.error || "Failed to create customer")
      }
    } catch (err) {
      console.error("Error saving customer:", err)
      setError("An unexpected error occurred while processing your request")
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      tradingName: "",
      abn: "",
      acn: "",
      contactPerson: "",
      email: "",
      phone: "",
      alternatePhone: "",
      website: "",
      creditLimit: "0",
      paymentTerms: "30",
      creditStatus: "active",
      creditRating: "",
      customerType: "wholesale",
      industry: "",
      status: "active",
      priceListId: "",
      locations: [{
        label: "Head Office",
        address: "",
        city: "",
        state: "NSW",
        postcode: "",
        isBilling: true,
        isShipping: true,
        isDefault: true,
      }],
    })
    setSelectedCustomer(null)
    setError(null)
  }

  const getStatusColor = (status: string) => {
    if (status === "active") return "bg-green-100 text-green-700"
    if (status === "inactive") return "bg-gray-100 text-gray-600"
    if (status === "blocked") return "bg-red-100 text-red-700"
    return "bg-gray-100 text-gray-700"
  }

  const getCreditStatusColor = (status: string) => {
    if (status === "active") return "bg-green-100 text-green-700"
    if (status === "on_hold") return "bg-yellow-100 text-yellow-700"
    if (status === "stopped") return "bg-red-100 text-red-700"
    return "bg-gray-100 text-gray-700"
  }

  const getCreditRatingColor = (rating: string) => {
    if (rating === "A") return "text-green-600"
    if (rating === "B") return "text-blue-600"
    if (rating === "C") return "text-yellow-600"
    if (rating === "D") return "text-red-600"
    return "text-gray-600"
  }

  // Calculate credit utilization
  const getCreditUtilization = (customer: Customer) => {
    if (customer.creditLimit === 0) return 0
    return ((customer.outstanding || 0) / customer.creditLimit) * 100
  }

  const totalOutstanding = customers.reduce((sum, c) => sum + (c.outstanding || 0), 0)
  const activeCustomers = customers.filter(c => c.status === "active").length
  const overLimitCustomers = customers.filter(c => (c.outstanding || 0) > c.creditLimit && c.creditLimit > 0).length

  const populateDetailForm = (customer: Customer) => {
    setDetailForm({
      name: customer.name || "",
      tradingName: customer.tradingName || "",
      abn: customer.abn || "",
      acn: customer.acn || "",
      contactPerson: customer.contactPerson || "",
      email: customer.email || "",
      phone: customer.phone || "",
      alternatePhone: customer.alternatePhone || "",
      website: customer.website || "",
      creditLimit: String(customer.creditLimit || 0),
      paymentTerms: String(customer.paymentTerms || 30),
      creditStatus: (customer.creditStatus || "active") as CreditStatus,
      creditRating: customer.creditRating || "",
      customerType: (customer.customerType || "wholesale") as CustomerType,
      industry: customer.industry || "",
      status: (customer.status || "active") as CustomerStatus,
      priceListId: customer.priceList?.id || "",
      setPassword: "",
    })
  }

  const openCustomerDetail = (customer: Customer, tab: string = "overview") => {
    setSelectedCustomer(customer)
    populateDetailForm(customer)
    setDetailTab(tab)
    setDetailError(null)
    setIsDetailOpen(true)
  }

  const handleSaveCustomer = async () => {
    if (!selectedCustomer) return

    try {
      setIsDetailSaving(true)
      setDetailError(null)
      const response = await fetch(`/api/customers/${selectedCustomer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...detailForm,
          creditLimit: parseFloat(detailForm.creditLimit) || 0,
          paymentTerms: parseInt(detailForm.paymentTerms) || 0,
          priceListId: detailForm.priceListId || null,
          setPassword: detailForm.setPassword || undefined,
        }),
      })
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to update customer")
      }

      setSelectedCustomer(data.data)
      populateDetailForm(data.data)
      await fetchCustomers()
    } catch (err) {
      console.error("Error updating customer:", err)
      setDetailError(err instanceof Error ? err.message : "Failed to update customer")
    } finally {
      setIsDetailSaving(false)
    }
  }

  return (
    <AppShell title="Customers" breadcrumbs={[{ label: "Customers" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
            <p className="text-muted-foreground">Manage B2B customer accounts, credit limits, and pricing</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true) }} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
                <DialogDescription>
                  Create a new B2B customer account with credit terms
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                {error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Tabs defaultValue="business" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="business">Business Info</TabsTrigger>
                    <TabsTrigger value="contact">Contact</TabsTrigger>
                    <TabsTrigger value="credit">Credit & Terms</TabsTrigger>
                    <TabsTrigger value="locations">Locations</TabsTrigger>
                  </TabsList>

                  <TabsContent value="business" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Company Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Woolworths Metro"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tradingName">Trading Name</Label>
                        <Input
                          id="tradingName"
                          value={formData.tradingName}
                          onChange={(e) => setFormData({ ...formData, tradingName: e.target.value })}
                          placeholder="Woolworths"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="abn">ABN</Label>
                        <Input
                          id="abn"
                          value={formData.abn}
                          onChange={(e) => setFormData({ ...formData, abn: e.target.value })}
                          placeholder="88 000 014 675"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="acn">ACN (if applicable)</Label>
                        <Input
                          id="acn"
                          value={formData.acn}
                          onChange={(e) => setFormData({ ...formData, acn: e.target.value })}
                          placeholder="000 014 675"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Customer Type</Label>
                        <Select value={formData.customerType} onValueChange={(value) => setFormData({ ...formData, customerType: value as CustomerType })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CUSTOMER_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="industry">Industry</Label>
                        <Input
                          id="industry"
                          value={formData.industry}
                          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                          placeholder="Retail / Hospitality / Manufacturing"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="contact" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contactPerson">Primary Contact</Label>
                        <Input
                          id="contactPerson"
                          value={formData.contactPerson}
                          onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                          placeholder="Michael Brown"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone *</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="02 9876 5432"
                          required
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
                          placeholder="purchasing@company.com.au"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          value={formData.website}
                          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                          placeholder="www.company.com.au"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="credit" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Credit Limit</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                          <Input
                            type="number"
                            value={formData.creditLimit}
                            onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                            placeholder="100000"
                            className="pl-8"
                          />
                        </div>
                      </div>
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
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Credit Status</Label>
                        <Select value={formData.creditStatus} onValueChange={(value) => setFormData({ ...formData, creditStatus: value as CreditStatus })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CREDIT_STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Credit Rating</Label>
                        <Select value={formData.creditRating} onValueChange={(value) => setFormData({ ...formData, creditRating: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">A (Excellent)</SelectItem>
                            <SelectItem value="B">B (Good)</SelectItem>
                            <SelectItem value="C">C (Fair)</SelectItem>
                            <SelectItem value="D">D (Poor)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as CustomerStatus })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CUSTOMER_STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <Label>Price List</Label>
                      <Select
                        value={formData.priceListId || "default"}
                        onValueChange={(value) => setFormData({ ...formData, priceListId: value === "default" ? "" : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Default pricing" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default Pricing</SelectItem>
                          {priceLists.map((pl) => (
                            <SelectItem key={pl.id} value={pl.id}>{pl.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  <TabsContent value="locations" className="space-y-4 mt-4">
                    {formData.locations.map((loc, index) => (
                      <Card key={index}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-sm">{loc.label}</CardTitle>
                              {loc.isDefault && <Badge variant="secondary">Default</Badge>}
                            </div>
                            {formData.locations.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-500"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    locations: formData.locations.filter((_, i) => i !== index),
                                  })
                                }}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex gap-2">
                            <Input
                              value={loc.label}
                              onChange={(e) => {
                                const newLocs = [...formData.locations]
                                newLocs[index].label = e.target.value
                                setFormData({ ...formData, locations: newLocs })
                              }}
                              placeholder="Location label"
                              className="w-40"
                            />
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-1.5 text-sm">
                                <input
                                  type="checkbox"
                                  checked={loc.isBilling}
                                  onChange={(e) => {
                                    const newLocs = [...formData.locations]
                                    newLocs[index].isBilling = e.target.checked
                                    setFormData({ ...formData, locations: newLocs })
                                  }}
                                  className="rounded"
                                />
                                Billing
                              </label>
                              <label className="flex items-center gap-1.5 text-sm">
                                <input
                                  type="checkbox"
                                  checked={loc.isShipping}
                                  onChange={(e) => {
                                    const newLocs = [...formData.locations]
                                    newLocs[index].isShipping = e.target.checked
                                    setFormData({ ...formData, locations: newLocs })
                                  }}
                                  className="rounded"
                                />
                                Shipping
                              </label>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <Input
                                value={loc.address}
                                onChange={(e) => {
                                  const newLocs = [...formData.locations]
                                  newLocs[index].address = e.target.value
                                  setFormData({ ...formData, locations: newLocs })
                                }}
                                placeholder="Street address"
                              />
                            </div>
                            <Input
                              value={loc.city}
                              onChange={(e) => {
                                const newLocs = [...formData.locations]
                                newLocs[index].city = e.target.value
                                setFormData({ ...formData, locations: newLocs })
                              }}
                              placeholder="City"
                            />
                            <Select
                              value={loc.state}
                              onValueChange={(value) => {
                                const newLocs = [...formData.locations]
                                newLocs[index].state = value as AustralianState
                                setFormData({ ...formData, locations: newLocs })
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AUSTRALIAN_STATES.map((state) => (
                                  <SelectItem key={state} value={state}>{state}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={loc.postcode}
                              onChange={(e) => {
                                const newLocs = [...formData.locations]
                                newLocs[index].postcode = e.target.value
                                setFormData({ ...formData, locations: newLocs })
                              }}
                              placeholder="Postcode"
                              className="col-span-2"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          locations: [
                            ...formData.locations,
                            {
                              label: "Branch",
                              address: "",
                              city: "",
                              state: "NSW",
                              postcode: "",
                              isBilling: false,
                              isShipping: true,
                              isDefault: false,
                            },
                          ],
                        })
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Location
                    </Button>
                  </TabsContent>
                </Tabs>

                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                    {isSubmitting ? "Creating..." : "Create Customer"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Customers</CardDescription>
              <CardTitle className="text-2xl">{customers.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Accounts</CardDescription>
              <CardTitle className="text-2xl">{activeCustomers}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Total Outstanding</CardDescription>
              <CardTitle className="text-2xl text-orange-600">
                {formatCurrencyShort(totalOutstanding)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Over Credit Limit</CardDescription>
              <CardTitle className="text-2xl text-red-600">{overLimitCustomers}</CardTitle>
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
                  placeholder="Search by name, ABN, phone, or email..."
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
                  {CUSTOMER_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Customers Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Credit Limit</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Credit Status</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading customers...
                    </TableCell>
                  </TableRow>
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => {
                    const utilization = getCreditUtilization(customer)
                    const isOverLimit = (customer.outstanding || 0) > customer.creditLimit && customer.creditLimit > 0

                    return (
                      <TableRow key={customer.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-medium">
                              {customer.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <Link
                                href={`/crm/accounts/${customer.id}`}
                                className="font-medium underline-offset-2 hover:underline"
                              >
                                {customer.name}
                              </Link>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                {customer.tradingName && <span>{customer.tradingName}</span>}
                                {customer.abn && (
                                  <span className="font-mono">ABN: {formatABN(customer.abn)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-sm">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              {customer.phone}
                            </div>
                            {customer.email && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {customer.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {customer.creditLimit > 0 ? formatCurrency(customer.creditLimit) : "No Limit"}
                          </div>
                          {customer.creditLimit > 0 && (
                            <div className="w-24 mt-1">
                              <Progress
                                value={Math.min(utilization, 100)}
                                className={`h-1.5 ${utilization > 90 ? "[&>div]:bg-red-500" : utilization > 70 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className={`font-medium ${isOverLimit ? "text-red-600" : ""}`}>
                            {formatCurrency(customer.outstanding || 0)}
                          </div>
                          {isOverLimit && (
                            <div className="text-xs text-red-500 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Over limit
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={getCreditStatusColor(customer.creditStatus)}>
                              {customer.creditStatus === "on_hold" ? "On Hold" : customer.creditStatus === "stopped" ? "Stopped" : "Active"}
                            </Badge>
                            {customer.creditRating && (
                              <span className={`text-sm font-bold ${getCreditRatingColor(customer.creditRating)}`}>
                                {customer.creditRating}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            Net {customer.paymentTerms}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={getStatusColor(customer.status)}>
                            {customer.status}
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
                                openCustomerDetail(customer, "overview")
                              }}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Profile
                              </DropdownMenuItem>
                              <Link href={`/orders?customer=${customer.id}`}>
                                <DropdownMenuItem>
                                  <FileText className="mr-2 h-4 w-4" />
                                  View Orders
                                </DropdownMenuItem>
                              </Link>
                              <Link href={`/invoices?customer=${customer.id}`}>
                                <DropdownMenuItem>
                                  <DollarSign className="mr-2 h-4 w-4" />
                                  Account Statement
                                </DropdownMenuItem>
                              </Link>
                              <DropdownMenuItem onClick={() => openCustomerDetail(customer, "controls")}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
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

        {/* Customer Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            {selectedCustomer && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedCustomer.name}
                    <Badge className={getStatusColor(selectedCustomer.status)}>
                      {selectedCustomer.status}
                    </Badge>
                    {selectedCustomer.creditRating && (
                      <span className={`text-lg font-bold ${getCreditRatingColor(selectedCustomer.creditRating)}`}>
                        {selectedCustomer.creditRating}
                      </span>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {selectedCustomer.tradingName && `Trading as: ${selectedCustomer.tradingName}`}
                  </DialogDescription>
                </DialogHeader>

                <Tabs value={detailTab} onValueChange={setDetailTab} className="w-full">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="locations">Locations</TabsTrigger>
                    <TabsTrigger value="credit">Credit</TabsTrigger>
                    <TabsTrigger value="controls">Controls</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground text-xs">ABN</Label>
                        <p className="font-medium font-mono">
                          {selectedCustomer.abn ? formatABN(selectedCustomer.abn) : "-"}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Customer Type</Label>
                        <p className="font-medium capitalize">{selectedCustomer.customerType}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Primary Contact</Label>
                        <p className="font-medium">{selectedCustomer.contactPerson || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Phone</Label>
                        <p className="font-medium">{selectedCustomer.phone}</p>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-muted-foreground text-xs">Email</Label>
                        <p className="font-medium">{selectedCustomer.email || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Price List</Label>
                        <p className="font-medium">{selectedCustomer.priceList?.name || "Default Pricing"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Payment Terms</Label>
                        <p className="font-medium">Net {selectedCustomer.paymentTerms}</p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">Total Orders</Label>
                          <p className="text-2xl font-bold">{selectedCustomer._count?.orders || 0}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">Total Invoices</Label>
                          <p className="text-2xl font-bold">{selectedCustomer._count?.invoices || 0}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">Locations</Label>
                          <p className="text-2xl font-bold">{selectedCustomer.locations.length}</p>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="locations" className="space-y-4 mt-4">
                    {selectedCustomer.locations.map((loc) => (
                      <Card key={loc.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{loc.label}</span>
                            <div className="flex gap-1">
                              {loc.isBilling && <Badge variant="outline" className="text-xs">Billing</Badge>}
                              {loc.isShipping && <Badge variant="outline" className="text-xs">Shipping</Badge>}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {[loc.address, loc.city, STATE_NAMES[loc.state as AustralianState], loc.postcode]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>

                  <TabsContent value="credit" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">Credit Limit</Label>
                          <p className="text-2xl font-bold">
                            {selectedCustomer.creditLimit > 0 ? formatCurrency(selectedCustomer.creditLimit) : "Unlimited"}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <Label className="text-muted-foreground text-xs">Outstanding</Label>
                          <p className="text-2xl font-bold text-orange-600">
                            {formatCurrency(selectedCustomer.outstanding || 0)}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {selectedCustomer.creditLimit > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Credit Utilization</span>
                          <span>{getCreditUtilization(selectedCustomer).toFixed(0)}%</span>
                        </div>
                        <Progress value={Math.min(getCreditUtilization(selectedCustomer), 100)} />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground text-xs">Credit Status</Label>
                        <p>
                          <Badge className={getCreditStatusColor(selectedCustomer.creditStatus)}>
                            {selectedCustomer.creditStatus}
                          </Badge>
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Credit Rating</Label>
                        <p className={`font-bold text-xl ${getCreditRatingColor(selectedCustomer.creditRating || "")}`}>
                          {selectedCustomer.creditRating || "Not Rated"}
                        </p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="controls" className="space-y-4 mt-4">
                    {detailError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{detailError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Business Name</Label>
                        <Input
                          value={detailForm.name}
                          onChange={(e) => setDetailForm({ ...detailForm, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Trading Name</Label>
                        <Input
                          value={detailForm.tradingName}
                          onChange={(e) => setDetailForm({ ...detailForm, tradingName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Primary Contact</Label>
                        <Input
                          value={detailForm.contactPerson}
                          onChange={(e) => setDetailForm({ ...detailForm, contactPerson: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={detailForm.email}
                          onChange={(e) => setDetailForm({ ...detailForm, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input
                          value={detailForm.phone}
                          onChange={(e) => setDetailForm({ ...detailForm, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Website</Label>
                        <Input
                          value={detailForm.website}
                          onChange={(e) => setDetailForm({ ...detailForm, website: e.target.value })}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Credit Limit</Label>
                        <Input
                          type="number"
                          value={detailForm.creditLimit}
                          onChange={(e) => setDetailForm({ ...detailForm, creditLimit: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Payment Terms</Label>
                        <Select
                          value={detailForm.paymentTerms}
                          onValueChange={(value) => setDetailForm({ ...detailForm, paymentTerms: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_TERMS_OPTIONS.map((term) => (
                              <SelectItem key={term.value} value={String(term.value)}>
                                {term.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Customer Status</Label>
                        <Select
                          value={detailForm.status}
                          onValueChange={(value) => setDetailForm({ ...detailForm, status: value as CustomerStatus })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CUSTOMER_STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Credit Status</Label>
                        <Select
                          value={detailForm.creditStatus}
                          onValueChange={(value) => setDetailForm({ ...detailForm, creditStatus: value as CreditStatus })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CREDIT_STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Price List</Label>
                        <Select
                          value={detailForm.priceListId || "default"}
                          onValueChange={(value) =>
                            setDetailForm({ ...detailForm, priceListId: value === "default" ? "" : value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Default Pricing</SelectItem>
                            {priceLists.map((pl) => (
                              <SelectItem key={pl.id} value={pl.id}>{pl.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Reset Password</Label>
                        <Input
                          type="password"
                          value={detailForm.setPassword}
                          onChange={(e) => setDetailForm({ ...detailForm, setPassword: e.target.value })}
                          placeholder="Leave blank to keep current password"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Setting the customer account to <strong>inactive</strong> or <strong>blocked</strong> stops sign-in.
                      Setting the credit status to <strong>on hold</strong> or <strong>stopped</strong> disables ordering while
                      preserving access for account review.
                    </div>
                  </TabsContent>
                </Tabs>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                    Close
                  </Button>
                  <Button variant="outline" onClick={handleSaveCustomer} disabled={isDetailSaving}>
                    {isDetailSaving ? "Saving..." : "Save Customer"}
                  </Button>
                  <Link href={`/orders?customer=${selectedCustomer.id}`}>
                    <Button className="bg-emerald-600 hover:bg-emerald-700">
                      <FileText className="h-4 w-4 mr-2" />
                      New Order
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
