"use client"

import { useEffect, useMemo, useState } from "react"
import { Edit, MoreHorizontal, Plus, Search, Trash2, Warehouse } from "lucide-react"
import { toast } from "sonner"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AUSTRALIAN_STATES, type AustralianState } from "@/lib/types"

type LocationRecord = {
  id: string
  name: string
  code: string
  location: string
  address?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  capacity?: number | null
  status: string
  isDefault: boolean
  totalValue?: number
  productCount?: number
}

export default function WarehousesPage() {
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<LocationRecord | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    location: "",
    address: "",
    city: "",
    state: "NSW" as AustralianState,
    postcode: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    capacity: "",
    status: "active",
    isDefault: false,
  })

  async function fetchLocations() {
    setLoading(true)
    try {
      const response = await fetch("/api/warehouses")
      const payload = await response.json()
      if (payload.success) {
        setLocations(payload.data || [])
      }
    } catch (error) {
      console.error("Error fetching locations:", error)
      toast.error("Unable to load locations")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchLocations()
  }, [])

  const filteredLocations = useMemo(() => {
    const query = search.toLowerCase()
    return locations.filter((location) => {
      return (
        location.name.toLowerCase().includes(query) ||
        location.code.toLowerCase().includes(query) ||
        (location.city || "").toLowerCase().includes(query) ||
        (location.location || "").toLowerCase().includes(query)
      )
    })
  }, [locations, search])

  function resetForm() {
    setFormData({
      name: "",
      code: "",
      location: "",
      address: "",
      city: "",
      state: "NSW",
      postcode: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      capacity: "",
      status: "active",
      isDefault: false,
    })
    setSelectedLocation(null)
  }

  function openCreateDialog() {
    resetForm()
    setDialogOpen(true)
  }

  function openEditDialog(location: LocationRecord) {
    setSelectedLocation(location)
    setFormData({
      name: location.name,
      code: location.code,
      location: location.location,
      address: location.address || "",
      city: location.city || "",
      state: (location.state as AustralianState) || "NSW",
      postcode: location.postcode || "",
      contactName: location.contactName || "",
      contactPhone: location.contactPhone || "",
      contactEmail: location.contactEmail || "",
      capacity: location.capacity ? String(location.capacity) : "",
      status: location.status,
      isDefault: Boolean(location.isDefault),
    })
    setDialogOpen(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const url = selectedLocation ? `/api/warehouses/${selectedLocation.id}` : "/api/warehouses"
      const method = selectedLocation ? "PATCH" : "POST"
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          capacity: formData.capacity ? Number(formData.capacity) : null,
        }),
      })
      const payload = await response.json()
      if (!payload.success) {
        throw new Error(payload.error || "Failed to save location")
      }

      toast.success(selectedLocation ? "Location updated" : "Location created")
      setDialogOpen(false)
      resetForm()
      await fetchLocations()
    } catch (error) {
      console.error("Error saving location:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save location")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(location: LocationRecord) {
    try {
      const response = await fetch(`/api/warehouses/${location.id}`, { method: "DELETE" })
      const payload = await response.json()
      if (!payload.success) {
        throw new Error(payload.error || "Failed to delete location")
      }

      toast.success("Location removed")
      await fetchLocations()
    } catch (error) {
      console.error("Error deleting location:", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete location")
    }
  }

  const activeLocations = locations.filter((location) => location.status === "active").length
  const defaultLocations = locations.filter((location) => location.isDefault).length

  return (
    <AppShell title="Locations" breadcrumbs={[{ label: "Locations" }]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
            <p className="text-muted-foreground">Create and manage multiple warehouses or operating locations across the business.</p>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Location
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total locations</CardDescription>
              <CardTitle className="text-2xl">{locations.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active locations</CardDescription>
              <CardTitle className="text-2xl">{activeLocations}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Default ship location</CardDescription>
              <CardTitle className="text-2xl">{defaultLocations}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, code, city, or location..."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational locations</CardTitle>
            <CardDescription>These locations are used by inventory, purchasing, picking, and delivery routing.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stock Lines</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Loading locations...
                    </TableCell>
                  </TableRow>
                ) : filteredLocations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No locations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLocations.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                            <Warehouse className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{location.name}</p>
                              {location.isDefault && <Badge variant="outline">Default</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{location.location}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{location.code}</TableCell>
                      <TableCell>
                        {[location.address, location.city, location.state, location.postcode]
                          .filter(Boolean)
                          .join(", ") || "No address"}
                      </TableCell>
                      <TableCell>
                        <Badge className={location.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>
                          {location.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{location.productCount || 0}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(location)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => void handleDelete(location)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{selectedLocation ? "Edit Location" : "Add Location"}</DialogTitle>
              <DialogDescription>
                Use multiple locations for stock, purchasing, routing, and fulfillment control.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} required />
                </div>
                <div className="space-y-2">
                  <Label>Internal Location Label</Label>
                  <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Select value={formData.state} onValueChange={(value) => setFormData({ ...formData, state: value as AustralianState })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUSTRALIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Postcode</Label>
                  <Input value={formData.postcode} onChange={(e) => setFormData({ ...formData, postcode: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input value={formData.contactPhone} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Email</Label>
                  <Input value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Capacity</Label>
                  <Input value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="rounded"
                />
                Make this the default location for new purchasing and fulfillment flows
              </label>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                  {saving ? "Saving..." : selectedLocation ? "Save Location" : "Create Location"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
