"use client"

import { useState, useEffect } from "react"
import {
  Plus, Search, MoreHorizontal, Eye, FileText, Truck, CheckCircle,
  Clock, Package, XCircle, ArrowRight, User, AlertCircle, Download, Loader2, Send, Printer
} from "lucide-react"
import dynamic from "next/dynamic"
import { AppShell } from "@/components/layout/app-shell"
import { SendDocumentModal } from "@/components/modals/SendDocumentModal"
import { COMMERCE_CHANNEL_COLORS, COMMERCE_CHANNEL_LABELS, normalizeCommerceChannel } from "@/lib/commerce"
import SalesOrderPDF from "@/components/documents/SalesOrderPDF"

const SalesOrderPdfDownloadLink = dynamic(
  () => import("@/components/documents/SalesOrderPdfDownloadLink"),
  { ssr: false }
) as any
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  SALES_ORDER_STATUS_COLORS, SALES_ORDER_STATUS,
  formatCurrency, formatCurrencyShort, formatDate,
  type SalesOrderStatus
} from "@/lib/types"
import { downloadPdfBatch, printPdfBatch, printPdfDocument } from "@/lib/pdf-actions"

interface OrderItem {
  id: string
  productId: string
  product: { id: string; sku: string; name: string; wholesalePrice: number; gstRate: number; baseUnit: string }
  quantity: number
  unitPrice: number
  discount: number
  taxRate: number
  taxAmount: number
  total: number
}

interface EditableOrderItem {
  id?: string
  productId: string
  product: { id: string; sku: string; name: string; wholesalePrice: number; gstRate: number; baseUnit: string }
  quantity: number
  unitPrice: number
  discount: number
  taxRate: number
  taxAmount: number
  total: number
}

interface Order {
  id: string
  orderNumber: string
  customerId: string
  customer: { id: string; name: string; phone: string; email?: string | null; tradingName?: string | null }
  sourceChannel?: string
  status: SalesOrderStatus
  orderDate: string
  requiredDate?: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  customerNotes?: string
  internalNotes?: string
  items: OrderItem[]
  statusLogs?: { status: string; timestamp: string; notes?: string }[]
  warehouse?: { id: string; name: string }
}

interface Product {
  id: string
  sku: string
  name: string
  wholesalePrice: number
  gstRate: number
  baseUnit: string
  totalStock?: number
}

const STATUS_FLOW: SalesOrderStatus[] = [
  'draft', 'approved', 'picking', 'packed', 'dispatched', 'delivered', 'invoiced'
]

const STATUS_LABELS = SALES_ORDER_STATUS.reduce((acc, s) => {
  acc[s.value] = s.label
  return acc
}, {} as Record<string, string>)

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [company, setCompany] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false)
  const [cart, setCart] = useState<{ productId: string; quantity: number; unitPrice: number; discount: number }[]>([])
  const [formData, setFormData] = useState({
    customerId: "",
    deliveryDate: "",
    notes: "",
  })
  const [editData, setEditData] = useState({
    status: "draft" as SalesOrderStatus,
    requiredDate: "",
    notes: "",
    internalNotes: "",
  })
  const [editItems, setEditItems] = useState<EditableOrderItem[]>([])
  const [newOrderItemProductId, setNewOrderItemProductId] = useState("")
  const [bulkAction, setBulkAction] = useState<"download" | "print" | null>(null)

  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    fetchOrders()
    fetchCustomers()
    fetchProducts()
    fetchCompany()
  }, [])

  const fetchCompany = async () => {
    try {
      const response = await fetch("/api/settings/company")
      const data = await response.json()
      if (data.success) {
        setCompany(data.data)
      }
    } catch (error) {
      console.error("Error fetching company:", error)
    }
  }

  const fetchOrders = async () => {
    try {
      const response = await fetch("/api/orders")
      const data = await response.json()
      if (data.success) {
        setOrders(data.data)
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCustomers = async () => {
    try {
      const response = await fetch("/api/customers")
      const data = await response.json()
      if (data.success) {
        setCustomers(data.data)
      }
    } catch (error) {
      console.error("Error fetching customers:", error)
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

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      order.customer.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || order.status === statusFilter
    const normalizedSource = normalizeCommerceChannel(order.sourceChannel)
    const matchesSource =
      sourceFilter === "all" ||
      (sourceFilter === "customer" && normalizedSource !== "admin") ||
      normalizedSource === sourceFilter
    return matchesSearch && matchesStatus && matchesSource
  })

  useEffect(() => {
    setSelectedOrderIds((current) => current.filter((id) => orders.some((order) => order.id === id)))
  }, [orders])

  const selectedOrders = filteredOrders.filter((order) => selectedOrderIds.includes(order.id))
  const allFilteredSelected = filteredOrders.length > 0 && filteredOrders.every((order) => selectedOrderIds.includes(order.id))

  const toggleOrderSelection = (orderId: string, checked: boolean) => {
    setSelectedOrderIds((current) =>
      checked ? Array.from(new Set([...current, orderId])) : current.filter((id) => id !== orderId)
    )
  }

  const toggleSelectAllOrders = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds((current) => Array.from(new Set([...current, ...filteredOrders.map((order) => order.id)])))
      return
    }

    const filteredIds = new Set(filteredOrders.map((order) => order.id))
    setSelectedOrderIds((current) => current.filter((id) => !filteredIds.has(id)))
  }

  const buildOrderDocument = (order: Order) => <SalesOrderPDF order={order} company={company} />

  const handleBulkDownloadOrders = async () => {
    if (!company || selectedOrders.length === 0) return
    setBulkAction("download")
    try {
      await downloadPdfBatch(
        selectedOrders.map((order) => ({
          document: buildOrderDocument(order),
          fileName: `Order-${order.orderNumber}.pdf`,
        }))
      )
    } finally {
      setBulkAction(null)
    }
  }

  const handleBulkPrintOrders = async () => {
    if (!company || selectedOrders.length === 0) return
    setBulkAction("print")
    try {
      await printPdfBatch(
        selectedOrders.map((order) => ({
          document: buildOrderDocument(order),
          title: `Sales Order ${order.orderNumber}`,
        }))
      )
    } finally {
      setBulkAction(null)
    }
  }

  const handlePrintOrder = async (order: Order) => {
    if (!company) return
    await printPdfDocument(buildOrderDocument(order), `Sales Order ${order.orderNumber}`)
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          items: cart.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
          })),
        }),
      })

      const data = await response.json()
      if (data.success) {
        fetchOrders()
        setIsCreateDialogOpen(false)
        resetForm()
      } else {
        setError(data.error || "Failed to create order")
      }
    } catch (err) {
      console.error("Error creating order:", err)
      setError("An unexpected error occurred while processing your request")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStatusUpdate = async (orderId: string, newStatus: SalesOrderStatus) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      const data = await response.json()
      if (data.success) {
        fetchOrders()
        if (selectedOrder?.id === orderId && data.data) {
          setSelectedOrder(data.data)
          syncEditData(data.data)
        }
      } else {
        setError(data.error || "Failed to update order status")
      }
    } catch (err) {
      console.error("Error updating status:", err)
      setError("An unexpected error occurred")
    }
  }

  const resetForm = () => {
    setFormData({ customerId: "", deliveryDate: "", notes: "" })
    setCart([])
    setError(null)
  }

  const syncEditData = (order: Order) => {
    setEditData({
      status: order.status,
      requiredDate: order.requiredDate ? new Date(order.requiredDate).toISOString().slice(0, 10) : "",
      notes: order.customerNotes || "",
      internalNotes: order.internalNotes || "",
    })
    setEditItems(
      order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        product: item.product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        total: item.total,
      }))
    )
    setNewOrderItemProductId("")
  }

  const openOrderDetails = (order: Order) => {
    setSelectedOrder(order)
    syncEditData(order)
    setIsViewDialogOpen(true)
  }

  const handleSaveOrder = async () => {
    if (!selectedOrder) return
    setIsUpdatingOrder(true)
    setError(null)
    try {
      const response = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editData.status,
          requiredDate: editData.requiredDate || null,
          notes: editData.notes,
          internalNotes: editData.internalNotes,
          items: editItems.map((item) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
          })),
        }),
      })
      const data = await response.json()
      if (data.success) {
        setSelectedOrder(data.data)
        syncEditData(data.data)
        fetchOrders()
      } else {
        setError(data.error || "Failed to save order changes")
      }
    } catch (err) {
      console.error("Error saving order:", err)
      setError("An unexpected error occurred")
    } finally {
      setIsUpdatingOrder(false)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    await handleStatusUpdate(orderId, "cancelled")
  }

  const canEditLineItems = Boolean(
    selectedOrder && ["draft", "pending_approval", "approved"].includes(selectedOrder.status)
  )

  const recalculateEditItem = (item: EditableOrderItem) => {
    const lineSubtotal = item.unitPrice * item.quantity
    const discountAmount = lineSubtotal * (item.discount / 100)
    const taxableSubtotal = lineSubtotal - discountAmount
    const taxAmount = taxableSubtotal * (item.taxRate / 100)
    return {
      ...item,
      taxAmount,
      total: taxableSubtotal + taxAmount,
    }
  }

  const updateEditItem = (
    index: number,
    field: "quantity" | "unitPrice" | "discount",
    value: number
  ) => {
    setEditItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const nextItem = {
          ...item,
          [field]: field === "quantity" ? Math.max(1, Math.round(value) || 1) : Math.max(0, value || 0),
        }
        return recalculateEditItem(nextItem)
      })
    )
  }

  const addProductToEditItems = () => {
    const product = products.find((candidate) => candidate.id === newOrderItemProductId)
    if (!product) return

    setEditItems((current) => {
      const existingIndex = current.findIndex((item) => item.productId === product.id)
      if (existingIndex >= 0) {
        return current.map((item, index) =>
          index === existingIndex ? recalculateEditItem({ ...item, quantity: item.quantity + 1 }) : item
        )
      }

      return [
        ...current,
        recalculateEditItem({
          productId: product.id,
          product,
          quantity: 1,
          unitPrice: product.wholesalePrice,
          discount: 0,
          taxRate: product.gstRate,
          taxAmount: 0,
          total: 0,
        }),
      ]
    })

    setNewOrderItemProductId("")
  }

  const removeEditItem = (index: number) => {
    setEditItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const calculateEditedTotals = () => {
    return editItems.reduce(
      (summary, item) => {
        const lineSubtotal = item.unitPrice * item.quantity
        const discountAmount = lineSubtotal * (item.discount / 100)
        const taxableSubtotal = lineSubtotal - discountAmount
        summary.subtotal += taxableSubtotal
        summary.discount += discountAmount
        summary.tax += item.taxAmount
        summary.total += item.total
        return summary
      },
      { subtotal: 0, discount: 0, tax: 0, total: 0 }
    )
  }

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.productId === product.id)
    if (existing) {
      setCart(cart.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      setCart([...cart, {
        productId: product.id,
        quantity: 1,
        unitPrice: product.wholesalePrice,
        discount: 0,
      }])
    }
  }

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId))
  }

  const updateCartItem = (productId: string, field: string, value: number) => {
    setCart(cart.map(item =>
      item.productId === productId
        ? { ...item, [field]: value }
        : item
    ))
  }

  const calculateItemTotal = (item: { productId: string; quantity: number; unitPrice: number; discount: number }) => {
    const product = products.find(p => p.id === item.productId)
    if (!product) return 0

    let subtotal = item.unitPrice * item.quantity
    const discountAmount = subtotal * (item.discount / 100)
    const taxableAmount = subtotal - discountAmount
    const taxAmount = taxableAmount * (product.gstRate / 100)
    return taxableAmount + taxAmount
  }

  const calculateCartTotal = () => {
    let subtotal = 0
    let totalTax = 0

    cart.forEach(item => {
      const product = products.find(p => p.id === item.productId)
      if (product) {
        const itemSubtotal = item.unitPrice * item.quantity
        const discountAmount = itemSubtotal * (item.discount / 100)
        const taxableAmount = itemSubtotal - discountAmount
        subtotal += taxableAmount
        totalTax += taxableAmount * (product.gstRate / 100)
      }
    })

    return { subtotal, totalTax, total: subtotal + totalTax }
  }

  const getNextStatus = (currentStatus: SalesOrderStatus): SalesOrderStatus | null => {
    const currentIndex = STATUS_FLOW.indexOf(currentStatus)
    if (currentIndex === -1 || currentIndex === STATUS_FLOW.length - 1) return null
    return STATUS_FLOW[currentIndex + 1]
  }

  const getStatusColor = (status: SalesOrderStatus) => {
    return SALES_ORDER_STATUS_COLORS[status] || "bg-gray-100 text-gray-700"
  }

  const stats = {
    total: orders.length,
    draft: orders.filter(o => o.status === "draft").length,
    pending: orders.filter(o => ["approved", "picking", "packed"].includes(o.status)).length,
    delivered: orders.filter(o => o.status === "delivered").length,
    commerce: orders.filter((order) => normalizeCommerceChannel(order.sourceChannel) !== "admin").length,
    salesValue: orders
      .filter(o => o.status !== "draft" && o.status !== "cancelled")
      .reduce((sum, o) => sum + o.totalAmount, 0),
  }

  return (
    <AppShell title="Sales Orders" breadcrumbs={[{ label: "Orders" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sales Orders</h1>
            <p className="text-muted-foreground">Manage orders and fulfillment workflow</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="mr-2 h-4 w-4" />
                New Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Order</DialogTitle>
                <DialogDescription>
                  Create a sales order for a customer
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateOrder}>
                <div className="grid gap-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {/* Customer Selection */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Customer *</Label>
                      <Select
                        value={formData.customerId}
                        onValueChange={(value) => setFormData({ ...formData, customerId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                        <SelectContent>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Delivery Date</Label>
                      <Input
                        type="date"
                        value={formData.deliveryDate}
                        onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Input
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Order notes..."
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Product Selection */}
                  <div className="space-y-3">
                    <Label>Add Products</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {products.slice(0, 9).map((product) => (
                        <Card
                          key={product.id}
                          className="cursor-pointer hover:bg-gray-50 p-3"
                          onClick={() => addToCart(product)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs text-muted-foreground">{product.sku}</p>
                              <p className="text-sm font-medium">{product.name}</p>
                            </div>
                            <Plus className="h-4 w-4 text-emerald-600" />
                          </div>
                          <p className="text-sm font-medium mt-1">{formatCurrency(product.wholesalePrice)}</p>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Cart */}
                  {cart.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <Label>Order Items</Label>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead className="w-24">Qty</TableHead>
                              <TableHead className="w-28">Unit Price</TableHead>
                              <TableHead className="w-24">Disc %</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cart.map((item) => {
                              const product = products.find(p => p.id === item.productId)
                              if (!product) return null
                              return (
                                <TableRow key={item.productId}>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium text-sm">{product.name}</p>
                                      <p className="text-xs text-muted-foreground">{product.sku}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      value={item.quantity}
                                      onChange={(e) => updateCartItem(item.productId, "quantity", parseInt(e.target.value) || 1)}
                                      className="w-20 h-8"
                                      min="1"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={item.unitPrice}
                                      onChange={(e) => updateCartItem(item.productId, "unitPrice", parseFloat(e.target.value) || 0)}
                                      className="w-24 h-8"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      value={item.discount}
                                      onChange={(e) => updateCartItem(item.productId, "discount", parseFloat(e.target.value) || 0)}
                                      className="w-16 h-8"
                                      min="0"
                                      max="100"
                                    />
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(calculateItemTotal(item))}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => removeFromCart(item.productId)}
                                    >
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>

                        {/* Totals */}
                        <div className="flex justify-end">
                          <div className="w-64 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Subtotal:</span>
                              <span>{formatCurrency(calculateCartTotal().subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>GST:</span>
                              <span>{formatCurrency(calculateCartTotal().totalTax)}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between font-bold">
                              <span>Total:</span>
                              <span>{formatCurrency(calculateCartTotal().total)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={!formData.customerId || cart.length === 0}
                  >
                    Create Order
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Orders</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Draft</CardDescription>
              <CardTitle className="text-2xl">{stats.draft}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardHeader className="pb-2">
              <CardDescription>In Progress</CardDescription>
              <CardTitle className="text-2xl text-yellow-700">{stats.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Delivered</CardDescription>
              <CardTitle className="text-2xl text-green-700">{stats.delivered}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sales Value</CardDescription>
              <CardTitle className="text-2xl">{formatCurrencyShort(stats.salesValue)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-cyan-200 bg-cyan-50/50">
            <CardHeader className="pb-2">
              <CardDescription>Commerce Orders</CardDescription>
              <CardTitle className="text-2xl text-cyan-700">{stats.commerce}</CardTitle>
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
                  placeholder="Search orders..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {SALES_ORDER_STATUS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="customer">Customer Channels</SelectItem>
                  <SelectItem value="customer_web">Website</SelectItem>
                  <SelectItem value="customer_app">Mobile App</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {selectedOrders.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">{selectedOrders.length} sales order{selectedOrders.length === 1 ? "" : "s"} selected</p>
                <p className="text-sm text-muted-foreground">Bulk print or download the current order selection.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => setSelectedOrderIds([])}>
                  Clear Selection
                </Button>
                <Button variant="outline" onClick={() => void handleBulkPrintOrders()} disabled={!company || bulkAction !== null}>
                  {bulkAction === "print" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  Print Selected
                </Button>
                <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => void handleBulkDownloadOrders()} disabled={!company || bulkAction !== null}>
                  {bulkAction === "download" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download Selected
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Orders Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allFilteredSelected ? true : selectedOrders.length > 0 ? "indeterminate" : false}
                      onCheckedChange={(checked) => toggleSelectAllOrders(Boolean(checked))}
                      aria-label="Select all sales orders"
                    />
                  </TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading orders...
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id} className="group">
                      <TableCell>
                        <Checkbox
                          checked={selectedOrderIds.includes(order.id)}
                          onCheckedChange={(checked) => toggleOrderSelection(order.id, Boolean(checked))}
                          aria-label={`Select sales order ${order.orderNumber}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-mono font-medium">{order.orderNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {order.items?.length || 0} items
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{order.customer.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            COMMERCE_CHANNEL_COLORS[normalizeCommerceChannel(order.sourceChannel)] ||
                            COMMERCE_CHANNEL_COLORS.admin
                          }
                        >
                          {COMMERCE_CHANNEL_LABELS[normalizeCommerceChannel(order.sourceChannel)]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(order.orderDate)}
                        </div>
                        {order.requiredDate && (
                          <div className="text-xs text-muted-foreground">
                            Required: {formatDate(order.requiredDate)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">{formatCurrency(order.totalAmount)}</div>
                        <div className="text-xs text-muted-foreground">
                          GST: {formatCurrency(order.taxAmount)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={getStatusColor(order.status)}>
                          {STATUS_LABELS[order.status] || order.status}
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
                            <DropdownMenuItem onClick={() => openOrderDetails(order)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View & Edit
                            </DropdownMenuItem>
                            {isMounted && company && (
                              <DropdownMenuItem asChild>
                                <SalesOrderPdfDownloadLink
                                  order={order}
                                  company={company}
                                  fileName={`Order-${order.orderNumber}.pdf`}
                                  className="flex w-full items-center px-2 py-1.5 text-sm cursor-default hover:bg-accent"
                                >
                                  {({ loading }) => (
                                    <>
                                      {loading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <Download className="mr-2 h-4 w-4" />
                                      )}
                                      Download PDF
                                    </>
                                  )}
                                </SalesOrderPdfDownloadLink>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => void handlePrintOrder(order)} disabled={!company}>
                              <Printer className="mr-2 h-4 w-4" />
                              Print
                            </DropdownMenuItem>
                            {getNextStatus(order.status) && (
                              <DropdownMenuItem className="text-emerald-600" onClick={() => handleStatusUpdate(order.id, getNextStatus(order.status)!)}>
                                <ArrowRight className="mr-2 h-4 w-4" />
                                Mark as {STATUS_LABELS[getNextStatus(order.status)!]}
                              </DropdownMenuItem>
                            )}
                            {order.status === "delivered" && (
                              <DropdownMenuItem>
                                <FileText className="mr-2 h-4 w-4" />
                                Generate Invoice
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => {
                              setSelectedOrder(order)
                              setIsSendModalOpen(true)
                            }}>
                              <Send className="mr-2 h-4 w-4" />
                              Send Order
                            </DropdownMenuItem>
                            {order.status !== "cancelled" && (
                              <DropdownMenuItem className="text-red-600" onClick={() => handleCancelOrder(order.id)}>
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel Order
                              </DropdownMenuItem>
                            )}
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

        {/* View Order Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            {selectedOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    Order {selectedOrder.orderNumber}
                    <Badge className={getStatusColor(selectedOrder.status)}>
                      {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                    </Badge>
                    <Badge
                      className={
                        COMMERCE_CHANNEL_COLORS[normalizeCommerceChannel(selectedOrder.sourceChannel)] ||
                        COMMERCE_CHANNEL_COLORS.admin
                      }
                    >
                      {COMMERCE_CHANNEL_LABELS[normalizeCommerceChannel(selectedOrder.sourceChannel)]}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    Customer: {selectedOrder.customer.name}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={editData.status} onValueChange={(value) => setEditData((current) => ({ ...current, status: value as SalesOrderStatus }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SALES_ORDER_STATUS.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Requested delivery</Label>
                      <Input
                        type="date"
                        value={editData.requiredDate}
                        onChange={(e) => setEditData((current) => ({ ...current, requiredDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Customer notes</Label>
                      <Input
                        value={editData.notes}
                        onChange={(e) => setEditData((current) => ({ ...current, notes: e.target.value }))}
                        placeholder="Customer-facing notes"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Internal notes</Label>
                      <Input
                        value={editData.internalNotes}
                        onChange={(e) => setEditData((current) => ({ ...current, internalNotes: e.target.value }))}
                        placeholder="Internal notes for the team"
                      />
                    </div>
                  </div>

                  {canEditLineItems ? (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="flex-1 space-y-2">
                          <Label>Add product</Label>
                          <Select value={newOrderItemProductId} onValueChange={setNewOrderItemProductId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a product to add" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name} ({product.sku})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addProductToEditItems}
                          disabled={!newOrderItemProductId}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Line
                        </Button>
                      </div>

                      <div>
                        <h4 className="font-medium mb-3">Editable Line Items</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead className="w-24">Qty</TableHead>
                              <TableHead className="w-32">Unit Price</TableHead>
                              <TableHead className="w-24">Disc %</TableHead>
                              <TableHead className="text-right">GST</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="w-12"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {editItems.map((item, index) => (
                              <TableRow key={item.id || `${item.productId}-${index}`}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{item.product.name}</p>
                                    <p className="text-xs text-muted-foreground">{item.product.sku}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(event) => updateEditItem(index, "quantity", Number(event.target.value))}
                                    className="h-8"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.unitPrice}
                                    onChange={(event) => updateEditItem(index, "unitPrice", Number(event.target.value))}
                                    className="h-8"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={item.discount}
                                    onChange={(event) => updateEditItem(index, "discount", Number(event.target.value))}
                                    className="h-8"
                                  />
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(item.taxAmount)}</TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeEditItem(index)}
                                    disabled={editItems.length === 1}
                                  >
                                    <XCircle className="h-4 w-4 text-red-500" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex justify-end">
                        <div className="w-72 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Subtotal:</span>
                            <span>{formatCurrency(calculateEditedTotals().subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Discounts:</span>
                            <span>{formatCurrency(calculateEditedTotals().discount)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>GST:</span>
                            <span>{formatCurrency(calculateEditedTotals().tax)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between font-bold">
                            <span>Total:</span>
                            <span>{formatCurrency(calculateEditedTotals().total)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      Line items can be edited while an order is in draft, pending approval, or approved status. Once picking or dispatch starts, the items are locked to keep fulfillment accurate.
                    </div>
                  )}

                  {!canEditLineItems ? (
                    <div>
                      <h4 className="font-medium mb-3">Order Items</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-center">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">GST</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedOrder.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{item.product.name}</p>
                                  <p className="text-xs text-muted-foreground">{item.product.sku}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.taxAmount)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}

                  {!canEditLineItems ? (
                    <div className="flex justify-end">
                      <div className="w-64 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Subtotal:</span>
                          <span>{formatCurrency(selectedOrder.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>GST:</span>
                          <span>{formatCurrency(selectedOrder.taxAmount)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between font-bold">
                          <span>Total:</span>
                          <span>{formatCurrency(selectedOrder.totalAmount)}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                    Close
                  </Button>
                  {selectedOrder.status !== "cancelled" && (
                    <Button variant="destructive" onClick={() => handleCancelOrder(selectedOrder.id)}>
                      Cancel Order
                    </Button>
                  )}
                  {isMounted && company && (
                    <Button variant="outline" onClick={() => void handlePrintOrder(selectedOrder)}>
                      <Printer className="mr-2 h-4 w-4" />
                      Print
                    </Button>
                  )}
                  {isMounted && company && (
                    <SalesOrderPdfDownloadLink
                      order={selectedOrder}
                      company={company}
                      fileName={`Order-${selectedOrder.orderNumber}.pdf`}
                    >
                      {({ loading }) => (
                        <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                          {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          Download PDF
                        </Button>
                      )}
                    </SalesOrderPdfDownloadLink>
                  )}
                  {getNextStatus(selectedOrder.status) && (
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => handleStatusUpdate(selectedOrder.id, getNextStatus(selectedOrder.status)!)}
                    >
                      Mark as {STATUS_LABELS[getNextStatus(selectedOrder.status)!]}
                    </Button>
                  )}
                  <Button
                    className="bg-slate-900 hover:bg-slate-800"
                    onClick={handleSaveOrder}
                    disabled={isUpdatingOrder || (canEditLineItems && editItems.length === 0)}
                  >
                    {isUpdatingOrder ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {selectedOrder && (
          <SendDocumentModal
            isOpen={isSendModalOpen}
            onClose={() => setIsSendModalOpen(false)}
            documentType="order"
            documentId={selectedOrder.id}
            documentNumber={selectedOrder.orderNumber}
            recipientEmail={selectedOrder.customer.email || ""}
            recipientPhone={selectedOrder.customer.phone || ""}
          />
        )}
      </div>
    </AppShell>
  )
}
