"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, Loader2, MapPin, Pencil, Plus, RefreshCw, Send, Trash2, Truck, CheckCircle, Search, HelpCircle, ArrowRight } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/hooks/use-toast"

interface Zone {
  id: string
  name: string
  matchType: string
  matchValue: string
  priority: number
  leadTimeDays: number
  baseRate: number
  perKgRate: number
  minCharge: number
  enabled: boolean
}

interface FormField {
  key: string
  label: string
  required?: boolean
  source?: string
  default?: string
}

interface Carrier {
  id: string
  name: string
  tradingName: string | null
  abn: string | null
  contactName: string | null
  email: string | null
  phone: string | null
  bookingMethod: string
  bookingEmail: string | null
  portalUrl: string | null
  cutoffTime: string | null
  accountNumber: string | null
  bodySubject: string | null
  bodyTemplate: string | null
  enabled: boolean
  zones: Zone[]
  formFields: FormField[]
  hasCustomForm: boolean
  _count: { bookings: number }
}

interface FormSource {
  path: string
  label: string
  group: string
}

/** A blank carrier, so the form has one shape whether creating or editing. */
const EMPTY_CARRIER = {
  id: "",
  name: "",
  tradingName: "",
  abn: "",
  contactName: "",
  email: "",
  phone: "",
  bookingMethod: "email",
  bookingEmail: "",
  portalUrl: "",
  cutoffTime: "",
  accountNumber: "",
  bodySubject: "",
  bodyTemplate: "",
}

type CarrierDraft = typeof EMPTY_CARRIER

interface Booking {
  id: string
  bookingNumber: string
  status: string
  sentTo: string | null
  sentAt: string | null
  quotedPrice: number | null
  createdByAgent: boolean
  carrier: { name: string }
}

interface RouteMatch {
  carrier: string
  zone: string
  matchedOn: string
  leadTimeDays: number
  estimatedPrice: number | null
  bookingMethod: string
}

const MATCH_LABEL: Record<string, string> = {
  postcode: "Postcode",
  postcode_range: "Postcode range",
  state: "State",
  suburb: "Suburb",
}

function money(value: number | null) {
  return value === null ? "—" : `$${value.toFixed(2)}`
}

export default function CarriersPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState("carriers")
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [sources, setSources] = useState<FormSource[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  // Null when the editor is closed; a draft when creating or editing.
  const [editing, setEditing] = useState<CarrierDraft | null>(null)
  const [editingFields, setEditingFields] = useState<FormField[]>([])

  const [test, setTest] = useState({ postcode: "", state: "", city: "" })
  const [testResult, setTestResult] = useState<RouteMatch | null | "none">(null)

  const [newZone, setNewZone] = useState({
    matchType: "postcode",
    matchValue: "",
    name: "",
    priority: "100",
    leadTimeDays: "1",
  })

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const [carrierData, bookingData] = await Promise.all([
        fetch("/api/carriers").then((response) => response.json()),
        fetch("/api/carriers?view=bookings").then((response) => response.json()),
      ])

      if (carrierData.success) {
        setCarriers(carrierData.data.carriers)
        setSources(carrierData.data.sources)
      }
      if (bookingData.success) setBookings(bookingData.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const act = useCallback(
    async (payload: Record<string, unknown>, key: string) => {
      setActing(key)

      try {
        const response = await fetch("/api/carriers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        const result = await response.json()
        if (!result.success) {
          toast({
            variant: "destructive",
            title: "Carrier action failed",
            description: result.error || "Request failed",
          })
          return null
        }

        await load()
        toast({
          title: "Carrier updated",
          description: "Operation completed successfully.",
        })
        return result.data
      } finally {
        setActing(null)
      }
    },
    [load]
  )

  return (
    <AppShell title="Carriers & 3PL Freight" breadcrumbs={[{ label: "Logistics" }, { label: "Carriers" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Carriers & 3PL Logistics"
          description="Manage freight providers, zone rating matrices, automated booking templates, and route resolvers."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
              <Button
                size="sm"
                className="shadow-sm"
                onClick={() => {
                  setEditing({ ...EMPTY_CARRIER })
                  setEditingFields([])
                  setTab("carriers")
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Carrier
              </Button>
            </div>
          }
        />

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 sm:w-[400px]">
            <TabsTrigger value="carriers">Carriers ({carriers.length})</TabsTrigger>
            <TabsTrigger value="test">Test Routing</TabsTrigger>
            <TabsTrigger value="bookings">Bookings ({bookings.length})</TabsTrigger>
          </TabsList>

          {/* ---------------- Carriers ---------------- */}
          <TabsContent value="carriers" className="space-y-4">
            {editing ? (
              <Card className="border-primary/40 shadow-sm">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    {editing.id ? `Edit ${editing.name}` : "Create New Carrier"}
                  </CardTitle>
                  <CardDescription>
                    Configure contact parameters and custom booking payload fields. Service areas and rates are managed after saving.
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Carrier Legal Name *</Label>
                      <Input
                        value={editing.name}
                        onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                        placeholder="e.g. Australia Post"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Trading Name</Label>
                      <Input
                        value={editing.tradingName}
                        onChange={(event) => setEditing({ ...editing, tradingName: event.target.value })}
                        placeholder="e.g. AusPost eParcel"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">ABN</Label>
                      <Input
                        value={editing.abn}
                        onChange={(event) => setEditing({ ...editing, abn: event.target.value })}
                        placeholder="XX XXX XXX XXX"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Account Contact Person</Label>
                      <Input
                        value={editing.contactName}
                        onChange={(event) => setEditing({ ...editing, contactName: event.target.value })}
                        placeholder="Contact person"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">General Support Email</Label>
                      <Input
                        value={editing.email}
                        onChange={(event) => setEditing({ ...editing, email: event.target.value })}
                        placeholder="support@carrier.com.au"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone Number</Label>
                      <Input
                        value={editing.phone}
                        onChange={(event) => setEditing({ ...editing, phone: event.target.value })}
                        placeholder="1300 000 000"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[160px_1fr_120px_1fr]">
                    <div className="space-y-1">
                      <Label className="text-xs">Booking Protocol</Label>
                      <select
                        value={editing.bookingMethod}
                        onChange={(event) =>
                          setEditing({ ...editing, bookingMethod: event.target.value })
                        }
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="email">Book by email</option>
                        <option value="webform">Book on portal</option>
                        <option value="api">Book by API</option>
                      </select>
                    </div>

                    {editing.bookingMethod === "email" ? (
                      <div className="space-y-1">
                        <Label className="text-xs">Dispatch Booking Email *</Label>
                        <Input
                          value={editing.bookingEmail}
                          onChange={(event) =>
                            setEditing({ ...editing, bookingEmail: event.target.value })
                          }
                          placeholder="bookings@carrier.com.au"
                          className="h-8 text-xs"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-xs">Dispatch Portal URL</Label>
                        <Input
                          value={editing.portalUrl}
                          onChange={(event) => setEditing({ ...editing, portalUrl: event.target.value })}
                          placeholder="https://carrier.com.au/portal"
                          className="h-8 text-xs"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">Daily Cutoff</Label>
                      <Input
                        value={editing.cutoffTime}
                        onChange={(event) => setEditing({ ...editing, cutoffTime: event.target.value })}
                        placeholder="14:00"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Merchant Account #</Label>
                      <Input
                        value={editing.accountNumber}
                        onChange={(event) =>
                          setEditing({ ...editing, accountNumber: event.target.value })
                        }
                        placeholder="ACC-99482"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* ---- Booking form fields ---- */}
                  <div className="space-y-2.5 rounded-xl border bg-muted/20 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Custom Booking Form Schema</p>
                        <p className="text-[11px] text-muted-foreground">
                          {editingFields.length
                            ? "Each field value will be extracted from the order automatically."
                            : "Leave empty to use the standard SupplySure freight booking manifest."}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setEditingFields([
                            ...editingFields,
                            { key: `field${editingFields.length + 1}`, label: "", required: false, source: "" },
                          ])
                        }
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add Field
                      </Button>
                    </div>

                    {editingFields.map((field, index) => (
                      <div key={index} className="grid gap-1.5 sm:grid-cols-[1fr_1fr_1.2fr_auto_auto]">
                        <Input
                          value={field.label}
                          onChange={(event) => {
                            const next = [...editingFields]
                            next[index] = { ...field, label: event.target.value }
                            setEditingFields(next)
                          }}
                          placeholder="Label on their form"
                          className="h-7 text-xs bg-background"
                        />
                        <Input
                          value={field.key}
                          onChange={(event) => {
                            const next = [...editingFields]
                            next[index] = { ...field, key: event.target.value }
                            setEditingFields(next)
                          }}
                          placeholder="key_name"
                          className="h-7 font-mono text-xs bg-background"
                        />
                        <select
                          value={field.source || ""}
                          onChange={(event) => {
                            const next = [...editingFields]
                            next[index] = { ...field, source: event.target.value }
                            setEditingFields(next)
                          }}
                          className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                        >
                          <option value="">— fixed value —</option>
                          {["Order", "Customer", "Delivery", "Pickup"].map((group) => (
                            <optgroup key={group} label={group}>
                              {sources
                                .filter((source) => source.group === group)
                                .map((source) => (
                                  <option key={source.path} value={source.path}>
                                    {source.label}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(event) => {
                              const next = [...editingFields]
                              next[index] = { ...field, required: event.target.checked }
                              setEditingFields(next)
                            }}
                          />
                          req
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1.5 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => setEditingFields(editingFields.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* ---- Message template ---- */}
                  {editing.bookingMethod === "email" ? (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Email Subject & Body Templates</Label>
                      <Input
                        value={editing.bodySubject}
                        onChange={(event) =>
                          setEditing({ ...editing, bodySubject: event.target.value })
                        }
                        placeholder="Subject template — Booking {{reference}} to {{deliverySuburb}}"
                        className="h-8 font-mono text-xs"
                      />
                      <Textarea
                        value={editing.bodyTemplate}
                        onChange={(event) =>
                          setEditing({ ...editing, bodyTemplate: event.target.value })
                        }
                        rows={4}
                        placeholder="Body template. Use {{key}} for any field above. Leave blank to list every field as Key: value."
                        className="font-mono text-xs"
                      />
                    </div>
                  ) : null}

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      disabled={
                        !editing.name.trim() ||
                        (editing.bookingMethod === "email" && !editing.bookingEmail.trim()) ||
                        acting === "save-carrier"
                      }
                      onClick={async () => {
                        const payload = {
                          action: editing.id ? "updateCarrier" : "createCarrier",
                          ...editing,
                          formFields: editingFields.length ? editingFields : null,
                        }

                        const saved = await act(payload, "save-carrier")
                        if (saved) {
                          setEditing(null)
                          setEditingFields([])
                        }
                      }}
                    >
                      {editing.id ? "Save Changes" : "Create Carrier"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(null)
                        setEditingFields([])
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {!carriers.length ? (
              <EmptyState
                icon={Truck}
                title="No carriers configured"
                description="Click 'Add Carrier' to set up Australia Post, StarTrack, Toll, or custom freight providers."
              />
            ) : (
              carriers.map((carrier) => (
                <Card key={carrier.id} className="shadow-sm border">
                  <CardHeader className="pb-3 border-b">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          <Truck className="h-4 w-4 text-primary shrink-0" />
                          {carrier.name}
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {carrier.bookingMethod}
                          </Badge>
                          {!carrier.enabled ? (
                            <Badge variant="secondary" className="text-[10px] text-destructive bg-destructive/10 border-destructive/20">
                              disabled
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                              active
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {carrier.bookingMethod === "email"
                            ? carrier.bookingEmail || "No booking email configured"
                            : carrier.portalUrl || "Portal booking endpoint"}
                          {carrier.cutoffTime ? ` · Cutoff: ${carrier.cutoffTime}` : ""}
                          {carrier.accountNumber ? ` · Acct: ${carrier.accountNumber}` : ""}
                          {` · ${carrier._count.bookings} bookings logged`}
                        </CardDescription>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => setExpanded(expanded === carrier.id ? null : carrier.id)}
                        >
                          {expanded === carrier.id ? "Hide Zones" : `Zones (${carrier.zones.length})`}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setEditing({
                              id: carrier.id,
                              name: carrier.name,
                              tradingName: carrier.tradingName || "",
                              abn: carrier.abn || "",
                              contactName: carrier.contactName || "",
                              email: carrier.email || "",
                              phone: carrier.phone || "",
                              bookingMethod: carrier.bookingMethod,
                              bookingEmail: carrier.bookingEmail || "",
                              portalUrl: carrier.portalUrl || "",
                              cutoffTime: carrier.cutoffTime || "",
                              accountNumber: carrier.accountNumber || "",
                              bodySubject: carrier.bodySubject || "",
                              bodyTemplate: carrier.bodyTemplate || "",
                            })
                            setEditingFields(carrier.hasCustomForm ? carrier.formFields : [])
                            window.scrollTo({ top: 0, behavior: "smooth" })
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          disabled={acting === `toggle-${carrier.id}`}
                          onClick={() =>
                            void act(
                              { action: "updateCarrier", id: carrier.id, enabled: !carrier.enabled },
                              `toggle-${carrier.id}`
                            )
                          }
                        >
                          {carrier.enabled ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs font-semibold text-muted-foreground mr-1">Service Areas:</span>
                      {carrier.zones.map((zone) => (
                        <Badge key={zone.id} variant="secondary" className="gap-1 text-[11px] font-mono">
                          <MapPin className="h-2.5 w-2.5 text-primary" />
                          {zone.matchValue}
                          <span className="text-muted-foreground font-normal">p{zone.priority}</span>
                        </Badge>
                      ))}
                      {!carrier.zones.length ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          No service areas configured — carrier cannot be automatically matched.
                        </span>
                      ) : null}
                    </div>

                    {expanded === carrier.id ? (
                      <div className="space-y-3 rounded-xl border bg-muted/20 p-3.5 mt-3">
                        <div className="space-y-1.5">
                          {carrier.zones.map((zone) => (
                            <div
                              key={zone.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-2.5 text-xs shadow-sm"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-foreground">{zone.name}</span>
                                <span className="ml-2 text-muted-foreground">
                                  {MATCH_LABEL[zone.matchType]} <code className="font-mono text-foreground">{zone.matchValue}</code> · Priority {zone.priority} · {zone.leadTimeDays}d SLA · {money(zone.baseRate)} base + {money(zone.perKgRate)}/kg
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                                disabled={acting === `zone-${zone.id}`}
                                onClick={() => void act({ action: "deleteZone", zoneId: zone.id }, `zone-${zone.id}`)}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div className="grid gap-2 border-t pt-3 sm:grid-cols-[140px_1fr_1fr_90px_auto]">
                          <select
                            value={newZone.matchType}
                            onChange={(event) =>
                              setNewZone((current) => ({ ...current, matchType: event.target.value }))
                            }
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="postcode">Postcode</option>
                            <option value="postcode_range">Postcode range</option>
                            <option value="state">State</option>
                            <option value="suburb">Suburb</option>
                          </select>
                          <Input
                            value={newZone.matchValue}
                            onChange={(event) =>
                              setNewZone((current) => ({ ...current, matchValue: event.target.value }))
                            }
                            placeholder={
                              newZone.matchType === "postcode_range" ? "2000-2249" : newZone.matchType === "state" ? "NSW" : "2042"
                            }
                            className="h-8 text-xs bg-background"
                          />
                          <Input
                            value={newZone.name}
                            onChange={(event) =>
                              setNewZone((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="Area name (e.g. Sydney Metro)"
                            className="h-8 text-xs bg-background"
                          />
                          <Input
                            value={newZone.priority}
                            onChange={(event) =>
                              setNewZone((current) => ({ ...current, priority: event.target.value }))
                            }
                            placeholder="Priority (1-100)"
                            className="h-8 text-xs bg-background"
                          />
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!newZone.matchValue.trim() || acting === "new-zone"}
                            onClick={async () => {
                              await act(
                                {
                                  action: "createZone",
                                  carrierId: carrier.id,
                                  ...newZone,
                                  priority: Number(newZone.priority) || 100,
                                  leadTimeDays: Number(newZone.leadTimeDays) || 1,
                                },
                                "new-zone"
                              )
                              setNewZone({ matchType: "postcode", matchValue: "", name: "", priority: "100", leadTimeDays: "1" })
                            }}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Add Zone
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Lower priority number takes precedence (e.g. specific postcode rule at priority 10 overrides a state-wide rule at 90).
                        </p>

                        <div className="border-t pt-3">
                          <p className="mb-1.5 text-xs font-semibold text-foreground">
                            Manifest Fields ({carrier.formFields.length} configured)
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {carrier.formFields.map((field) => (
                              <Badge key={field.key} variant="outline" className="text-[10px]">
                                {field.label}
                                {field.required ? " *" : ""}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ---------------- Routing tester ---------------- */}
          <TabsContent value="test">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary" />
                  Address & Postcode Route Resolver
                </CardTitle>
                <CardDescription>
                  Tests the real-time carrier matcher used during order dispatch and automated wave fulfillment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <Input
                    value={test.city}
                    onChange={(event) => setTest((current) => ({ ...current, city: event.target.value }))}
                    placeholder="Suburb / City (e.g. Parramatta)"
                    className="h-9 text-xs"
                  />
                  <Input
                    value={test.state}
                    onChange={(event) => setTest((current) => ({ ...current, state: event.target.value }))}
                    placeholder="State (e.g. NSW)"
                    className="h-9 text-xs"
                  />
                  <Input
                    value={test.postcode}
                    onChange={(event) => setTest((current) => ({ ...current, postcode: event.target.value }))}
                    placeholder="Postcode (2150)"
                    className="h-9 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    className="h-9"
                    disabled={acting === "test"}
                    onClick={async () => {
                      setActing("test")

                      try {
                        const params = new URLSearchParams({ view: "test", ...test })
                        const result = await fetch(`/api/carriers?${params}`).then((response) => response.json())
                        setTestResult(result.data || "none")
                      } finally {
                        setActing(null)
                      }
                    }}
                  >
                    {acting === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Resolve Best Route
                  </Button>
                </div>

                {testResult === "none" ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-300">
                    No active carrier zone covers that address combination. Add a matching zone rule to a carrier above.
                  </div>
                ) : testResult ? (
                  <div className="rounded-xl border bg-muted/20 p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        {testResult.carrier}
                      </p>
                      <Badge variant="outline" className="text-xs font-mono">{testResult.bookingMethod}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Matched Zone: <span className="font-semibold text-foreground">{testResult.zone}</span> · Match Rule: <span className="font-mono text-foreground">{testResult.matchedOn}</span> · SLA Lead Time: <span className="font-medium text-foreground">{testResult.leadTimeDays} business day(s)</span>
                    </p>
                    {testResult.estimatedPrice !== null ? (
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 pt-1">
                        Estimated Base Rate: {money(testResult.estimatedPrice)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Bookings ---------------- */}
          <TabsContent value="bookings">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  Freight Booking History & Drafts
                </CardTitle>
                <CardDescription>
                  Review queued freight bookings, carrier manifests, and transmission receipts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!bookings.length ? (
                  <EmptyState
                    icon={Truck}
                    title="No freight bookings recorded"
                    description="Bookings will appear when orders are dispatched via 3PL freight carriers."
                  />
                ) : (
                  bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-sm hover:border-primary/30 transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">{booking.bookingNumber}</span>
                          <Badge
                            variant="outline"
                            className={
                              booking.status === "sent"
                                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 text-[10px]"
                                : "text-[10px]"
                            }
                          >
                            {booking.status}
                          </Badge>
                          {booking.createdByAgent ? (
                            <Badge variant="outline" className="gap-1 text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
                              <Bot className="h-2.5 w-2.5" />
                              AI Auto-Booked
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Carrier: <span className="font-medium text-foreground">{booking.carrier.name}</span>
                          {booking.sentTo ? ` · Sent to: ${booking.sentTo}` : ""}
                          {booking.sentAt ? ` · ${new Date(booking.sentAt).toLocaleString()}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {booking.quotedPrice !== null ? (
                          <span className="text-sm font-bold text-foreground">{money(booking.quotedPrice)}</span>
                        ) : null}
                        {booking.status === "draft" ? (
                          <Badge variant="outline" className="gap-1 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                            <Send className="h-2.5 w-2.5" />
                            Pending Dispatch
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}

