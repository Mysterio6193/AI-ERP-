"use client"

import { useState, useEffect } from "react"
import {
    Plus, Search, RotateCcw, Eye, FileText, CheckCircle,
    Clock, Package, XCircle, User, AlertCircle, RefreshCw,
    ArrowDownLeft, CornerDownLeft
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
        r.customer.name.toLowerCase().includes(search.toLowerCase())
    )

    const getStatusColor = (status: string) => {
        switch (status) {
            case "pending": return "bg-yellow-100 text-yellow-700"
            case "approved": return "bg-blue-100 text-blue-700"
            case "received": return "bg-purple-100 text-purple-700"
            case "completed": return "bg-green-100 text-green-700"
            case "rejected": return "bg-red-100 text-red-700"
            default: return "bg-gray-100 text-gray-700"
        }
    }

    return (
        <AppShell title="Returns (RMA)" breadcrumbs={[{ label: "Returns" }]}>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Returns & RMAs</h1>
                        <p className="text-muted-foreground">Manage customer returns and inventory restocking</p>
                    </div>
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-emerald-600 hover:bg-emerald-700">
                                <RotateCcw className="mr-2 h-4 w-4" /> New Return
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Process New Return</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Customer</Label>
                                        <Select onValueChange={handleCustomerChange}>
                                            <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                                            <SelectContent>
                                                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Original Order (Optional)</Label>
                                        <Select onValueChange={(v) => setFormData({ ...formData, orderId: v })}>
                                            <SelectTrigger><SelectValue placeholder="Select Order" /></SelectTrigger>
                                            <SelectContent>
                                                {orders.map(o => <SelectItem key={o.id} value={o.id}>{o.orderNumber}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Reason for Return</Label>
                                    <Input placeholder="e.g. Damaged during shipping" value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} />
                                </div>

                                <Separator />
                                <div>
                                    <h4 className="font-medium mb-3">Items to Return</h4>
                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        {products.slice(0, 6).map(p => (
                                            <Button key={p.id} variant="outline" size="sm" onClick={() => addReturnItem(p)}>
                                                <Plus className="h-3 w-3 mr-1" /> {p.name}
                                            </Button>
                                        ))}
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Product</TableHead>
                                                <TableHead className="w-20 text-center">Qty</TableHead>
                                                <TableHead className="w-32">Condition</TableHead>
                                                <TableHead className="w-32 text-right">Refund</TableHead>
                                                <TableHead className="w-10"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {returnItems.map((item, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="text-sm">{item.name}</TableCell>
                                                    <TableCell><Input type="number" className="h-8 text-center" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value))} /></TableCell>
                                                    <TableCell>
                                                        <Select value={item.condition} onValueChange={v => updateItem(idx, 'condition', v)}>
                                                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="saleable">Saleable</SelectItem>
                                                                <SelectItem value="damaged">Damaged</SelectItem>
                                                                <SelectItem value="scrap">Scrap</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell><Input type="number" className="h-8 text-right" value={item.refundAmount} onChange={e => updateItem(idx, 'refundAmount', parseFloat(e.target.value))} /></TableCell>
                                                    <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(idx)}><XCircle className="h-4 w-4 text-red-500" /></Button></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCreateReturn} disabled={!formData.customerId || !returnItems.length} className="bg-emerald-600 hover:bg-emerald-700">Submit Return</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="grid grid-cols-4 gap-4">
                    <Card><CardContent className="pt-6 text-center">
                        <p className="text-sm font-medium text-muted-foreground">Active RMAs</p>
                        <p className="text-2xl font-bold">{returns.filter(r => r.status !== "completed").length}</p>
                    </CardContent></Card>
                    <Card><CardContent className="pt-6 text-center">
                        <p className="text-sm font-medium text-muted-foreground">Restocked (MTD)</p>
                        <p className="text-2xl font-bold text-emerald-600">{returns.filter(r => r.status === "completed").length}</p>
                    </CardContent></Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Recent Returns</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search returns..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
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
                                    <TableHead className="w-12"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? <TableRow><TableCell colSpan={7} className="text-center py-10">Loading...</TableCell></TableRow> :
                                    filteredReturns.map(r => (
                                        <TableRow key={r.id}>
                                            <TableCell className="font-mono">{r.returnNumber}</TableCell>
                                            <TableCell>{r.customer.name}</TableCell>
                                            <TableCell className="max-w-[150px] truncate">{r.reason}</TableCell>
                                            <TableCell className="text-sm">{formatDate(r.createdAt)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatCurrency(r.totalAmount)}</TableCell>
                                            <TableCell className="text-center"><Badge className={getStatusColor(r.status)}>{r.status}</Badge></TableCell>
                                            <TableCell><Button variant="ghost" size="icon" onClick={() => { setSelectedReturn(r); setIsViewDialogOpen(true) }}><Eye className="h-4 w-4" /></Button></TableCell>
                                        </TableRow>
                                    ))
                                }
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* View Modal */}
                <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                    <DialogContent className="max-w-2xl">
                        {selectedReturn && (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="flex justify-between w-full">
                                        <span>Return {selectedReturn.returnNumber}</span>
                                        <Badge className={getStatusColor(selectedReturn.status)}>{selectedReturn.status}</Badge>
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div><p className="text-muted-foreground">Customer</p><p className="font-medium">{selectedReturn.customer.name}</p></div>
                                        <div><p className="text-muted-foreground">Original Order</p><p className="font-medium">{selectedReturn.order?.orderNumber || "N/A"}</p></div>
                                        <div className="col-span-2"><p className="text-muted-foreground">Reason</p><p className="bg-gray-50 p-2 rounded">{selectedReturn.reason}</p></div>
                                    </div>
                                    <Separator />
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-center">Qty</TableHead><TableHead>Condition</TableHead><TableHead className="text-right">Refund</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {selectedReturn.items.map((i, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>{i.product.name}</TableCell>
                                                    <TableCell className="text-center">{i.quantity}</TableCell>
                                                    <TableCell>{i.condition}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(i.refundAmount)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </AppShell>
    )
}
