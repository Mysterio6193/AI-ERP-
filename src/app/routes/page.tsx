"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Truck, MapPin, Clock, CheckCircle, User, Phone, Navigation,
  AlertCircle, Loader2, RefreshCw
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
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

const routeStatusConfig: Record<string, { label: string; color: string }> = {
  planned: { label: "Planned", color: "bg-gray-100 text-gray-700" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
}

const stopStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700" },
  en_route: { label: "En Route", color: "bg-blue-100 text-blue-700" },
  arrived: { label: "Arrived", color: "bg-cyan-100 text-cyan-700" },
  in_transit: { label: "In Transit", color: "bg-blue-100 text-blue-700" },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-700" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700" },
  returned: { label: "Returned", color: "bg-amber-100 text-amber-700" },
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
    <AppShell title="Routes & Delivery" breadcrumbs={[{ label: "Routes & Delivery" }]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Routes & Delivery</h1>
            <p className="text-muted-foreground">Manage driver assignments, live delivery progress, and courier operations.</p>
          </div>
          <div className="flex gap-3">
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-[190px]">
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
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Routes</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void fetchRoutes()} disabled={loading || saving}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Total Routes", value: stats.totalRoutes, icon: Navigation, color: "text-blue-600 bg-blue-50" },
            { label: "Active Routes", value: stats.activeRoutes, icon: Truck, color: "text-indigo-600 bg-indigo-50" },
            { label: "Stops Scheduled", value: stats.totalStops, icon: MapPin, color: "text-orange-600 bg-orange-50" },
            { label: "Stops Delivered", value: stats.deliveredStops, icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
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

        {error && (
          <Card className="border-red-200">
            <CardContent className="p-4 text-sm text-red-600">{error}</CardContent>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Route Queue</h2>
            {loading ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">Loading routes...</CardContent>
              </Card>
            ) : filteredRoutes.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">No routes match the current filters.</CardContent>
              </Card>
            ) : (
              filteredRoutes.map((route) => (
                <Card
                  key={route.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${selectedRoute?.id === route.id ? "ring-2 ring-emerald-500" : ""}`}
                  onClick={() => setSelectedRouteId(route.id)}
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{route.name}</p>
                        <p className="text-sm text-muted-foreground">{route.routeNumber}</p>
                      </div>
                      <Badge className={routeStatusConfig[route.status]?.color}>
                        {routeStatusConfig[route.status]?.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={route.progress} className="h-2 flex-1" />
                      <span className="w-12 text-right text-sm font-medium text-muted-foreground">{route.progress}%</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {route.driverName}</span>
                      <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> {route.vehicle}</span>
                      <span>{route.totalStops} stops</span>
                      <span>{route.totalWeight.toFixed(0)} kg</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">Route Detail</h2>
            {selectedRoute ? (
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle>{selectedRoute.name}</CardTitle>
                      <CardDescription>
                        {new Date(selectedRoute.routeDate).toLocaleDateString()} • {selectedRoute.warehouseName}
                      </CardDescription>
                    </div>
                    <Badge className={routeStatusConfig[selectedRoute.status]?.color}>
                      {routeStatusConfig[selectedRoute.status]?.label}
                    </Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Assigned Driver</label>
                      <Select value={assignedDriverId} onValueChange={setAssignedDriverId}>
                        <SelectTrigger>
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
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Vehicle</label>
                      <Input value={vehicleDraft} onChange={(event) => setVehicleDraft(event.target.value)} placeholder="Van 1 / Bike 4 / Outsourced courier" />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={saving}
                        onClick={() => void updateRoute(selectedRoute.id, {
                          driverId: assignedDriverId === "unassigned" ? null : assignedDriverId,
                          vehicle: vehicleDraft,
                        })}
                      >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Assignment
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={saving || selectedRoute.status === "planned"}
                      onClick={() => void updateRoute(selectedRoute.id, { status: "planned" })}
                    >
                      Set Planned
                    </Button>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={saving || selectedRoute.status === "in_progress"}
                      onClick={() => void updateRoute(selectedRoute.id, { status: "in_progress" })}
                    >
                      Start Route
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={saving || selectedRoute.status === "completed"}
                      onClick={() => void updateRoute(selectedRoute.id, { status: "completed" })}
                    >
                      Complete Route
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {selectedRoute.stops.map((stop) => (
                      <div key={stop.id} className="rounded-xl border bg-white p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                                {stop.sequence}
                              </span>
                              <p className="font-semibold">{stop.customerName}</p>
                              <Badge className={stopStatusConfig[stop.status]?.color}>
                                {stopStatusConfig[stop.status]?.label}
                              </Badge>
                            </div>
                            <p className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              {stop.address}, {stop.city} {stop.state} {stop.postcode}
                            </p>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span>{stop.orderNumber}</span>
                              <span>{stop.items} items</span>
                              <span>{stop.weight.toFixed(0)} kg</span>
                              {stop.contactPhone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {stop.contactPhone}</span> : null}
                              {stop.scheduledTime ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {stop.scheduledTime}</span> : null}
                            </div>
                            {stop.receivedBy ? (
                              <p className="text-xs text-emerald-700">Received by {stop.receivedBy}</p>
                            ) : null}
                            {stop.codAmount > 0 ? (
                              <p className="text-xs text-amber-700">
                                COD {stop.codAmount.toFixed(2)} {stop.codCollected ? "collected" : "pending"}
                              </p>
                            ) : null}
                            {stop.notes ? <p className="text-xs text-muted-foreground">{stop.notes}</p> : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {stop.status !== "en_route" && stop.status !== "arrived" && stop.status !== "delivered" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={saving}
                                onClick={() => void updateDelivery(stop.id, { status: "en_route" })}
                              >
                                Mark En Route
                              </Button>
                            ) : null}
                            {stop.status === "en_route" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={saving}
                                onClick={() => void updateDelivery(stop.id, { status: "arrived" })}
                              >
                                Mark Arrived
                              </Button>
                            ) : null}
                            {stop.status !== "delivered" ? (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                disabled={saving}
                                onClick={() => void updateDelivery(stop.id, { status: "delivered", receivedBy: stop.contactName || stop.customerName })}
                              >
                                Mark Delivered
                              </Button>
                            ) : null}
                            {stop.status !== "failed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={saving}
                                onClick={() => void updateDelivery(stop.id, { status: "failed", notes: "Delivery exception recorded from dispatcher." })}
                              >
                                Mark Failed
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <Separator className="my-4" />
                        <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                          <span>Delivery: {stop.deliveryNumber}</span>
                          <span>Scheduled: {new Date(stop.scheduledDate).toLocaleDateString()}</span>
                          <span>Recipient: {stop.receivedBy || "Pending"}</span>
                          <span>Courier Workflow Ready</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <AlertCircle className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  Select a route to manage assignments and live stops.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
