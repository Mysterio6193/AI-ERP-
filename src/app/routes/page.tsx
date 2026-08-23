"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Truck, MapPin, Clock, CheckCircle, User, Phone, Navigation,
  AlertCircle, Loader2, RefreshCw, Calendar, ArrowRight, ShieldCheck, Box
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

interface Driver {
  id: string
  name: string
  email: string
  phone?: string | null
}

interface DeliveryStop {
  id: string
  deliveryNumber: string
  orderId?: string | null
  orderNumber: string
  customerName: string
  address: string
  city: string
  state: string
  postcode: string
  contactName?: string | null
  contactPhone?: string | null
  status: string
  scheduledDate: string
  scheduledTime?: string | null
  receivedBy?: string | null
  codAmount: number
  codCollected: boolean
  notes?: string | null
  items: number
  weight: number
  sequence: number
}

interface RouteItem {
  id: string
  routeNumber: string
  name: string
  routeDate: string
  driverId?: string | null
  driverName: string
  driverPhone?: string | null
  vehicle: string
  warehouseName: string
  status: string
  totalStops: number
  completedStops: number
  totalDistance: number
  totalWeight: number
  progress: number
  stops: DeliveryStop[]
}

const routeStatusConfig: Record<string, { label: string; badgeClass: string }> = {
  planned: { label: "Planned", badgeClass: "bg-muted text-muted-foreground border-border" },
  in_progress: { label: "In Progress", badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  completed: { label: "Completed", badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  cancelled: { label: "Cancelled", badgeClass: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" },
}

const stopStatusConfig: Record<string, { label: string; badgeClass: string }> = {
  pending: { label: "Pending", badgeClass: "bg-muted text-muted-foreground border-border" },
  en_route: { label: "En Route", badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  arrived: { label: "Arrived", badgeClass: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20" },
  in_transit: { label: "In Transit", badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  delivered: { label: "Delivered", badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  failed: { label: "Failed", badgeClass: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20" },
  returned: { label: "Returned", badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
}

export default function RoutesPage() {
  const [routes, setRoutes] = useState<RouteItem[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [driverFilter, setDriverFilter] = useState("all")
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [vehicleDraft, setVehicleDraft] = useState("")
  const [assignedDriverId, setAssignedDriverId] = useState("unassigned")

  useEffect(() => {
    void fetchDrivers()
    void fetchRoutes()
  }, [])

  useEffect(() => {
    const route = routes.find((item) => item.id === selectedRouteId)
    if (!route) return
    setVehicleDraft(route.vehicle === "Vehicle not set" ? "" : route.vehicle)
    setAssignedDriverId(route.driverId || "unassigned")
  }, [routes, selectedRouteId])

  async function fetchDrivers() {
    try {
      const response = await fetch("/api/drivers")
      const data = await response.json()
      if (data.success) {
        setDrivers(data.data)
      }
    } catch (fetchError) {
      console.error(fetchError)
    }
  }

  async function fetchRoutes() {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/routes")
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch routes")
      }

      setRoutes(data.data)
      setSelectedRouteId((current) => current || data.data[0]?.id || null)
    } catch (fetchError) {
      console.error(fetchError)
      setError("Unable to load delivery routes right now.")
    } finally {
      setLoading(false)
    }
  }

  async function updateRoute(routeId: string, payload: Record<string, unknown>) {
    try {
      setSaving(true)
      setError(null)
      const response = await fetch(`/api/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to update route")
      }
      await fetchRoutes()
    } catch (updateError) {
      console.error(updateError)
      setError("Unable to update route right now.")
    } finally {
      setSaving(false)
    }
  }

  async function updateDelivery(deliveryId: string, payload: Record<string, unknown>) {
    try {
      setSaving(true)
      setError(null)
      const response = await fetch(`/api/deliveries/${deliveryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to update delivery")
      }
      await fetchRoutes()
    } catch (updateError) {
      console.error(updateError)
      setError("Unable to update delivery right now.")
    } finally {
      setSaving(false)
    }
  }

  const filteredRoutes = useMemo(() => {
    return routes.filter((route) => {
      const matchesStatus = statusFilter === "all" || route.status === statusFilter
      const matchesDriver = driverFilter === "all" || route.driverId === driverFilter
      return matchesStatus && matchesDriver
    })
  }, [driverFilter, routes, statusFilter])

  const selectedRoute = filteredRoutes.find((route) => route.id === selectedRouteId) || routes.find((route) => route.id === selectedRouteId) || null

  const stats = {
    totalRoutes: routes.length,
    activeRoutes: routes.filter((route) => route.status === "in_progress").length,
    totalStops: routes.reduce((sum, route) => sum + route.totalStops, 0),
    deliveredStops: routes.reduce((sum, route) => sum + route.completedStops, 0),
  }

  return (
    <AppShell title="Routes & Delivery" breadcrumbs={[{ label: "Logistics" }, { label: "Delivery Routes" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Routes & Fleet Delivery"
          description="Manage fleet driver assignments, live delivery progress, route optimization, and stop confirmations."
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger className="w-[170px] text-xs h-9">
                  <SelectValue placeholder="All drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Drivers</SelectItem>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Routes</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => void fetchRoutes()} disabled={loading || saving} className="h-9">
                {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                Refresh
              </Button>
            </div>
          }
        />

        {/* Metric Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Routes"
            value={stats.totalRoutes}
            description="Active delivery runs scheduled"
            icon={Navigation}
          />
          <KpiCard
            title="Active Routes"
            value={stats.activeRoutes}
            description="Currently in transit with drivers"
            icon={Truck}
          />
          <KpiCard
            title="Stops Scheduled"
            value={stats.totalStops}
            description="Customer drops on manifest"
            icon={MapPin}
          />
          <KpiCard
            title="Stops Delivered"
            value={stats.deliveredStops}
            description="Proof of delivery confirmed"
            icon={CheckCircle}
          />
        </div>

        {error && (
          <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
            <CardContent className="p-4 text-xs text-destructive font-medium">{error}</CardContent>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-12">
          {/* Route List Sidebar */}
          <div className="space-y-3 xl:col-span-4">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Route Queue ({filteredRoutes.length})</h2>
            {loading ? (
              <Card className="shadow-sm">
                <CardContent className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
                  Loading routes...
                </CardContent>
              </Card>
            ) : filteredRoutes.length === 0 ? (
              <EmptyState
                icon={Navigation}
                title="No routes found"
                description="No delivery routes match your selected driver or status filters."
              />
            ) : (
              filteredRoutes.map((route) => {
                const isSelected = selectedRoute?.id === route.id
                return (
                  <Card
                    key={route.id}
                    className={`cursor-pointer transition-all border shadow-sm hover:shadow-md ${isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : "border-border hover:border-primary/40"}`}
                    onClick={() => setSelectedRouteId(route.id)}
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-sm text-foreground">{route.name}</p>
                          <p className="text-xs font-mono text-muted-foreground mt-0.5">{route.routeNumber}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${routeStatusConfig[route.status]?.badgeClass || ""}`}>
                          {routeStatusConfig[route.status]?.label || route.status}
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Route Progress</span>
                          <span className="font-semibold text-foreground">{route.progress}%</span>
                        </div>
                        <Progress value={route.progress} className="h-1.5" />
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/50">
                        <span className="flex items-center gap-1.5 truncate">
                          <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{route.driverName}</span>
                        </span>
                        <span className="flex items-center gap-1.5 truncate">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{route.vehicle}</span>
                        </span>
                        <span>{route.totalStops} stops ({route.completedStops} done)</span>
                        <span>{route.totalWeight.toFixed(0)} kg total</span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>

          {/* Route Detail & Stops */}
          <div className="xl:col-span-8">
            <h2 className="text-sm font-semibold tracking-tight text-foreground mb-3">Route Detail & Delivery Stops</h2>
            {selectedRoute ? (
              <Card className="shadow-sm">
                <CardHeader className="space-y-4 pb-4 border-b">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Navigation className="h-5 w-5 text-primary" />
                        {selectedRoute.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Date: <span className="font-medium text-foreground">{new Date(selectedRoute.routeDate).toLocaleDateString()}</span> • Depot: <span className="font-medium text-foreground">{selectedRoute.warehouseName}</span> • Total Distance: <span className="font-mono text-foreground">{selectedRoute.totalDistance} km</span>
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={`text-xs ${routeStatusConfig[selectedRoute.status]?.badgeClass || ""}`}>
                      {routeStatusConfig[selectedRoute.status]?.label || selectedRoute.status}
                    </Badge>
                  </div>

                  {/* Assignment Controls */}
                  <div className="grid gap-3 rounded-xl border bg-muted/20 p-3.5 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Assigned Fleet Driver</Label>
                      <Select value={assignedDriverId} onValueChange={setAssignedDriverId}>
                        <SelectTrigger className="bg-background text-xs h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {drivers.map((driver) => (
                            <SelectItem key={driver.id} value={driver.id}>
                              {driver.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Vehicle Designation</Label>
                      <Input
                        className="bg-background text-xs h-8"
                        value={vehicleDraft}
                        onChange={(event) => setVehicleDraft(event.target.value)}
                        placeholder="Van 1 / Bike 4 / Courier"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        size="sm"
                        className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        disabled={saving}
                        onClick={() => void updateRoute(selectedRoute.id, {
                          driverId: assignedDriverId === "unassigned" ? null : assignedDriverId,
                          vehicle: vehicleDraft,
                        })}
                      >
                        {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
                        Save Assignment
                      </Button>
                    </div>
                  </div>

                  {/* Status Progression */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving || selectedRoute.status === "planned"}
                      onClick={() => void updateRoute(selectedRoute.id, { status: "planned" })}
                    >
                      Set Planned
                    </Button>
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={saving || selectedRoute.status === "in_progress"}
                      onClick={() => void updateRoute(selectedRoute.id, { status: "in_progress" })}
                    >
                      <Truck className="h-3.5 w-3.5 mr-1.5" /> Start Route
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={saving || selectedRoute.status === "completed"}
                      onClick={() => void updateRoute(selectedRoute.id, { status: "completed" })}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Complete Route
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Manifest Stops ({selectedRoute.stops.length})
                  </h4>
                  <div className="space-y-3">
                    {selectedRoute.stops.map((stop) => (
                      <div key={stop.id} className="rounded-xl border bg-card p-4 shadow-sm hover:border-primary/30 transition-all">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {stop.sequence}
                              </span>
                              <p className="font-semibold text-sm text-foreground">{stop.customerName}</p>
                              <Badge variant="outline" className={`text-[10px] ${stopStatusConfig[stop.status]?.badgeClass || ""}`}>
                                {stopStatusConfig[stop.status]?.label || stop.status}
                              </Badge>
                            </div>
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                              {stop.address}, {stop.city} {stop.state} {stop.postcode}
                            </p>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span className="font-mono">Order #{stop.orderNumber}</span>
                              <span>{stop.items} items</span>
                              <span>{stop.weight.toFixed(0)} kg</span>
                              {stop.contactPhone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {stop.contactPhone}</span> : null}
                              {stop.scheduledTime ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {stop.scheduledTime}</span> : null}
                            </div>
                            {stop.receivedBy ? (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Received by {stop.receivedBy}</p>
                            ) : null}
                            {stop.codAmount > 0 ? (
                              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                COD ${stop.codAmount.toFixed(2)} ({stop.codCollected ? "Collected" : "Pending"})
                              </p>
                            ) : null}
                            {stop.notes ? <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded-lg">{stop.notes}</p> : null}
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {stop.status !== "en_route" && stop.status !== "arrived" && stop.status !== "delivered" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={saving}
                                onClick={() => void updateDelivery(stop.id, { status: "en_route" })}
                              >
                                En Route
                              </Button>
                            ) : null}
                            {stop.status === "en_route" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={saving}
                                onClick={() => void updateDelivery(stop.id, { status: "arrived" })}
                              >
                                Arrived
                              </Button>
                            ) : null}
                            {stop.status !== "delivered" ? (
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={saving}
                                onClick={() => void updateDelivery(stop.id, { status: "delivered", receivedBy: stop.contactName || stop.customerName })}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" /> Delivered
                              </Button>
                            ) : null}
                            {stop.status !== "failed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                                disabled={saving}
                                onClick={() => void updateDelivery(stop.id, { status: "failed", notes: "Delivery exception recorded from dispatcher." })}
                              >
                                Failed
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <Separator className="my-3" />
                        <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
                          <span>Delivery Ref: <span className="font-mono">{stop.deliveryNumber}</span></span>
                          <span>Scheduled: {new Date(stop.scheduledDate).toLocaleDateString()}</span>
                          <span>Recipient: {stop.receivedBy || "Pending POD"}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Ready in Driver PWA</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={Navigation}
                title="No route selected"
                description="Select a route from the queue on the left to inspect stops and manage fleet assignments."
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

