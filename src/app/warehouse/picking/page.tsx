"use client"

import { useEffect, useMemo, useState } from "react"
import {
    Package, CheckCircle, Clock, AlertTriangle, User, Search,
    ClipboardCheck, ArrowRight, MapPin
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"

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

const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: "Pending", color: "bg-gray-100 text-gray-700" },
    in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
    completed: { label: "Completed", color: "bg-green-100 text-green-700" },
    cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
}

const priorityConfig: Record<string, { label: string; color: string }> = {
    high: { label: "High", color: "bg-red-100 text-red-700" },
    normal: { label: "Normal", color: "bg-blue-100 text-blue-700" },
    low: { label: "Low", color: "bg-gray-100 text-gray-700" },
}

export default function WarehousePickingPage() {
    const [pickLists, setPickLists] = useState<PickList[]>([])
    const [loading, setLoading] = useState(true)
    const [savingItemId, setSavingItemId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const [selectedPickId, setSelectedPickId] = useState<string | null>(null)

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
        <AppShell title="Warehouse Picking" breadcrumbs={[{ label: "Warehouse" }, { label: "Picking" }]}>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Pick Queue</h1>
                    <p className="text-muted-foreground">Manage warehouse pick lists and order fulfillment</p>
                </div>

                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-4">
                    {[
                        { label: "Total Picks", value: stats.total, icon: ClipboardCheck, color: "text-blue-600 bg-blue-50" },
                        { label: "Pending", value: stats.pending, icon: Clock, color: "text-orange-600 bg-orange-50" },
                        { label: "In Progress", value: stats.inProgress, icon: Package, color: "text-indigo-600 bg-indigo-50" },
                        { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
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
                        <Input placeholder="Search picks..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Pick List Cards */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Pick Lists</h3>
                        {loading ? (
                            <Card>
                                <CardContent className="p-8 text-center text-muted-foreground">
                                    Loading pick lists...
                                </CardContent>
                            </Card>
                        ) : filtered.map(pl => {
                            const progress = getPickProgress(pl)
                            return (
                                <Card key={pl.id}
                                    className={`cursor-pointer transition-all hover:shadow-md ${selectedPick?.id === pl.id ? "ring-2 ring-emerald-500" : ""}`}
                                    onClick={() => setSelectedPickId(pl.id)}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="font-semibold">{pl.pickNumber}</p>
                                                <p className="text-sm text-muted-foreground">{pl.orderNumber} • {pl.customerName}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge className={priorityConfig[pl.priority]?.color}>
                                                    {priorityConfig[pl.priority]?.label}
                                                </Badge>
                                                <Badge className={statusConfig[pl.status]?.color}>
                                                    {statusConfig[pl.status]?.label}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Progress value={progress} className="flex-1 h-2" />
                                            <span className="text-sm font-medium text-muted-foreground w-12 text-right">{progress}%</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
                                            <span>{pl.items.length} items</span>
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
                            <Card>
                                <CardContent className="p-8 text-center text-muted-foreground">
                                    <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No pick lists found</p>
                                </CardContent>
                            </Card>
                        )}
                        {error && (
                            <Card className="border-red-200">
                                <CardContent className="p-4 text-sm text-red-600">
                                    {error}
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Pick Detail */}
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Pick Details</h3>
                        {selectedPick ? (
                            <Card>
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-base">{selectedPick.pickNumber}</CardTitle>
                                            <CardDescription>{selectedPick.orderNumber} • {selectedPick.customerName}</CardDescription>
                                        </div>
                                        <Badge className={statusConfig[selectedPick.status]?.color}>
                                            {statusConfig[selectedPick.status]?.label}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Product</TableHead>
                                                <TableHead>Location</TableHead>
                                                <TableHead className="text-center">Required</TableHead>
                                                <TableHead className="text-center">Picked</TableHead>
                                                <TableHead className="w-24"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {selectedPick.items.map(item => (
                                                <TableRow key={item.id}>
                                                    <TableCell>
                                                        <div>
                                                            <p className="font-medium text-sm">{item.productName}</p>
                                                            <p className="text-xs text-muted-foreground">{item.sku}</p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1 text-sm">
                                                            <MapPin className="h-3 w-3" /> {item.location}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center font-medium">{item.requiredQty}</TableCell>
                                                    <TableCell className="text-center">
                                                        <span className={item.pickedQty >= item.requiredQty ? "text-green-600 font-bold" : ""}>
                                                            {item.pickedQty}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.status === "picked" ? (
                                                            <Badge className="bg-green-100 text-green-700">
                                                                <CheckCircle className="h-3 w-3 mr-1" /> Done
                                                            </Badge>
                                                        ) : (
                                                            <Button size="sm" variant="outline"
                                                                disabled={savingItemId === item.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    pickItem(selectedPick.id, item.id, item.requiredQty - item.pickedQty)
                                                                }}>
                                                                {savingItemId === item.id ? "Saving..." : "Pick All"}
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        ) : (
                            <Card>
                                <CardContent className="p-8 text-center text-muted-foreground">
                                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                    <p>Select a pick list to view details</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </AppShell>
    )
}
