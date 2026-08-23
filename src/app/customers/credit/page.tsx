"use client"

import { useState, useEffect } from "react"
import {
    CreditCard, Search, User, Loader2, DollarSign, AlertCircle, TrendingUp, Users, AlertTriangle, CheckCircle2
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
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
import { formatCurrency, formatCurrencyShort } from "@/lib/types"

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
    availableHeadroom: number
    accountsOverLimit: number
}

export default function CustomerCreditPage() {
    const [customers, setCustomers] = useState<CreditSummary[]>([])
    const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
    const [transactions, setTransactions] = useState<CreditTransaction[]>([])
    const [totals, setTotals] = useState<CreditSummaryTotals>({
        totalCreditIssued: 0,
        totalOutstanding: 0,
        availableHeadroom: 0,
        accountsOverLimit: 0,
    })
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")

    // Adjustment Dialog State
    const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false)
    const [adjustType, setAdjustType] = useState<"credit_issued" | "credit_used" | "adjustment">("adjustment")
    const [adjustAmount, setAdjustAmount] = useState("")
    const [adjustRef, setAdjustRef] = useState("")
    const [adjustNotes, setAdjustNotes] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        fetchCustomers()
    }, [])

    useEffect(() => {
        if (selectedCustomer) {
            fetchTransactions(selectedCustomer)
        } else {
            setTransactions([])
        }
    }, [selectedCustomer])

    const fetchCustomers = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/customers/credit")
            const data = await res.json()
            if (data.success) {
                setCustomers(data.data)
                if (data.totals) {
                    setTotals(data.totals)
                }
                if (data.data.length > 0 && !selectedCustomer) {
                    setSelectedCustomer(data.data[0].id)
                }
            }
        } catch (error) {
            console.error("Failed to fetch customer credits:", error)
        } finally {
            setLoading(false)
        }
    }

    const fetchTransactions = async (customerId: string) => {
        try {
            const res = await fetch(`/api/customers/${customerId}/credit`)
            const data = await res.json()
            if (data.success) {
                setTransactions(data.data)
            }
        } catch (error) {
            console.error("Failed to fetch credit transactions:", error)
        }
    }

    const handleAdjustCredit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedCustomer || !adjustAmount) return

        setIsSubmitting(true)
        try {
            const res = await fetch(`/api/customers/${selectedCustomer}/credit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: adjustType,
                    amount: parseFloat(adjustAmount),
                    reference: adjustRef,
                    notes: adjustNotes,
                }),
            })

            const data = await res.json()
            if (data.success) {
                setIsAdjustDialogOpen(false)
                setAdjustAmount("")
                setAdjustRef("")
                setAdjustNotes("")
                fetchCustomers()
                fetchTransactions(selectedCustomer)
            } else {
                alert(data.error || "Failed to process credit adjustment")
            }
        } catch (error) {
            console.error("Error adjusting credit:", error)
            alert("An error occurred. Please try again.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    )

    const activeCustomer = customers.find(c => c.id === selectedCustomer)
    const utilization = activeCustomer && activeCustomer.creditLimit > 0
        ? (activeCustomer.creditBalance / activeCustomer.creditLimit) * 100
        : 0

    return (
        <AppShell title="Customer Credit Ledger" breadcrumbs={[{ label: "Customers", href: "/customers" }, { label: "Credit" }]}>
            <div className="space-y-6">
                <PageHeader
                    title="Customer Credit Ledger"
                    description="Monitor B2B customer credit limits, track balances, and adjust ledger entries."
                />

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                        title="Total Credit Issued"
                        value={formatCurrencyShort(totals.totalCreditIssued)}
                        icon={CreditCard}
                    />
                    <KpiCard
                        title="Total Outstanding"
                        value={formatCurrencyShort(totals.totalOutstanding)}
                        icon={DollarSign}
                    />
                    <KpiCard
                        title="Available Headroom"
                        value={formatCurrencyShort(totals.availableHeadroom)}
                        icon={CheckCircle2}
                    />
                    <KpiCard
                        title="Accounts Over Limit"
                        value={totals.accountsOverLimit}
                        icon={AlertTriangle}
                    />
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-1 border-border shadow-sm h-full min-h-[500px] overflow-hidden">
                        <CardHeader className="p-4 border-b border-border">
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
                                <div className="p-8 text-center text-muted-foreground">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                    Loading customers...
                                </div>
                            ) : filteredCustomers.length === 0 ? (
                                <div className="p-6 text-center text-muted-foreground text-sm">
                                    No customers found.
                                </div>
                            ) : filteredCustomers.map(customer => (
                                <div
                                    key={customer.id}
                                    className={`p-4 border-b border-border cursor-pointer transition-colors ${selectedCustomer === customer.id ? 'bg-muted/60 border-l-4 border-l-primary' : 'hover:bg-muted/30'}`}
                                    onClick={() => setSelectedCustomer(customer.id)}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="font-semibold text-sm text-foreground">{customer.name}</p>
                                        <Badge variant="outline" className={
                                            customer.creditStatus === "active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10" :
                                                customer.creditStatus === "on_hold" ? "border-amber-500/30 text-amber-600 bg-amber-500/10" :
                                                    "border-border text-muted-foreground"
                                        }>
                                            {customer.creditStatus.replace("_", " ")}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between text-xs mt-2">
                                        <span className="text-muted-foreground">Limit: {formatCurrency(customer.creditLimit)}</span>
                                        <span className={customer.creditBalance > customer.creditLimit ? "text-destructive font-medium" : "font-medium text-foreground"}>
                                            Used: {formatCurrency(customer.creditBalance)}
                                        </span>
                                    </div>
                                    {customer.creditLimit > 0 && (
                                        <Progress
                                            value={(customer.creditBalance / customer.creditLimit) * 100}
                                            className="h-1 mt-2.5"
                                        />
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <div className="lg:col-span-2 space-y-6">
                        {activeCustomer ? (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <Card className="border-border shadow-sm bg-muted/20">
                                        <CardHeader className="p-4 pb-2">
                                            <CardDescription>Credit Limit</CardDescription>
                                            <CardTitle className="text-2xl">{formatCurrency(activeCustomer.creditLimit)}</CardTitle>
                                        </CardHeader>
                                    </Card>
                                    <Card className={`border-border shadow-sm ${utilization > 90 ? 'bg-rose-500/5 border-rose-500/20' : 'bg-muted/20'}`}>
                                        <CardHeader className="p-4 pb-2">
                                            <CardDescription>Current Balance</CardDescription>
                                            <CardTitle className={`text-2xl ${utilization > 90 ? 'text-destructive' : 'text-foreground'}`}>
                                                {formatCurrency(activeCustomer.creditBalance)}
                                            </CardTitle>
                                        </CardHeader>
                                    </Card>
                                    <Card className="border-border shadow-sm bg-muted/20">
                                        <CardHeader className="p-4 pb-2">
                                            <CardDescription>Available Credit</CardDescription>
                                            <CardTitle className="text-2xl">
                                                {formatCurrency(Math.max(0, activeCustomer.creditLimit - activeCustomer.creditBalance))}
                                            </CardTitle>
                                        </CardHeader>
                                    </Card>
                                </div>

                                <Card className="border-border shadow-sm overflow-hidden">
                                    <CardHeader className="p-4 sm:p-6 flex flex-row items-center justify-between border-b border-border">
                                        <div>
                                            <CardTitle className="text-base">Credit Transactions</CardTitle>
                                            <CardDescription>Ledger history for {activeCustomer.name}</CardDescription>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={() => setIsAdjustDialogOpen(true)}>
                                            <CreditCard className="mr-2 h-4 w-4" />
                                            Adjust Balance
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="p-0">
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
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                                                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                                            Loading transactions...
                                                        </TableCell>
                                                    </TableRow>
                                                ) : transactions.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="p-0">
                                                            <EmptyState
                                                                icon={CreditCard}
                                                                title="No transactions"
                                                                description="No credit ledger transactions found for this customer."
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ) : transactions.map(t => (
                                                    <TableRow key={t.id}>
                                                        <TableCell className="text-muted-foreground text-sm">
                                                            {new Date(t.createdAt).toLocaleDateString()}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="capitalize">
                                                                {t.type.replace("_", " ")}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs">
                                                            {t.reference || "-"}
                                                        </TableCell>
                                                        <TableCell className={`text-right font-medium ${t.type === 'credit_used' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                            {t.type === 'credit_used' ? '-' : '+'}{formatCurrency(t.amount)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            </>
                        ) : (
                            <Card className="border-border shadow-sm p-12">
                                <EmptyState
                                    icon={User}
                                    title="No customer selected"
                                    description="Select a customer from the left list to view their credit ledger and transactions."
                                />
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
                        <form onSubmit={handleAdjustCredit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="credit-type">Adjustment type</Label>
                                <Select
                                    value={adjustType}
                                    onValueChange={(value: any) => setAdjustType(value)}
                                >
                                    <SelectTrigger id="credit-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="credit_issued">Credit Issued</SelectItem>
                                        <SelectItem value="credit_used">Credit Used / Invoice</SelectItem>
                                        <SelectItem value="adjustment">Manual Adjustment</SelectItem>
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
                                    value={adjustAmount}
                                    onChange={(event) => setAdjustAmount(event.target.value)}
                                    placeholder="0.00"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="credit-ref">Reference</Label>
                                <Input
                                    id="credit-ref"
                                    value={adjustRef}
                                    onChange={(event) => setAdjustRef(event.target.value)}
                                    placeholder="INV-1001 / Bank Ref"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="credit-notes">Internal notes</Label>
                                <Textarea
                                    id="credit-notes"
                                    value={adjustNotes}
                                    onChange={(event) => setAdjustNotes(event.target.value)}
                                    placeholder="Optional reference for the finance team"
                                />
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsAdjustDialogOpen(false)}
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isSubmitting || !adjustAmount}>
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                                    Save Adjustment
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </AppShell>
    )
}
