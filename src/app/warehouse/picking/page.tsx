"use client"

import { useEffect, useMemo, useState } from "react"
import {
    Package, CheckCircle, Clock, AlertTriangle, User, Search,
    ClipboardCheck, ArrowRight, MapPin, Loader2, Truck, RefreshCw
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"

interface PickItem {
    id: string; productName: string; sku: string; location: string
    requiredQty: number; pickedQty: number; status: string
}

interface PickList {
    id: string; pickNumber: string; orderNumber: string
    orderId: string
    customerName: string; assignedTo: string | null
    status: string; priority: string
    items: PickItem[]; createdAt: string
    progress: number
}

const statusConfig: Record<string, { label: string; badgeClass: string }> = {
    pending: { label: "Pending", badgeClass: "bg-muted text-muted-foreground border-border" },
    in_progress: { label: "In Progress", badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
    completed: { label: "Completed", badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
    cancelled: { label: "Cancelled", badgeClass: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" },
}

const priorityConfig: Record<string, { label: string; badgeClass: string }> = {
    high: { label: "High Priority", badgeClass: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" },
    normal: { label: "Normal", badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
    low: { label: "Low", badgeClass: "bg-muted text-muted-foreground border-border" },
}

export default function WarehousePickingPage() {
    const { toast } = useToast()
    const [pickLists, setPickLists] = useState<PickList[]>([])
    const [loading, setLoading] = useState(true)
    const [savingItemId, setSavingItemId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const [selectedPickId, setSelectedPickId] = useState<string | null>(null)

    // Dispatch & 3PL Logistics modal state
    const [dispatchModalOpen, setDispatchModalOpen] = useState(false)
    const [dispatchPick, setDispatchPick] = useState<PickList | null>(null)
    const [logisticsMode, setLogisticsMode] = useState<"3pl" | "fleet">("3pl")
    const [selectedCarrier, setSelectedCarrier] = useState("Australia Post eParcel")
    const [consignmentNumber, setConsignmentNumber] = useState("")
    const [cartonCount, setCartonCount] = useState(1)
    const [carrierInstructions, setCarrierInstructions] = useState("")
    const [fleetRoute, setFleetRoute] = useState("RT-2026-001")
    const [dispatchingBusy, setDispatchingBusy] = useState(false)

    useEffect(() => {
        if (dispatchPick) {
            setConsignmentNumber(`AP-${Math.floor(10000000 + Math.random() * 90000000)}AU`)
        }
    }, [dispatchPick])

    async function handleCompleteDispatch() {
        if (!dispatchPick) return
        try {
            setDispatchingBusy(true)
            const response = await fetch(`/api/orders/${dispatchPick.orderId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "dispatched",
                    internalNotes: logisticsMode === "3pl"
                        ? `Dispatched via ${selectedCarrier} (Consignment: ${consignmentNumber}, ${cartonCount} cartons). Instructions: ${carrierInstructions || "None"}`
                        : `Assigned to internal fleet route ${fleetRoute}`,
                }),
            })
            const data = await response.json()
            if (!data.success) {
                toast({
                    title: "Dispatch Failed",
                    description: data.error || "Could not dispatch order.",
                    variant: "destructive",
                })
                return
            }

            toast({
                title: "Order Dispatched",
                description: `Order ${dispatchPick.orderNumber} dispatched via ${logisticsMode === "3pl" ? selectedCarrier : fleetRoute}.`,
            })
            setDispatchModalOpen(false)
            await fetchPickLists()
        } catch (err) {
            console.error(err)
            toast({
                title: "Error",
                description: "An unexpected error occurred during dispatch.",
                variant: "destructive",
            })
        } finally {
            setDispatchingBusy(false)
        }
    }

    useEffect(() => {
        void fetchPickLists()
    }, [])

    async function fetchPickLists() {
        try {
            setLoading(true)
            setError(null)
            const response = await fetch("/api/pick-lists")
            const data = await response.json()

            if (!data.success) {
                throw new Error(data.error || "Failed to fetch pick lists")
            }

            setPickLists(data.data)
            setSelectedPickId((current) => current || data.data[0]?.id || null)
        } catch (fetchError) {
            console.error(fetchError)
            setError("Unable to load pick lists right now.")
        } finally {
            setLoading(false)
        }
    }

    const selectedPick = useMemo(
        () => pickLists.find((pickList) => pickList.id === selectedPickId) || null,
        [pickLists, selectedPickId]
    )

    function getPickProgress(pick: PickList) {
        return pick.progress
    }

    async function pickItem(pickId: string, itemId: string, qty: number) {
        try {
            setSavingItemId(itemId)
            setError(null)

            const response = await fetch(`/api/pick-lists/${pickId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemId, incrementBy: qty }),
            })

            const data = await response.json()

            if (!data.success) {
                throw new Error(data.error || "Failed to update pick list")
            }

            await fetchPickLists()
        } catch (saveError) {
            console.error(saveError)
            setError("Unable to update pick progress right now.")
        } finally {
            setSavingItemId(null)
        }
    }

    const filtered = pickLists.filter(pl => {
        const matchSearch = pl.pickNumber.toLowerCase().includes(search.toLowerCase()) ||
            pl.customerName.toLowerCase().includes(search.toLowerCase()) ||
            pl.orderNumber.toLowerCase().includes(search.toLowerCase())
        const matchStatus = statusFilter === "all" || pl.status === statusFilter
        return matchSearch && matchStatus
    })

    const stats = {
        total: pickLists.length,
        pending: pickLists.filter(p => p.status === "pending").length,
        inProgress: pickLists.filter(p => p.status === "in_progress").length,
        completed: pickLists.filter(p => p.status === "completed").length,
    }

    return (
        <AppShell title="Warehouse Picking" breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: "Picking Queue" }]}>
            <div className="space-y-6">
                <PageHeader
                    title="Warehouse Picking Floor"
                    description="Fulfill order batches, record bin picking, track wave progress, and dispatch shipments."
                    actions={
                        <Button variant="outline" size="sm" onClick={() => void fetchPickLists()} disabled={loading}>
                            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    }
                />

                {/* Stats */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                        title="Total Picks"
                        value={stats.total}
                        description="All active pick batches"
                        icon={ClipboardCheck}
                    />
                    <KpiCard
                        title="Pending Queue"
                        value={stats.pending}
                        description="Awaiting picker assignment"
                        icon={Clock}
                    />
                    <KpiCard
                        title="In Progress"
                        value={stats.inProgress}
                        description="Currently on warehouse floor"
                        icon={Package}
                    />
                    <KpiCard
                        title="Completed"
                        value={stats.completed}
                        description="Ready for pack & dispatch"
                        icon={CheckCircle}
                    />
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search by pick #, order #, or customer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 text-xs" />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-6 lg:grid-cols-12">
                    {/* Pick List Cards */}
                    <div className="space-y-3 lg:col-span-5">
                        <h3 className="text-sm font-semibold tracking-tight text-foreground">Pick Lists ({filtered.length})</h3>
                        {loading ? (
                            <Card className="shadow-sm">
                                <CardContent className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center">
                                    <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
                                    Loading pick lists...
                                </CardContent>
                            </Card>
                        ) : filtered.map(pl => {
                            const progress = getPickProgress(pl)
                            const isSelected = selectedPick?.id === pl.id
                            return (
                                <Card
                                    key={pl.id}
                                    className={`cursor-pointer transition-all border shadow-sm hover:shadow-md ${isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : "border-border hover:border-primary/40"}`}
                                    onClick={() => setSelectedPickId(pl.id)}
                                >
                                    <CardContent className="p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-semibold text-sm text-foreground">{pl.pickNumber}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{pl.orderNumber} • <span className="text-foreground font-medium">{pl.customerName}</span></p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5 justify-end">
                                                <Badge variant="outline" className={`text-[10px] ${priorityConfig[pl.priority]?.badgeClass || ""}`}>
                                                    {priorityConfig[pl.priority]?.label || pl.priority}
                                                </Badge>
                                                <Badge variant="outline" className={`text-[10px] ${statusConfig[pl.status]?.badgeClass || ""}`}>
                                                    {statusConfig[pl.status]?.label || pl.status}
                                                </Badge>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Pick Progress</span>
                                                <span className="font-semibold text-foreground">{progress}%</span>
                                            </div>
                                            <Progress value={progress} className="h-1.5" />
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                                            <span>{pl.items.length} line items</span>
                                            <span className="flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                {pl.assignedTo || "Unassigned"}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                        {!loading && filtered.length === 0 && (
                            <EmptyState
                                icon={ClipboardCheck}
                                title="No pick lists found"
                                description="Try adjusting your search query or status filter."
                            />
                        )}
                        {error && (
                            <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
                                <CardContent className="p-4 text-xs text-destructive font-medium">
                                    {error}
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Pick Detail */}
                    <div className="lg:col-span-7">
                        <h3 className="text-sm font-semibold tracking-tight text-foreground mb-3">Pick Items & Fulfillment</h3>
                        {selectedPick ? (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-3 border-b">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <CardTitle className="text-base flex items-center gap-2">
                                                <Package className="h-4 w-4 text-primary" />
                                                {selectedPick.pickNumber}
                                            </CardTitle>
                                            <CardDescription className="mt-1">
                                                Order: <span className="font-mono font-medium text-foreground">{selectedPick.orderNumber}</span> • Customer: <span className="font-medium text-foreground">{selectedPick.customerName}</span>
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline" className={`text-xs ${statusConfig[selectedPick.status]?.badgeClass || ""}`}>
                                            {statusConfig[selectedPick.status]?.label || selectedPick.status}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Product</TableHead>
                                                <TableHead>Bin Location</TableHead>
                                                <TableHead className="text-center">Required</TableHead>
                                                <TableHead className="text-center">Picked</TableHead>
                                                <TableHead className="w-28 text-right pr-4">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {selectedPick.items.map(item => (
                                                <TableRow key={item.id} className="hover:bg-muted/40">
                                                    <TableCell>
                                                        <div>
                                                            <p className="font-medium text-xs text-foreground">{item.productName}</p>
                                                            <p className="font-mono text-[11px] text-muted-foreground">{item.sku}</p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                                                            <MapPin className="h-3.5 w-3.5 text-primary" /> {item.location}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center font-medium text-xs">{item.requiredQty}</TableCell>
                                                    <TableCell className="text-center text-xs">
                                                        <span className={item.pickedQty >= item.requiredQty ? "text-emerald-600 dark:text-emerald-400 font-bold" : "font-medium"}>
                                                            {item.pickedQty}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right pr-4">
                                                        {item.status === "picked" ? (
                                                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[11px]">
                                                                <CheckCircle className="h-3 w-3 mr-1" /> Picked
                                                            </Badge>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-xs"
                                                                disabled={savingItemId === item.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    pickItem(selectedPick.id, item.id, item.requiredQty - item.pickedQty)
                                                                }}
                                                            >
                                                                {savingItemId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pick All"}
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>

                                    {/* Action & Logistics Dispatch Bar */}
                                    <div className="m-4 rounded-xl border bg-muted/30 p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Logistics & Order Dispatch</p>
                                                <p className="text-xs text-muted-foreground">Assign to internal driver fleet or hand off to a 3PL freight carrier.</p>
                                            </div>
                                            <Badge variant="outline" className="text-xs bg-background">
                                                {selectedPick.items.every(i => i.pickedQty >= i.requiredQty) ? "✓ 100% Picked" : "In Progress"}
                                            </Badge>
                                        </div>

                                        <div className="flex flex-wrap gap-2 pt-1">
                                            <Button
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                                                onClick={() => {
                                                    setDispatchPick(selectedPick)
                                                    setDispatchModalOpen(true)
                                                }}
                                            >
                                                <Package className="h-4 w-4 mr-1.5" /> Dispatch & 3PL Logistics
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <EmptyState
                                icon={Package}
                                title="No pick list selected"
                                description="Select a pick list from the left pane to view items and record picks."
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Dispatch & 3PL Logistics Assignment Modal */}
            <Dialog open={dispatchModalOpen} onOpenChange={setDispatchModalOpen}>
                <DialogContent className="max-w-xl">
                    {dispatchPick && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Package className="h-5 w-5 text-emerald-600" />
                                    Dispatch Order {dispatchPick.orderNumber}
                                </DialogTitle>
                                <DialogDescription>
                                    Fulfill {dispatchPick.customerName} via internal driver fleet or 3PL freight carrier.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold">Logistics Fulfillment Method</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            className={`rounded-xl border p-3.5 text-left transition-all ${logisticsMode === "3pl" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card hover:bg-muted/40"}`}
                                            onClick={() => setLogisticsMode("3pl")}
                                        >
                                            <p className="font-semibold text-sm text-foreground">📦 3PL Carrier Freight</p>
                                            <p className="text-xs text-muted-foreground mt-1">AusPost, StarTrack, Toll, Direct Freight</p>
                                        </button>
                                        <button
                                            type="button"
                                            className={`rounded-xl border p-3.5 text-left transition-all ${logisticsMode === "fleet" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card hover:bg-muted/40"}`}
                                            onClick={() => setLogisticsMode("fleet")}
                                        >
                                            <p className="font-semibold text-sm text-foreground">🚚 Internal Driver Route</p>
                                            <p className="text-xs text-muted-foreground mt-1">Driver PWA, run sheet & stop navigation</p>
                                        </button>
                                    </div>
                                </div>

                                {logisticsMode === "3pl" ? (
                                    <div className="space-y-3 rounded-xl border bg-muted/20 p-3.5">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-medium">Select 3PL Carrier</Label>
                                            <Select value={selectedCarrier} onValueChange={setSelectedCarrier}>
                                                <SelectTrigger className="bg-background text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Australia Post eParcel">Australia Post eParcel (Standard/Express)</SelectItem>
                                                    <SelectItem value="StarTrack Express">StarTrack Express (Road/Next Flight)</SelectItem>
                                                    <SelectItem value="Toll Group Logistics">Toll Group Logistics (Pallet/Courier)</SelectItem>
                                                    <SelectItem value="Direct Freight Express">Direct Freight Express (Metro/Interstate)</SelectItem>
                                                    <SelectItem value="TNT / FedEx Express">TNT / FedEx Express (Air Priority)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-medium">Consignment / Tracking #</Label>
                                                <Input
                                                    className="bg-background font-mono text-xs"
                                                    value={consignmentNumber}
                                                    onChange={e => setConsignmentNumber(e.target.value)}
                                                    placeholder="e.g. AP-94829104AU"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-medium">Cartons / Pallets</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    className="bg-background text-xs"
                                                    value={cartonCount}
                                                    onChange={e => setCartonCount(parseInt(e.target.value) || 1)}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-medium">Special Carrier Instructions</Label>
                                            <Input
                                                className="bg-background text-xs"
                                                value={carrierInstructions}
                                                onChange={e => setCarrierInstructions(e.target.value)}
                                                placeholder="Authority to leave, tailgate delivery, dock 4"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3 rounded-xl border bg-muted/20 p-3.5">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-medium">Assign to Driver Route</Label>
                                            <Select value={fleetRoute} onValueChange={setFleetRoute}>
                                                <SelectTrigger className="bg-background text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="RT-2026-001">Route 1 — Dave Miller (Sydney Metro North)</SelectItem>
                                                    <SelectItem value="RT-2026-002">Route 2 — Sarah Jenkins (Sydney Metro West)</SelectItem>
                                                    <SelectItem value="RT-2026-003">Route 3 — Alex Taylor (CBD & Airport Express)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            Order will be scheduled into the driver's active run sequence in the Driver Mobile PWA.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <DialogFooter className="flex items-center justify-between gap-2">
                                <Button variant="outline" size="sm" onClick={() => setDispatchModalOpen(false)}>Cancel</Button>
                                <Button
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    disabled={dispatchingBusy}
                                    onClick={handleCompleteDispatch}
                                >
                                    {dispatchingBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Package className="h-4 w-4 mr-1.5" />}
                                    Complete Dispatch & Confirm
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </AppShell>
    )
}

