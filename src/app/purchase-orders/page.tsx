"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
    Plus, Search, ClipboardList, Eye, Truck, Package,
    Calendar, CheckCircle, Clock, AlertCircle, MoreHorizontal,
    Download, Trash2, Send, CheckCircle2, DollarSign
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
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
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
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
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

const statusBadgeConfig: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
    submitted: { label: "Submitted", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
    confirmed: { label: "Confirmed", className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20" },
    partial: { label: "Partial", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
    received: { label: "Received", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
    cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive border-destructive/20" },
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
                {/* Page Header */}
                <PageHeader
                    title="Purchase Orders"
                    description="Create supplier procurement orders, track shipment arrival dates, and receive inventory to warehouses."
                    actions={
                        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="shadow-sm">
                            <Plus className="h-4 w-4 mr-2" /> New Purchase Order
                        </Button>
                    }
                />

                {/* Dialog for Create Purchase Order */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Create Purchase Order</DialogTitle>
                            <DialogDescription>Order products and replenishment stock from registered suppliers</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="grid gap-4 sm:grid-cols-2">
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
                                    <Label className="text-sm font-semibold">Order Items</Label>
                                    <Button variant="outline" size="sm" onClick={addItem}>
                                        <Plus className="h-4 w-4 mr-1" /> Add Item
                                    </Button>
                                </div>
                                {formData.items.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground border rounded-xl border-dashed bg-muted/20">
                                        <Package className="h-8 w-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                                        <p className="text-sm font-medium">No items added yet</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">Click &quot;Add Item&quot; to include products in this purchase order.</p>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border overflow-hidden">
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
                                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Notes / Delivery Instructions</Label>
                                <Textarea placeholder="Internal notes or instructions for receiving dock..."
                                    value={formData.notes}
                                    onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} />
                            </div>
                            {formData.items.length > 0 && (
                                <div className="bg-muted/30 border rounded-xl p-4 space-y-1.5 text-sm">
                                    <div className="flex justify-between text-muted-foreground text-xs">
                                        <span>Subtotal</span>
                                        <span>{formatCurrency(formData.items.reduce((s, i) => s + i.quantity * i.unitCost, 0))}</span>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground text-xs">
                                        <span>Tax (GST)</span>
                                        <span>{formatCurrency(formData.items.reduce((s, i) => s + i.quantity * i.unitCost * (i.taxRate / 100), 0))}</span>
                                    </div>
                                    <Separator className="my-1" />
                                    <div className="flex justify-between font-bold text-base text-foreground">
                                        <span>Total</span>
                                        <span>{formatCurrency(formData.items.reduce((s, i) => s + i.total, 0))}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSubmit}
                                disabled={!formData.supplierId || formData.items.length === 0}>
                                Create Purchase Order
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* KPI Stats */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                        title="Total POs"
                        value={stats.total}
                        description="All-time supplier orders"
                        icon={ClipboardList}
                    />
                    <KpiCard
                        title="Draft Orders"
                        value={stats.draft}
                        description="Awaiting review or dispatch"
                        icon={Clock}
                    />
                    <KpiCard
                        title="In-Flight Orders"
                        value={stats.pending}
                        description="Submitted or confirmed with vendor"
                        icon={Truck}
                    />
                    <KpiCard
                        title="Total PO Value"
                        value={formatCurrency(stats.totalValue)}
                        description="Cumulative spend commitments"
                        icon={DollarSign}
                    />
                </div>

                {/* Filters */}
                <Card className="shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search PO # or supplier..." value={search} onChange={e => setSearch(e.target.value)}
                                    className="pl-9" />
                            </div>
                            <div className="flex items-center gap-2">
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Statuses</SelectItem>
                                        {PURCHASE_ORDER_STATUS.map(s => (
                                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card className="shadow-sm">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>PO Number</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Order Date</TableHead>
                                    <TableHead>Expected Date</TableHead>
                                    <TableHead>Items</TableHead>
                                    <TableHead className="text-right">Total Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-12"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                            Loading purchase orders...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="p-6">
                                            <EmptyState
                                                icon={ClipboardList}
                                                title="No purchase orders found"
                                                description={search ? "No purchase orders match your search criteria." : "Create your first purchase order to order inventory from suppliers."}
                                                action={
                                                    !search ? (
                                                        <Button onClick={() => { resetForm(); setDialogOpen(true); }} size="sm">
                                                            <Plus className="h-4 w-4 mr-2" /> New Purchase Order
                                                        </Button>
                                                    ) : undefined
                                                }
                                            />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOrders.map(po => {
                                    const badge = statusBadgeConfig[po.status] || { label: po.status, className: "" }
                                    return (
                                        <TableRow key={po.id} className="cursor-pointer hover:bg-muted/40 transition-colors group" onClick={() => { setSelectedPO(po); setViewMode(true); }}>
                                            <TableCell className="font-mono font-semibold text-foreground">{po.poNumber}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{po.supplier.name}</div>
                                                {po.supplier.email && <div className="text-xs text-muted-foreground">{po.supplier.email}</div>}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(po.orderDate).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="font-normal text-xs">
                                                    {po.items.length} {po.items.length === 1 ? "item" : "items"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-foreground">{formatCurrency(po.totalAmount)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`font-medium text-xs ${badge.className}`}>
                                                    {badge.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell onClick={e => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
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
                                                            <Send className="h-4 w-4 mr-2" /> Send PO via Email/SMS
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
                                                                className="text-destructive">
                                                                <Trash2 className="h-4 w-4 mr-2" /> Cancel PO
                                                            </DropdownMenuItem>
                                                        )}
                                                        <Link href="/inventory/movements">
                                                            <DropdownMenuItem>
                                                                <Eye className="h-4 w-4 mr-2" /> Stock Movements
                                                            </DropdownMenuItem>
                                                        </Link>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
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
                                <div className="flex items-center justify-between pr-4">
                                    <DialogTitle className="flex items-center gap-2.5 text-lg">
                                        <ClipboardList className="h-5 w-5 text-primary" />
                                        <span>Purchase Order {selectedPO.poNumber}</span>
                                    </DialogTitle>
                                    <Badge variant="outline" className={`font-medium text-xs ${statusBadgeConfig[selectedPO.status]?.className || ""}`}>
                                        {statusBadgeConfig[selectedPO.status]?.label || selectedPO.status}
                                    </Badge>
                                </div>
                                <DialogDescription>
                                    Ordered from {selectedPO.supplier.name} on {new Date(selectedPO.orderDate).toLocaleDateString()}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-2">
                                <div className="grid grid-cols-2 gap-4 rounded-xl border bg-muted/30 p-4 text-xs">
                                    <div>
                                        <p className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">Supplier</p>
                                        <p className="font-medium text-foreground text-sm mt-0.5">{selectedPO.supplier.name}</p>
                                        <p className="text-muted-foreground mt-0.5">{selectedPO.supplier.email || "No email"} · {selectedPO.supplier.phone || "No phone"}</p>
                                    </div>
                                    <div>
                                        <p className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">Expected Arrival</p>
                                        <p className="font-medium text-foreground text-sm mt-0.5">{selectedPO.expectedDate ? new Date(selectedPO.expectedDate).toLocaleDateString() : "Immediate / Not Specified"}</p>
                                    </div>
                                    {selectedPO.notes && (
                                        <div className="col-span-2 border-t pt-2 mt-1">
                                            <p className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">Internal Notes</p>
                                            <p className="text-foreground mt-0.5">{selectedPO.notes}</p>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Order Items</p>
                                    <div className="rounded-lg border overflow-hidden">
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
                                                            <p className="font-medium text-sm text-foreground">{item.productName}</p>
                                                            <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                                                        </TableCell>
                                                        <TableCell className="text-center font-medium">{item.quantity}</TableCell>
                                                        <TableCell className="text-center">
                                                            <span className={item.receivedQty >= item.quantity ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-muted-foreground"}>
                                                                {item.receivedQty}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right">{formatCurrency(item.unitCost)}</TableCell>
                                                        <TableCell className="text-right font-semibold text-foreground">{formatCurrency(item.total)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                <div className="flex justify-end border-t pt-3">
                                    <div className="w-64 space-y-1.5 text-xs">
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>Subtotal:</span>
                                            <span>{formatCurrency(selectedPO.subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>Tax (GST):</span>
                                            <span>{formatCurrency(selectedPO.taxAmount)}</span>
                                        </div>
                                        <div className="flex justify-between font-bold text-sm text-foreground pt-1.5 border-t">
                                            <span>Total Amount:</span>
                                            <span>{formatCurrency(selectedPO.totalAmount)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
                                <Button variant="outline" size="sm" onClick={() => setViewMode(false)}>Close</Button>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSendModalOpen(true)}>
                                        <Send className="h-4 w-4 mr-1.5" /> Send PO
                                    </Button>
                                    {selectedPO.status === "draft" && (
                                        <Button size="sm" onClick={() => { updateStatus(selectedPO.id, "submitted"); setViewMode(false); }}>
                                            <Truck className="h-4 w-4 mr-1.5" /> Submit to Supplier
                                        </Button>
                                    )}
                                    {selectedPO.status === "submitted" && (
                                        <Button size="sm" onClick={() => { updateStatus(selectedPO.id, "confirmed"); setViewMode(false); }}>
                                            <CheckCircle className="h-4 w-4 mr-1.5" /> Confirm Order
                                        </Button>
                                    )}
                                    {["confirmed", "partial"].includes(selectedPO.status) && (
                                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { updateStatus(selectedPO.id, "received"); setViewMode(false); }}>
                                            <Package className="h-4 w-4 mr-1.5" /> Receive & Restock
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
