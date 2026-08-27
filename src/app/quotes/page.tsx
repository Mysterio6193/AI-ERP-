"use client"

import { useEffect, useState } from "react"
import {
    Plus, Search, FileText, Eye, CheckCircle, Clock, Send,
    ArrowRight, AlertCircle, MoreHorizontal, Trash2, Package
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
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
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency, QUOTE_STATUS } from "@/lib/types"

interface Customer { id: string; name: string; email?: string; phone?: string; creditLimit: number }
interface Product { id: string; sku: string; name: string; wholesalePrice: number }
interface QuoteItem {
    productId: string; productName: string; sku: string
    quantity: number; unitPrice: number; discount: number; taxRate: number; total: number
}
interface Quote {
    id: string; quoteNumber: string
    customer: Customer; customerId: string
    quoteDate: string; validUntil: string | null
    subtotal: number; discountAmount: number; taxAmount: number; totalAmount: number
    status: string; customerNotes: string | null; internalNotes: string | null
    items: QuoteItem[]
}

const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    sent: "bg-blue-100 text-blue-700",
    accepted: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    expired: "bg-orange-100 text-orange-700",
    converted: "bg-teal-100 text-teal-700",
}

export default function QuotesPage() {
    // The rate a new line starts on, from settings rather than a literal 10.
    const [defaultTaxRate, setDefaultTaxRate] = useState(0)

    const [quotes, setQuotes] = useState<Quote[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const [dialogOpen, setDialogOpen] = useState(false)

    const [formData, setFormData] = useState({
        customerId: "", validUntil: "", customerNotes: "", internalNotes: "",
        items: [] as QuoteItem[],
    })

    async function fetchQuotes() {
        const response = await fetch("/api/quotes")
        const data = await response.json()
        if (data.success) {
            setQuotes(data.data || [])
        }
    }

    useEffect(() => {
        void fetch("/api/settings/tax")
            .then((response) => response.json())
            .then((result) => {
                if (result?.success) setDefaultTaxRate(Number(result.data?.defaultRate ?? 0) || 0)
            })
            .catch(() => {
                // Zero is the safe failure: visibly wrong gets corrected.
            })

        const fetchData = async () => {
            setLoading(true)

            try {
                const [custRes, prodRes] = await Promise.all([
                    fetch("/api/customers"),
                    fetch("/api/products"),
                ])

                if (custRes.ok) {
                    const data = await custRes.json()
                    setCustomers(Array.isArray(data) ? data : data.customers || data.data || [])
                }

                if (prodRes.ok) {
                    const data = await prodRes.json()
                    setProducts(Array.isArray(data) ? data : data.products || data.data || [])
                }
                await fetchQuotes()
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
                quantity: 1, unitPrice: 0, discount: 0, taxRate: defaultTaxRate, total: 0,
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
                    item.unitPrice = product.wholesalePrice
                }
            }
            const lineSubtotal = item.quantity * item.unitPrice * (1 - item.discount / 100)
            item.total = lineSubtotal * (1 + item.taxRate / 100)
            items[index] = item
            return { ...prev, items }
        })
    }

    async function handleSubmit() {
        const customer = customers.find(c => c.id === formData.customerId)
        if (!customer || formData.items.length === 0) return

        try {
            const response = await fetch("/api/quotes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            })
            const data = await response.json()
            if (!data.success) return

            await fetchQuotes()
            setDialogOpen(false)
            setFormData({ customerId: "", validUntil: "", customerNotes: "", internalNotes: "", items: [] })
        } catch (error) {
            console.error(error)
        }
    }

    async function updateStatus(quoteId: string, newStatus: string) {
        try {
            const response = await fetch(`/api/quotes/${quoteId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            })
            const data = await response.json()
            if (!data.success) return
            await fetchQuotes()
        } catch (error) {
            console.error(error)
        }
    }

    const { toast } = useToast()
    const router = useRouter()

    async function convertToOrder(quoteId: string) {
        try {
            const response = await fetch(`/api/quotes/${quoteId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "convert" }),
            })
            const data = await response.json()
            if (!data.success) {
                toast({
                    title: "Conversion Failed",
                    description: data.error || "Could not convert quote to sales order.",
                    variant: "destructive",
                })
                return
            }
            toast({
                title: "Sales Order Created",
                description: `Successfully converted quote to Sales Order ${data.data?.orderNumber || ""}.`,
            })
            await fetchQuotes()
            router.push("/orders")
        } catch (error) {
            console.error(error)
            toast({
                title: "Error",
                description: "An unexpected error occurred during conversion.",
                variant: "destructive",
            })
        }
    }

    const filteredQuotes = quotes.filter(q => {
        const matchSearch = q.quoteNumber.toLowerCase().includes(search.toLowerCase()) ||
            q.customer.name.toLowerCase().includes(search.toLowerCase())
        const matchStatus = statusFilter === "all" || q.status === statusFilter
        return matchSearch && matchStatus
    })

    const stats = {
        total: quotes.length,
        draft: quotes.filter(q => q.status === "draft").length,
        sent: quotes.filter(q => q.status === "sent").length,
        accepted: quotes.filter(q => q.status === "accepted").length,
        totalValue: quotes.filter(q => !["rejected", "expired", "cancelled"].includes(q.status))
            .reduce((s, q) => s + q.totalAmount, 0),
    }

    return (
        <AppShell title="Quotes" breadcrumbs={[{ label: "Quotes" }]}>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Quotes</h1>
                        <p className="text-muted-foreground">Create and manage customer quotations</p>
                    </div>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-emerald-600 hover:bg-emerald-700">
                                <Plus className="h-4 w-4 mr-2" /> New Quote
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Create Quote</DialogTitle>
                                <DialogDescription>Send a quotation to your customer</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Customer *</Label>
                                        <Select value={formData.customerId} onValueChange={v => setFormData(p => ({ ...p, customerId: v }))}>
                                            <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                                            <SelectContent>
                                                {customers.map(c => (
                                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Valid Until</Label>
                                        <Input type="date" value={formData.validUntil}
                                            onChange={e => setFormData(p => ({ ...p, validUntil: e.target.value }))} />
                                    </div>
                                </div>
                                <Separator />
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <Label className="text-base font-semibold">Quote Items</Label>
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
                                                    <TableHead className="w-20">Qty</TableHead>
                                                    <TableHead className="w-28">Price</TableHead>
                                                    <TableHead className="w-24">Disc %</TableHead>
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
                                                                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
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
                                                            <Input type="number" step={0.01} value={item.unitPrice}
                                                                onChange={e => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input type="number" step={0.5} value={item.discount}
                                                                onChange={e => updateItem(idx, "discount", parseFloat(e.target.value) || 0)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input type="number" step={0.5} value={item.taxRate}
                                                                onChange={e => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)} />
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                                                        <TableCell>
                                                            <Button variant="ghost" size="icon" onClick={() => {
                                                                setFormData(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
                                                            }}>
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Customer Notes</Label>
                                        <Textarea placeholder="Notes visible to customer..."
                                            value={formData.customerNotes}
                                            onChange={e => setFormData(p => ({ ...p, customerNotes: e.target.value }))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Internal Notes</Label>
                                        <Textarea placeholder="Internal only..."
                                            value={formData.internalNotes}
                                            onChange={e => setFormData(p => ({ ...p, internalNotes: e.target.value }))} />
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit}
                                    disabled={!formData.customerId || formData.items.length === 0}>
                                    Create Quote
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-4">
                    {[
                        { label: "Total Quotes", value: stats.total, icon: FileText, color: "text-blue-600 bg-blue-50" },
                        { label: "Draft", value: stats.draft, icon: Clock, color: "text-gray-600 bg-gray-50" },
                        { label: "Sent", value: stats.sent, icon: Send, color: "text-indigo-600 bg-indigo-50" },
                        { label: "Pipeline Value", value: formatCurrency(stats.totalValue), icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
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
                        <Input placeholder="Search quotes..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            {QUOTE_STATUS.map(s => (
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
                                    <TableHead>Quote #</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Valid Until</TableHead>
                                    <TableHead>Items</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-12"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredQuotes.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                            <p className="font-medium">No quotes yet</p>
                                            <p className="text-sm">Create your first quote to get started</p>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredQuotes.map(q => (
                                    <TableRow key={q.id}>
                                        <TableCell className="font-medium">{q.quoteNumber}</TableCell>
                                        <TableCell>{q.customer.name}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {new Date(q.quoteDate).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {q.validUntil ? new Date(q.validUntil).toLocaleDateString() : "—"}
                                        </TableCell>
                                        <TableCell>{q.items.length} items</TableCell>
                                        <TableCell className="text-right font-medium">{formatCurrency(q.totalAmount)}</TableCell>
                                        <TableCell>
                                            <Badge className={statusColors[q.status] || "bg-gray-100"}>
                                                {QUOTE_STATUS.find(s => s.value === q.status)?.label || q.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {q.status === "draft" && (
                                                        <DropdownMenuItem onClick={() => updateStatus(q.id, "sent")}>
                                                            <Send className="h-4 w-4 mr-2" /> Send to Customer
                                                        </DropdownMenuItem>
                                                    )}
                                                    {q.status === "sent" && (
                                                        <>
                                                            <DropdownMenuItem onClick={() => updateStatus(q.id, "accepted")}>
                                                                <CheckCircle className="h-4 w-4 mr-2" /> Mark Accepted
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => updateStatus(q.id, "rejected")}>
                                                                <AlertCircle className="h-4 w-4 mr-2" /> Mark Rejected
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    {q.status === "accepted" && (
                                                        <DropdownMenuItem onClick={() => convertToOrder(q.id)}>
                                                            <ArrowRight className="h-4 w-4 mr-2" /> Convert to Sales Order
                                                        </DropdownMenuItem>
                                                    )}
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
        </AppShell>
    )
}
