"use client"

import { useState, useEffect } from "react"
import {
    CreditCard, Search, User, Loader2
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { formatCurrency } from "@/lib/types"

interface CreditSummary {
    id: string
    name: string
    creditLimit: number
    creditBalance: number
    creditStatus: string
    paymentTerms: number
}

interface CreditTransaction {
    id: string
    type: string
    amount: number
    reference: string
    notes: string
    createdAt: string
}

interface CreditSummaryTotals {
    totalCreditIssued: number
    totalOutstanding: number
    customersOnCredit: number
    customersOnHold: number
}

const defaultSummary: CreditSummaryTotals = {
    totalCreditIssued: 0,
    totalOutstanding: 0,
    customersOnCredit: 0,
    customersOnHold: 0,
}

export default function CreditManagementPage() {
    const [customers, setCustomers] = useState<CreditSummary[]>([])
    const [transactions, setTransactions] = useState<CreditTransaction[]>([])
    const [summary, setSummary] = useState<CreditSummaryTotals>(defaultSummary)
    const [selectedCustomer, setSelectedCustomer] = useState<string>("all")
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [search, setSearch] = useState("")
    const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false)
    const [adjustForm, setAdjustForm] = useState({
        type: "payment_received",
        amount: "",
        description: "",
        notes: "",
    })

    useEffect(() => {
        void fetchCreditData()
    }, [selectedCustomer])

    const fetchCreditData = async () => {
        try {
            setLoading(true)
            const custResp = await fetch("/api/credit")
            const custData = await custResp.json()

            if (custData.success) {
                setCustomers(Array.isArray(custData.data?.customers) ? custData.data.customers : [])
                setSummary(custData.data?.summary || defaultSummary)
            }

            if (selectedCustomer !== "all") {
                const transResp = await fetch(`/api/credit?customerId=${selectedCustomer}`)
                const transData = await transResp.json()
                if (transData.success) {
                    setTransactions(transData.data.transactions || [])
                }
            } else {
                setTransactions([])
            }
        } catch (error) {
            console.error("Error fetching credit data:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleAdjustCredit = async () => {
        if (!activeCustomer || !adjustForm.amount || !adjustForm.description.trim()) {
            return
        }

        try {
            setSubmitting(true)
            const response = await fetch("/api/credit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customerId: activeCustomer.id,
                    type: adjustForm.type,
                    amount: Number(adjustForm.amount),
                    description: adjustForm.description.trim(),
                    notes: adjustForm.notes.trim(),
                }),
            })
            const data = await response.json()

            if (!data.success) {
                throw new Error(data.error || "Failed to save credit adjustment")
            }

            setIsAdjustDialogOpen(false)
            setAdjustForm({
                type: "payment_received",
                amount: "",
                description: "",
                notes: "",
            })
            await fetchCreditData()
        } catch (error) {
            console.error("Error saving credit adjustment:", error)
        } finally {
            setSubmitting(false)
        }
    }

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    )

    const activeCustomer = customers.find(c => c.id === selectedCustomer)
    const utilization = activeCustomer && activeCustomer.creditLimit > 0
        ? (activeCustomer.creditBalance / activeCustomer.creditLimit) * 100
        : 0

    const summaryCards = [
        { label: "Credit Issued", value: formatCurrency(summary.totalCreditIssued), tone: "text-emerald-900 bg-emerald-50/70 border-emerald-100" },
        { label: "Outstanding", value: formatCurrency(summary.totalOutstanding), tone: "text-blue-900 bg-blue-50/70 border-blue-100" },
        { label: "Active Credit Accounts", value: String(summary.customersOnCredit), tone: "text-slate-900 bg-slate-50/70 border-slate-200" },
        { label: "Accounts On Hold", value: String(summary.customersOnHold), tone: "text-amber-900 bg-amber-50/70 border-amber-100" },
    ]

    return (
        <AppShell title="Credit Management" breadcrumbs={[{ label: "Customers" }, { label: "Credit Management" }]}>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Customer Credit</h1>
                    <p className="text-muted-foreground">Manage customer credit limits, balances, and history</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {summaryCards.map((card) => (
                        <Card key={card.label} className={card.tone}>
                            <CardHeader className="pb-2">
                                <CardDescription className="text-current/70">{card.label}</CardDescription>
                                <CardTitle className="text-2xl text-current">{card.value}</CardTitle>
                            </CardHeader>
                        </Card>
                    ))}
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    <Card className="md:col-span-1 border-r h-full min-h-[500px]">
                        <CardHeader className="pb-3 border-b">
                            <div className="flex items-center justify-between mb-2">
                                <CardTitle className="text-base">Customers</CardTitle>
                                <Badge variant="outline">{filteredCustomers.length}</Badge>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search customers..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 overflow-y-auto max-h-[600px]">
                            {loading && customers.length === 0 ? (
                                <div className="p-4 text-center text-muted-foreground">Loading...</div>
                            ) : filteredCustomers.map(customer => (
                                <div
                                    key={customer.id}
                                    className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${selectedCustomer === customer.id ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : ''}`}
                                    onClick={() => setSelectedCustomer(customer.id)}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="font-semibold">{customer.name}</p>
                                        <Badge className={
                                            customer.creditStatus === "active" ? "bg-green-100 text-green-700" :
                                                customer.creditStatus === "on_hold" ? "bg-red-100 text-red-700" :
                                                    "bg-gray-100 text-gray-700"
                                        }>
                                            {customer.creditStatus.replace("_", " ")}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between text-sm mt-2">
                                        <span className="text-muted-foreground">Limit: {formatCurrency(customer.creditLimit)}</span>
                                        <span className={customer.creditBalance > customer.creditLimit ? "text-red-600 font-medium" : "font-medium"}>
                                            Used: {formatCurrency(customer.creditBalance)}
                                        </span>
                                    </div>
                                    {customer.creditLimit > 0 && (
                                        <Progress
                                            value={(customer.creditBalance / customer.creditLimit) * 100}
                                            className={`h-1 mt-2.5 ${customer.creditBalance > customer.creditLimit ? '[&>div]:bg-red-500' : '[&>div]:bg-emerald-500'}`}
                                        />
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <div className="md:col-span-2 space-y-6">
                        {activeCustomer ? (
                            <>
                                <div className="grid grid-cols-3 gap-4">
                                    <Card className="bg-emerald-50/50 border-emerald-100">
                                        <CardHeader className="pb-2">
                                            <CardDescription className="text-emerald-800">Credit Limit</CardDescription>
                                            <CardTitle className="text-3xl text-emerald-900">{formatCurrency(activeCustomer.creditLimit)}</CardTitle>
                                        </CardHeader>
                                    </Card>
                                    <Card className={`${utilization > 90 ? 'bg-red-50/50 border-red-100' : 'bg-blue-50/50 border-blue-100'}`}>
                                        <CardHeader className="pb-2">
                                            <CardDescription className={utilization > 90 ? 'text-red-800' : 'text-blue-800'}>Current Balance</CardDescription>
                                            <CardTitle className={`text-3xl ${utilization > 90 ? 'text-red-900' : 'text-blue-900'}`}>
                                                {formatCurrency(activeCustomer.creditBalance)}
                                            </CardTitle>
                                        </CardHeader>
                                    </Card>
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardDescription>Available Credit</CardDescription>
                                            <CardTitle className="text-3xl">
                                                {formatCurrency(Math.max(0, activeCustomer.creditLimit - activeCustomer.creditBalance))}
                                            </CardTitle>
                                        </CardHeader>
                                    </Card>
                                </div>

                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                                        <div>
                                            <CardTitle>Credit Transactions</CardTitle>
                                            <CardDescription>Ledger history for {activeCustomer.name}</CardDescription>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={() => setIsAdjustDialogOpen(true)}>
                                            <CreditCard className="mr-2 h-4 w-4" />
                                            Adjust Balance
                                        </Button>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>Reference</TableHead>
                                                    <TableHead className="text-right">Amount</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {loading && transactions.length === 0 ? (
                                                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading transactions...</TableCell></TableRow>
                                                ) : transactions.length === 0 ? (
                                                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No credit transactions found</TableCell></TableRow>
                                                ) : transactions.map(t => (
                                                    <TableRow key={t.id}>
                                                        <TableCell>{new Date(t.createdAt).toLocaleDateString()}</TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="capitalize">
                                                                {t.type.replace('_', ' ')}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-medium">{t.reference || "-"}</div>
                                                            <div className="text-xs text-muted-foreground">{t.notes}</div>
                                                        </TableCell>
                                                        <TableCell className={`text-right font-medium ${["invoice_charge", "adjustment"].includes(t.type) && t.amount > 0 ? "text-red-600" : "text-green-600"
                                                            }`}>
                                                            {["invoice_charge", "adjustment"].includes(t.type) && t.amount > 0 ? "+" : "-"}
                                                            {formatCurrency(Math.abs(t.amount))}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            </>
                        ) : (
                            <Card className="h-full flex flex-col items-center justify-center min-h-[400px] bg-gray-50/50 border-dashed">
                                <User className="h-12 w-12 text-muted-foreground/30 mb-4" />
                                <h3 className="text-lg font-medium text-gray-900">No Customer Selected</h3>
                                <p className="text-sm text-muted-foreground max-w-sm text-center mt-1">
                                    Select a customer from the left sidebar to view their credit utilization and transaction history.
                                </p>
                            </Card>
                        )}
                    </div>
                </div>

                <Dialog open={isAdjustDialogOpen} onOpenChange={setIsAdjustDialogOpen}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Adjust Customer Credit</DialogTitle>
                            <DialogDescription>
                                Record a credit event for {activeCustomer?.name || "the selected customer"} and refresh the ledger automatically.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="credit-type">Adjustment type</Label>
                                <Select
                                    value={adjustForm.type}
                                    onValueChange={(value) => setAdjustForm((current) => ({ ...current, type: value }))}
                                >
                                    <SelectTrigger id="credit-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="payment_received">Payment Received</SelectItem>
                                        <SelectItem value="invoice_charge">Invoice Charge</SelectItem>
                                        <SelectItem value="adjustment">Manual Adjustment</SelectItem>
                                        <SelectItem value="refund">Refund</SelectItem>
                                        <SelectItem value="credit_grant">Increase Credit Limit</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="credit-amount">Amount</Label>
                                <Input
                                    id="credit-amount"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={adjustForm.amount}
                                    onChange={(event) => setAdjustForm((current) => ({ ...current, amount: event.target.value }))}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="credit-description">Description</Label>
                                <Input
                                    id="credit-description"
                                    value={adjustForm.description}
                                    onChange={(event) => setAdjustForm((current) => ({ ...current, description: event.target.value }))}
                                    placeholder="Settlement from bank transfer"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="credit-notes">Internal notes</Label>
                                <Textarea
                                    id="credit-notes"
                                    value={adjustForm.notes}
                                    onChange={(event) => setAdjustForm((current) => ({ ...current, notes: event.target.value }))}
                                    placeholder="Optional reference for the finance team"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setIsAdjustDialogOpen(false)}
                                disabled={submitting}
                            >
                                Cancel
                            </Button>
                            <Button onClick={() => void handleAdjustCredit()} disabled={submitting || !adjustForm.amount || !adjustForm.description.trim()}>
                                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                                Save Adjustment
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </AppShell>
    )
}
