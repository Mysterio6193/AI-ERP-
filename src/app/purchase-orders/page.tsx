"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
    Plus, Search, ClipboardList, Eye, Truck, Package,
    Calendar, CheckCircle, Clock, AlertCircle, MoreHorizontal,
    Download, Trash2, Send
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { SendDocumentModal } from "@/components/modals/SendDocumentModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, PURCHASE_ORDER_STATUS } from "@/lib/types"

interface Supplier { id: string; name: string; email?: string; phone?: string }
interface Product { id: string; sku: string; name: string; costPrice: number; wholesalePrice: number }
interface POItem {
    productId: string; productName: string; sku: string
    quantity: number; receivedQty: number; unitCost: number; taxRate: number; total: number
}
interface PurchaseOrder {
    id: string; poNumber: string
    supplier: Supplier; supplierId: string
    orderDate: string; expectedDate: string | null; receivedDate: string | null
    subtotal: number; taxAmount: number; totalAmount: number
    status: string; notes: string | null
    items: POItem[]
}

const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    submitted: "bg-blue-100 text-blue-700",
    confirmed: "bg-indigo-100 text-indigo-700",
    partial: "bg-orange-100 text-orange-700",
    received: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
}

export default function PurchaseOrdersPage() {
    const [orders, setOrders] = useState<PurchaseOrder[]>([])
    const [suppliers, setSuppliers] = useState<Supplier[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const [dialogOpen, setDialogOpen] = useState(false)
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
    const [viewMode, setViewMode] = useState(false)
    const [sendModalOpen, setSendModalOpen] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        supplierId: "", expectedDate: "", notes: "",
        items: [] as POItem[],
    })

    async function fetchPurchaseOrders() {
        const response = await fetch("/api/purchase-orders")
        const data = await response.json()
        if (data.success) {
            setOrders(data.data || [])
        }
    }

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)

            try {
                const [suppRes, prodRes] = await Promise.all([
                    fetch("/api/suppliers"),
                    fetch("/api/products"),
                ])

                if (suppRes.ok) {
                    const data = await suppRes.json()
                    setSuppliers(Array.isArray(data) ? data : data.suppliers || data.data || [])
                }

                if (prodRes.ok) {
                    const data = await prodRes.json()
                    setProducts(Array.isArray(data) ? data : data.products || data.data || [])
                }
                await fetchPurchaseOrders()
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }

        void fetchData()
    }, [])

    function addItem() {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, {
                productId: "", productName: "", sku: "",
                quantity: 1, receivedQty: 0, unitCost: 0, taxRate: 10, total: 0,
            }],
        }))
    }

    function updateItem(index: number, field: string, value: string | number) {
        setFormData(prev => {
            const items = [...prev.items]
            const item = { ...items[index], [field]: value }
            if (field === "productId") {
                const product = products.find(p => p.id === value)
                if (product) {
                    item.productName = product.name
                    item.sku = product.sku
                    item.unitCost = product.costPrice
                }
            }
            item.total = item.quantity * item.unitCost * (1 + item.taxRate / 100)
            items[index] = item
            return { ...prev, items }
        })
    }

    function removeItem(index: number) {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }))
    }

    async function handleSubmit() {
        const supplier = suppliers.find(s => s.id === formData.supplierId)
        if (!supplier || formData.items.length === 0) return

        try {
            const response = await fetch("/api/purchase-orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            })
            const data = await response.json()
            if (!data.success) return

            await fetchPurchaseOrders()
            setDialogOpen(false)
            resetForm()
        } catch (error) {
            console.error(error)
        }
    }

    async function updateStatus(poId: string, newStatus: string) {
        try {
            const response = await fetch(`/api/purchase-orders/${poId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            })
            const data = await response.json()
            if (!data.success) return
            await fetchPurchaseOrders()
        } catch (error) {
            console.error(error)
        }
    }

    function resetForm() {
        setFormData({ supplierId: "", expectedDate: "", notes: "", items: [] })
    }

    const filteredOrders = orders.filter(o => {
        const matchSearch = o.poNumber.toLowerCase().includes(search.toLowerCase()) ||
            o.supplier.name.toLowerCase().includes(search.toLowerCase())
        const matchStatus = statusFilter === "all" || o.status === statusFilter
        return matchSearch && matchStatus
    })

    const stats = {
        total: orders.length,
        draft: orders.filter(o => o.status === "draft").length,
        pending: orders.filter(o => ["submitted", "confirmed"].includes(o.status)).length,
        received: orders.filter(o => o.status === "received").length,
        totalValue: orders.reduce((s, o) => s + o.totalAmount, 0),
    }

    return (
        <AppShell title="Purchase Orders" breadcrumbs={[{ label: "Purchase Orders" }]}>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
                        <p className="text-muted-foreground">Manage supplier orders and goods receiving</p>
                    </div>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={resetForm}>
                                <Plus className="h-4 w-4 mr-2" /> New Purchase Order
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Create Purchase Order</DialogTitle>
                                <DialogDescription>Order products from your suppliers</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Supplier *</Label>
                                        <Select value={formData.supplierId} onValueChange={v => setFormData(p => ({ ...p, supplierId: v }))}>
                                            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                                            <SelectContent>
                                                {suppliers.map(s => (
                                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Expected Delivery Date</Label>
                                        <Input type="date" value={formData.expectedDate}
                                            onChange={e => setFormData(p => ({ ...p, expectedDate: e.target.value }))} />
                                    </div>
                                </div>
                                <Separator />
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <Label className="text-base font-semibold">Order Items</Label>
                                        <Button variant="outline" size="sm" onClick={addItem}>
                                            <Plus className="h-4 w-4 mr-1" /> Add Item
                                        </Button>
                                    </div>
                                    {formData.items.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                                            <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                                            <p>No items added yet</p>
                                        </div>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Product</TableHead>
                                                    <TableHead className="w-24">Qty</TableHead>
                                                    <TableHead className="w-28">Unit Cost</TableHead>
                                                    <TableHead className="w-24">Tax %</TableHead>
                                                    <TableHead className="w-28 text-right">Total</TableHead>
                                                    <TableHead className="w-12"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {formData.items.map((item, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell>
                                                            <Select value={item.productId} onValueChange={v => updateItem(idx, "productId", v)}>
                                                                <SelectTrigger className="w-full"><SelectValue placeholder="Select product" /></SelectTrigger>
                                                                <SelectContent>
                                                                    {products.map(p => (
                                                                        <SelectItem key={p.id} value={p.id}>{p.sku} - {p.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input type="number" min={1} value={item.quantity}
                                                                onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input type="number" step={0.01} value={item.unitCost}
                                                                onChange={e => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input type="number" step={0.5} value={item.taxRate}
                                                                onChange={e => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)} />
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            {formatCurrency(item.total)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label>Notes</Label>
                                    <Textarea placeholder="Internal notes..."
                                        value={formData.notes}
                                        onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} />
                                </div>
                                {formData.items.length > 0 && (
                                    <div className="bg-gray-50 p-4 rounded-lg space-y-1 text-sm">
                                        <div className="flex justify-between">
                                            <span>Subtotal</span>
                                            <span>{formatCurrency(formData.items.reduce((s, i) => s + i.quantity * i.unitCost, 0))}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Tax</span>
                                            <span>{formatCurrency(formData.items.reduce((s, i) => s + i.quantity * i.unitCost * (i.taxRate / 100), 0))}</span>
                                        </div>
                                        <Separator />
                                        <div className="flex justify-between font-bold text-base">
                                            <span>Total</span>
                                            <span>{formatCurrency(formData.items.reduce((s, i) => s + i.total, 0))}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit}
                                    disabled={!formData.supplierId || formData.items.length === 0}>
                                    Create Purchase Order
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-4">
                    {[
                        { label: "Total POs", value: stats.total, icon: ClipboardList, color: "text-blue-600 bg-blue-50" },
                        { label: "Draft", value: stats.draft, icon: Clock, color: "text-gray-600 bg-gray-50" },
                        { label: "Pending", value: stats.pending, icon: AlertCircle, color: "text-orange-600 bg-orange-50" },
                        { label: "Total Value", value: formatCurrency(stats.totalValue), icon: Package, color: "text-emerald-600 bg-emerald-50" },
                    ].map(stat => (
                        <Card key={stat.label}>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                                        <stat.icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                                        <p className="text-xl font-bold">{stat.value}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search POs..." value={search} onChange={e => setSearch(e.target.value)}
                            className="pl-9" />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            {PURCHASE_ORDER_STATUS.map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>PO Number</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Expected</TableHead>
                                    <TableHead>Items</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-12"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                            <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                            <p className="font-medium">No purchase orders yet</p>
                                            <p className="text-sm">Create your first purchase order to get started</p>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOrders.map(po => (
                                    <TableRow key={po.id} className="cursor-pointer hover:bg-gray-50" onClick={() => { setSelectedPO(po); setViewMode(true); }}>
                                        <TableCell className="font-medium">{po.poNumber}</TableCell>
                                        <TableCell>{po.supplier.name}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {new Date(po.orderDate).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : "—"}
                                        </TableCell>
                                        <TableCell>{po.items.length} items</TableCell>
                                        <TableCell className="text-right font-medium">{formatCurrency(po.totalAmount)}</TableCell>
                                        <TableCell>
                                            <Badge className={statusColors[po.status] || "bg-gray-100"}>
                                                {PURCHASE_ORDER_STATUS.find(s => s.value === po.status)?.label || po.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell onClick={e => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => { setSelectedPO(po); setViewMode(true); }}>
                                                        <Eye className="h-4 w-4 mr-2" /> View Details
                                                    </DropdownMenuItem>
                                                    {po.status === "draft" && (
                                                        <DropdownMenuItem onClick={() => updateStatus(po.id, "submitted")}>
                                                            <Truck className="h-4 w-4 mr-2" /> Submit to Supplier
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => {
                                                        setSelectedPO(po)
                                                        setSendModalOpen(true)
                                                    }}>
                                                        <Send className="h-4 w-4 mr-2" /> Send Purchase Order
                                                    </DropdownMenuItem>
                                                    {po.status === "submitted" && (
                                                        <DropdownMenuItem onClick={() => updateStatus(po.id, "confirmed")}>
                                                            <CheckCircle className="h-4 w-4 mr-2" /> Mark Confirmed
                                                        </DropdownMenuItem>
                                                    )}
                                                    {["confirmed", "partial"].includes(po.status) && (
                                                        <DropdownMenuItem onClick={() => updateStatus(po.id, "received")}>
                                                            <Package className="h-4 w-4 mr-2" /> Mark Fully Received
                                                        </DropdownMenuItem>
                                                    )}
                                                    {po.status !== "cancelled" && po.status !== "received" && (
                                                        <DropdownMenuItem onClick={() => updateStatus(po.id, "cancelled")}
                                                            className="text-red-600">
                                                            <Trash2 className="h-4 w-4 mr-2" /> Cancel PO
                                                        </DropdownMenuItem>
                                                    )}
                                                    <Link href="/inventory/movements">
                                                        <DropdownMenuItem>
                                                            <Eye className="h-4 w-4 mr-2" /> View Stock Movements
                                                        </DropdownMenuItem>
                                                    </Link>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* View & Action Dialog */}
            <Dialog open={viewMode} onOpenChange={setViewMode}>
                <DialogContent className="max-w-3xl">
                    {selectedPO && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center justify-between">
                                    <span>Purchase Order {selectedPO.poNumber}</span>
                                    <Badge className={statusColors[selectedPO.status] || "bg-gray-100"}>
                                        {PURCHASE_ORDER_STATUS.find(s => s.value === selectedPO.status)?.label || selectedPO.status}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription>
                                    Ordered from {selectedPO.supplier.name} on {new Date(selectedPO.orderDate).toLocaleDateString()}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3 text-xs">
                                    <div>
                                        <p className="text-muted-foreground">Supplier</p>
                                        <p className="font-medium text-slate-800">{selectedPO.supplier.name}</p>
                                        <p className="text-slate-500">{selectedPO.supplier.email || "No email"} · {selectedPO.supplier.phone || "No phone"}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Expected Arrival</p>
                                        <p className="font-medium text-slate-800">{selectedPO.expectedDate ? new Date(selectedPO.expectedDate).toLocaleDateString() : "Immediate"}</p>
                                    </div>
                                    {selectedPO.notes && (
                                        <div className="col-span-2">
                                            <p className="text-muted-foreground">Notes</p>
                                            <p className="text-slate-700">{selectedPO.notes}</p>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Order Items</p>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Item</TableHead>
                                                <TableHead className="text-center">Ordered</TableHead>
                                                <TableHead className="text-center">Received</TableHead>
                                                <TableHead className="text-right">Unit Cost</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {selectedPO.items.map((item, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>
                                                        <p className="font-medium text-sm">{item.productName}</p>
                                                        <p className="text-xs text-muted-foreground">{item.sku}</p>
                                                    </TableCell>
                                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                                    <TableCell className="text-center">{item.receivedQty}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(item.unitCost)}</TableCell>
                                                    <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="flex justify-end border-t pt-3">
                                    <div className="w-60 space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Subtotal:</span>
                                            <span>{formatCurrency(selectedPO.subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">GST:</span>
                                            <span>{formatCurrency(selectedPO.taxAmount)}</span>
                                        </div>
                                        <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t">
                                            <span>Total Amount:</span>
                                            <span>{formatCurrency(selectedPO.totalAmount)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
                                <Button variant="outline" size="sm" onClick={() => setViewMode(false)}>Close</Button>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSendModalOpen(true)}>
                                        <Send className="h-4 w-4 mr-1.5" /> Send PO
                                    </Button>
                                    {selectedPO.status === "draft" && (
                                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => { updateStatus(selectedPO.id, "submitted"); setViewMode(false); }}>
                                            <Truck className="h-4 w-4 mr-1.5" /> Submit PO
                                        </Button>
                                    )}
                                    {selectedPO.status === "submitted" && (
                                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { updateStatus(selectedPO.id, "confirmed"); setViewMode(false); }}>
                                            <CheckCircle className="h-4 w-4 mr-1.5" /> Confirm Order
                                        </Button>
                                    )}
                                    {["confirmed", "partial"].includes(selectedPO.status) && (
                                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { updateStatus(selectedPO.id, "received"); setViewMode(false); }}>
                                            <Package className="h-4 w-4 mr-1.5" /> Receive & Restock Stock
                                        </Button>
                                    )}
                                </div>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {selectedPO && (
                <SendDocumentModal
                    isOpen={sendModalOpen}
                    onClose={() => setSendModalOpen(false)}
                    documentType="purchase_order"
                    documentId={selectedPO.id}
                    documentNumber={selectedPO.poNumber}
                    recipientEmail={selectedPO.supplier.email || ""}
                    recipientPhone={selectedPO.supplier.phone || ""}
                    supplierId={selectedPO.supplierId}
                />
            )}
        </AppShell>
    )
}
