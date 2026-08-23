"use client"

import { useEffect, useMemo, useState } from "react"
import { Edit, MoreHorizontal, Plus, Search, Trash2, Warehouse, MapPin, Phone, Mail } from "lucide-react"
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
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
    if (!confirm(`Are you sure you want to delete ${location.name}?`)) return
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
        <PageHeader
          title="Locations & Warehouses"
          description="Create and manage multi-site storage locations, fulfillment facilities, and primary dispatch hubs."
          actions={
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Location
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            title="Total Locations"
            value={locations.length}
            description="Configured warehouses"
            icon={Warehouse}
          />
          <KpiCard
            title="Active Facilities"
            value={activeLocations}
            description="Receiving & shipping"
            icon={Warehouse}
          />
          <KpiCard
            title="Default Dispatch Hub"
            value={defaultLocations}
            description="Primary fulfillment site"
            icon={Warehouse}
          />
        </div>

        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 text-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, code, city, or location..."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground">Operational Locations</CardTitle>
            <CardDescription className="text-xs">
              These facilities are designated for stock holdings, purchase order receipts, order picking, and transport dispatch.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold">Location</TableHead>
                  <TableHead className="font-semibold">Code</TableHead>
                  <TableHead className="font-semibold">Physical Address</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-center">Stock Lines</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                      Loading warehouse locations...
                    </TableCell>
                  </TableRow>
                ) : filteredLocations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12">
                      <EmptyState
                        icon={Warehouse}
                        title="No locations found"
                        description="No facilities match your search query."
                        action={
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openCreateDialog}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Location
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLocations.map((location) => (
                    <TableRow key={location.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
                            <Warehouse className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm text-foreground">{location.name}</p>
                              {location.isDefault && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Default Hub</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{location.location}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-foreground">{location.code}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {[location.address, location.city, location.state, location.postcode]
                          .filter(Boolean)
                          .join(", ") || "No address specified"}
                      </TableCell>
                      <TableCell>
                        {location.status === "active" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-medium">active</Badge>
                        ) : (
                          <Badge variant="secondary" className="font-medium">{location.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm font-semibold text-foreground">{location.productCount || 0}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEditDialog(location)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void handleDelete(location)}>
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

        {/* Add/Edit Location Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedLocation ? "Edit Location" : "Add Warehouse Location"}</DialogTitle>
              <DialogDescription>
                Configure warehouse parameters, state jurisdiction, contacts, and default status.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Location Name *</Label>
                  <Input
                    placeholder="e.g. Sydney Central DC"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Location Code *</Label>
                  <Input
                    placeholder="e.g. SYD-01"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Internal Location Label *</Label>
                  <Input
                    placeholder="e.g. Building 3, Alexandria Industrial Estate"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Street Address</Label>
                  <Input
                    placeholder="e.g. 142 Botany Rd"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">City / Suburb</Label>
                  <Input
                    placeholder="e.g. Alexandria"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">State</Label>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs">Postcode</Label>
                    <Input
                      placeholder="2015"
                      value={formData.postcode}
                      onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Facility Contact Name</Label>
                  <Input
                    placeholder="e.g. John Smith"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact Phone</Label>
                  <Input
                    placeholder="e.g. 02 9123 4567"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact Email</Label>
                  <Input
                    type="email"
                    placeholder="warehouse@company.com.au"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
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

              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground mt-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="rounded border-border h-4 w-4"
                />
                <Label htmlFor="isDefault" className="text-xs font-normal cursor-pointer">
                  Make this the default location for new purchase order receipts and dispatch fulfillment
                </Label>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={saving}>
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
