"use client"

import { useState, useEffect } from "react"
import {
    Plus, Search, RotateCcw, Eye, FileText, CheckCircle,
    Clock, Package, XCircle, User, AlertCircle, RefreshCw,
    ArrowDownLeft, CornerDownLeft, DollarSign, AlertTriangle
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, formatDate } from "@/lib/types"

interface ReturnItem {
    id: string
    productId: string
    product: { sku: string; name: string }
    variantId?: string
    variant?: { name: string }
    quantity: number
    condition: string
    refundAmount: number
}

interface Return {
    id: string
    returnNumber: string
    customerId: string
    customer: { id: string; name: string; phone: string }
    orderId?: string
    order?: { orderNumber: string }
    status: "pending" | "approved" | "received" | "completed" | "rejected"
    reason: string
    notes?: string
    totalAmount: number
    items: ReturnItem[]
    createdAt: string
}

const statusConfig: Record<string, { label: string; badgeClass: string }> = {
    pending: { label: "Pending Review", badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
    approved: { label: "Approved (Await Goods)", badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
    received: { label: "Goods Received", badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20" },
    completed: { label: "Restocked & Credited", badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
    rejected: { label: "Rejected", badgeClass: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" },
}

export default function ReturnsPage() {
    const [returns, setReturns] = useState<Return[]>([])
    const [customers, setCustomers] = useState<any[]>([])
    const [orders, setOrders] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
    const [selectedReturn, setSelectedReturn] = useState<Return | null>(null)

    // New Return Form State
    const [formData, setFormData] = useState({
        customerId: "",
        orderId: "",
        reason: "",
        notes: "",
    })
    const [returnItems, setReturnItems] = useState<any[]>([])

    useEffect(() => {
        fetchReturns()
        fetchCustomers()
        fetchProducts()
    }, [])

    const fetchReturns = async () => {
        try {
            const resp = await fetch("/api/returns")
            const data = await resp.json()
            if (data.success) setReturns(data.data)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const fetchCustomers = async () => {
        try {
            const resp = await fetch("/api/customers")
            const data = await resp.json()
            if (data.success) setCustomers(data.data)
        } catch (e) { console.error(e) }
    }

    const fetchOrders = async (customerId: string) => {
        try {
            const resp = await fetch(`/api/orders?customerId=${customerId}`)
            const data = await resp.json()
            if (data.success) setOrders(data.data)
        } catch (e) { console.error(e) }
    }

    const fetchProducts = async () => {
        try {
            const resp = await fetch("/api/products")
            const data = await resp.json()
            if (data.success) setProducts(data.data)
        } catch (e) { console.error(e) }
    }

    const handleCustomerChange = (val: string) => {
        setFormData({ ...formData, customerId: val, orderId: "" })
        fetchOrders(val)
    }

    const addReturnItem = (product: any) => {
        setReturnItems([...returnItems, {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            quantity: 1,
            condition: "saleable",
            refundAmount: product.wholesalePrice || 0
        }])
    }

    const updateItem = (index: number, field: string, val: any) => {
        const newItems = [...returnItems]
        newItems[index][field] = val
        setReturnItems(newItems)
    }

    const removeItem = (index: number) => {
        setReturnItems(returnItems.filter((_, i) => i !== index))
    }

    const handleCreateReturn = async () => {
        try {
            const resp = await fetch("/api/returns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...formData, items: returnItems })
            })
            const data = await resp.json()
            if (data.success) {
                setIsCreateDialogOpen(false)
                fetchReturns()
                setReturnItems([])
                setFormData({ customerId: "", orderId: "", reason: "", notes: "" })
            }
        } catch (e) { console.error(e) }
    }

    const filteredReturns = returns.filter(r =>
        r.returnNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.order?.orderNumber && r.order.orderNumber.toLowerCase().includes(search.toLowerCase()))
    )

    const handleStatusUpdate = async (returnId: string, newStatus: string) => {
        try {
            const resp = await fetch(`/api/returns/${returnId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus })
            })
            const data = await resp.json()
            if (data.success) {
                fetchReturns()
                if (selectedReturn?.id === returnId) {
                    setSelectedReturn(prev => prev ? { ...prev, status: newStatus as any } : null)
                }
            } else {
                alert(data.error || "Failed to update return status")
            }
        } catch (e) {
            console.error(e)
        }
    }

    const totalRefunded = returns
        .filter(r => r.status === "completed")
        .reduce((sum, r) => sum + (r.totalAmount || 0), 0)

    return (
        <AppShell title="Returns & RMA" breadcrumbs={[{ label: "Logistics" }, { label: "Returns (RMA)" }]}>
            <div className="space-y-6">
                <PageHeader
                    title="Returns & RMA Processing"
                    description="Manage customer Return Merchandise Authorisations, inventory restocking, warehouse inspections, and credit note issuance."
                    actions={
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => void fetchReturns()} disabled={loading}>
                                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                                Refresh
                            </Button>
                            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Process New Return
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <RotateCcw className="h-5 w-5 text-primary" />
                                            Process New Customer Return (RMA)
                                        </DialogTitle>
                                        <DialogDescription>
                                            Record returned items, inspect saleable condition, and calculate credit refunds.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-5 py-2">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-semibold">Customer Account *</Label>
                                                <Select onValueChange={handleCustomerChange}>
                                                    <SelectTrigger className="text-xs"><SelectValue placeholder="Select Customer" /></SelectTrigger>
                                                    <SelectContent>
                                                        {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-semibold">Original Sales Order (Optional)</Label>
                                                <Select onValueChange={(v) => setFormData({ ...formData, orderId: v })}>
                                                    <SelectTrigger className="text-xs"><SelectValue placeholder="Select Order" /></SelectTrigger>
                                                    <SelectContent>
                                                        {orders.map(o => <SelectItem key={o.id} value={o.id}>{o.orderNumber}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Reason for Return *</Label>
                                            <Input
                                                placeholder="e.g. Damaged in transit, incorrect variant, customer cancelled"
                                                value={formData.reason}
                                                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                                className="text-xs"
                                            />
                                        </div>

                                        <Separator />

                                        <div className="space-y-3">
                                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Products to Return</Label>
                                            <Select onValueChange={(pId) => {
                                                const prod = products.find(p => p.id === pId)
                                                if (prod) addReturnItem(prod)
                                            }}>
                                                <SelectTrigger className="text-xs"><SelectValue placeholder="Search SKU or product to add..." /></SelectTrigger>
                                                <SelectContent>
                                                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
                                                </SelectContent>
                                            </Select>

                                            {returnItems.length > 0 && (
                                                <div className="rounded-xl border overflow-hidden">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Product</TableHead>
                                                                <TableHead className="w-24">Qty</TableHead>
                                                                <TableHead className="w-40">Condition</TableHead>
                                                                <TableHead className="w-32">Refund ($)</TableHead>
                                                                <TableHead className="w-12"></TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {returnItems.map((item, idx) => (
                                                                <TableRow key={idx}>
                                                                    <TableCell>
                                                                        <p className="font-medium text-xs text-foreground">{item.name}</p>
                                                                        <p className="font-mono text-[11px] text-muted-foreground">{item.sku}</p>
                                                                    </TableCell>
                                                                    <TableCell><Input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} className="h-8 text-xs font-mono" /></TableCell>
                                                                    <TableCell>
                                                                        <Select value={item.condition} onValueChange={v => updateItem(idx, "condition", v)}>
                                                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="saleable">Saleable (Restock)</SelectItem>
                                                                                <SelectItem value="damaged">Damaged (Write-off)</SelectItem>
                                                                                <SelectItem value="expired">Expired</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </TableCell>
                                                                    <TableCell><Input type="number" step="0.01" value={item.refundAmount} onChange={e => updateItem(idx, "refundAmount", parseFloat(e.target.value) || 0)} className="h-8 text-xs font-mono" /></TableCell>
                                                                    <TableCell><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => removeItem(idx)}><XCircle className="h-4 w-4" /></Button></TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <DialogFooter className="border-t pt-3">
                                        <Button variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                                        <Button size="sm" onClick={handleCreateReturn} disabled={!formData.customerId || !formData.reason || returnItems.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">Submit Return Request</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    }
                />

                {/* KPI Metrics */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                        title="Active RMAs"
                        value={returns.filter(r => r.status !== "completed" && r.status !== "rejected").length}
                        description="In inspection or pending receipt"
                        icon={RotateCcw}
                    />
                    <KpiCard
                        title="Pending Review"
                        value={returns.filter(r => r.status === "pending").length}
                        description="Awaiting return authorization"
                        icon={Clock}
                    />
                    <KpiCard
                        title="Restocked & Completed"
                        value={returns.filter(r => r.status === "completed").length}
                        description="Inventory restocked & closed"
                        icon={CheckCircle}
                    />
                    <KpiCard
                        title="Total Credited (MTD)"
                        value={`$${totalRefunded.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        description="Value of returned goods refunded"
                        icon={DollarSign}
                    />
                </div>

                {/* Returns List Table */}
                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <RotateCcw className="h-4 w-4 text-primary" />
                                Return Authorisations
                            </CardTitle>
                            <CardDescription>All RMA requests, verification states, and inventory credit notes</CardDescription>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input placeholder="Search RMA #, customer..." className="pl-8 text-xs h-8" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>RMA #</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Refund</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="w-20 text-right pr-4">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                                            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                                            Loading return records...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredReturns.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="p-6">
                                            <EmptyState
                                                icon={RotateCcw}
                                                title="No returns found"
                                                description="No return requests match your search query."
                                            />
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredReturns.map(r => (
                                        <TableRow key={r.id} className="hover:bg-muted/40 transition-colors">
                                            <TableCell className="font-mono text-xs font-semibold text-foreground">{r.returnNumber}</TableCell>
                                            <TableCell className="font-medium text-xs text-foreground">{r.customer.name}</TableCell>
                                            <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{r.reason}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                                            <TableCell className="text-right font-mono font-semibold text-xs text-foreground">{formatCurrency(r.totalAmount)}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={`text-[10px] ${statusConfig[r.status]?.badgeClass || ""}`}>
                                                    {statusConfig[r.status]?.label || r.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-4">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => { setSelectedReturn(r); setIsViewDialogOpen(true) }}
                                                    className="h-7 text-xs gap-1"
                                                >
                                                    <Eye className="h-3.5 w-3.5" /> View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* View & Action Modal */}
                <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                    <DialogContent className="max-w-2xl">
                        {selectedReturn && (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="flex justify-between w-full items-center">
                                        <span className="flex items-center gap-2">
                                            <RotateCcw className="h-5 w-5 text-primary" />
                                            RMA {selectedReturn.returnNumber}
                                        </span>
                                        <Badge variant="outline" className={`text-xs ${statusConfig[selectedReturn.status]?.badgeClass || ""}`}>
                                            {statusConfig[selectedReturn.status]?.label || selectedReturn.status}
                                        </Badge>
                                    </DialogTitle>
                                    <DialogDescription>
                                        Created on {formatDate(selectedReturn.createdAt)} for {selectedReturn.customer.name}
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-2">
                                    <div className="grid grid-cols-2 gap-3 text-xs bg-muted/30 p-3.5 rounded-xl border">
                                        <div><p className="text-muted-foreground font-semibold">Customer</p><p className="font-medium text-foreground mt-0.5">{selectedReturn.customer.name}</p></div>
                                        <div><p className="text-muted-foreground font-semibold">Original Order</p><p className="font-mono font-medium text-foreground mt-0.5">{selectedReturn.order?.orderNumber || "Direct Return"}</p></div>
                                        <div className="col-span-2"><p className="text-muted-foreground font-semibold">Return Reason</p><p className="text-foreground mt-0.5">{selectedReturn.reason}</p></div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Returned Items ({selectedReturn.items.length})</p>
                                        <div className="rounded-xl border overflow-hidden">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Item</TableHead>
                                                        <TableHead className="text-center">Qty</TableHead>
                                                        <TableHead>Condition</TableHead>
                                                        <TableHead className="text-right">Refund</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {selectedReturn.items.map((i, idx) => (
                                                        <TableRow key={idx}>
                                                            <TableCell className="font-medium text-xs">{i.product.name}</TableCell>
                                                            <TableCell className="text-center font-mono text-xs">{i.quantity}</TableCell>
                                                            <TableCell><Badge variant="secondary" className="text-[10px]">{i.condition}</Badge></TableCell>
                                                            <TableCell className="text-right font-mono text-xs font-semibold text-foreground">{formatCurrency(i.refundAmount)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>

                                    {/* Action Workflow Section */}
                                    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                                        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">RMA Actions & Warehouse Resolution</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedReturn.status === "pending" && (
                                                <>
                                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleStatusUpdate(selectedReturn.id, "approved")}>
                                                        <CheckCircle className="h-4 w-4 mr-1.5" /> Approve RMA
                                                    </Button>
                                                    <Button size="sm" variant="destructive" onClick={() => handleStatusUpdate(selectedReturn.id, "rejected")}>
                                                        <XCircle className="h-4 w-4 mr-1.5" /> Reject RMA
                                                    </Button>
                                                </>
                                            )}

                                            {selectedReturn.status === "approved" && (
                                                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleStatusUpdate(selectedReturn.id, "received")}>
                                                    <Package className="h-4 w-4 mr-1.5" /> Mark Goods Received & Inspected
                                                </Button>
                                            )}

                                            {selectedReturn.status === "received" && (
                                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleStatusUpdate(selectedReturn.id, "completed")}>
                                                    <CheckCircle className="h-4 w-4 mr-1.5" /> Restock Inventory & Issue Credit Note
                                                </Button>
                                            )}

                                            {selectedReturn.status === "completed" && (
                                                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                                    <CheckCircle className="h-4 w-4" /> This RMA has been completed, restocked, and credit note created.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </AppShell>
    )
}

