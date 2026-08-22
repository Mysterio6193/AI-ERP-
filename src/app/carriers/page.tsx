"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, Loader2, MapPin, Pencil, Plus, RefreshCw, Send, Trash2, Truck } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
    <AppShell title="Carriers">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Carriers</h1>
            <p className="text-sm text-muted-foreground">
              Who delivers where, and the booking form each one wants.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing({ ...EMPTY_CARRIER })
                setEditingFields([])
                setTab("carriers")
              }}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add carrier
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="carriers">Carriers</TabsTrigger>
            <TabsTrigger value="test">Test routing</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
          </TabsList>

          {/* ---------------- Carriers ---------------- */}
          <TabsContent value="carriers" className="mt-4 space-y-3">
            {editing ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {editing.id ? `Edit ${editing.name}` : "New carrier"}
                  </CardTitle>
                  <CardDescription>
                    How to reach them, and what their booking form asks for. Service areas are added
                    after saving.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      value={editing.name}
                      onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      placeholder="Carrier name *"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={editing.tradingName}
                      onChange={(event) => setEditing({ ...editing, tradingName: event.target.value })}
                      placeholder="Trading name"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={editing.abn}
                      onChange={(event) => setEditing({ ...editing, abn: event.target.value })}
                      placeholder="ABN"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      value={editing.contactName}
                      onChange={(event) => setEditing({ ...editing, contactName: event.target.value })}
                      placeholder="Contact person"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={editing.email}
                      onChange={(event) => setEditing({ ...editing, email: event.target.value })}
                      placeholder="General email"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={editing.phone}
                      onChange={(event) => setEditing({ ...editing, phone: event.target.value })}
                      placeholder="Phone"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[150px_1fr_120px_1fr]">
                    <select
                      value={editing.bookingMethod}
                      onChange={(event) =>
                        setEditing({ ...editing, bookingMethod: event.target.value })
                      }
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="email">Book by email</option>
                      <option value="webform">Book on portal</option>
                      <option value="api">Book by API</option>
                    </select>

                    {editing.bookingMethod === "email" ? (
                      <Input
                        value={editing.bookingEmail}
                        onChange={(event) =>
                          setEditing({ ...editing, bookingEmail: event.target.value })
                        }
                        placeholder="Bookings email *"
                        className="h-8 text-xs"
                      />
                    ) : (
                      <Input
                        value={editing.portalUrl}
                        onChange={(event) => setEditing({ ...editing, portalUrl: event.target.value })}
                        placeholder="Portal URL"
                        className="h-8 text-xs"
                      />
                    )}

                    <Input
                      value={editing.cutoffTime}
                      onChange={(event) => setEditing({ ...editing, cutoffTime: event.target.value })}
                      placeholder="Cutoff 14:00"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={editing.accountNumber}
                      onChange={(event) =>
                        setEditing({ ...editing, accountNumber: event.target.value })
                      }
                      placeholder="Our account number"
                      className="h-8 text-xs"
                    />
                  </div>

                  {editing.bookingMethod !== "email" ? (
                    <p className="text-[11px] text-muted-foreground">
                      Only email bookings dispatch automatically. The others still fill the form for
                      someone to lodge.
                    </p>
                  ) : null}

                  {/* ---- Booking form fields ---- */}
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium">Their booking form</p>
                        <p className="text-[11px] text-muted-foreground">
                          {editingFields.length
                            ? "Each field is filled from the order automatically."
                            : "Leave empty to use the standard form."}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          setEditingFields([
                            ...editingFields,
                            { key: `field${editingFields.length + 1}`, label: "", required: false, source: "" },
                          ])
                        }
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add field
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
                          className="h-7 text-[11px]"
                        />
                        <Input
                          value={field.key}
                          onChange={(event) => {
                            const next = [...editingFields]
                            next[index] = { ...field, key: event.target.value }
                            setEditingFields(next)
                          }}
                          placeholder="key"
                          className="h-7 font-mono text-[11px]"
                        />
                        <select
                          value={field.source || ""}
                          onChange={(event) => {
                            const next = [...editingFields]
                            next[index] = { ...field, source: event.target.value }
                            setEditingFields(next)
                          }}
                          className="h-7 rounded-md border bg-background px-1.5 text-[11px]"
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
                        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
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
                          className="h-7 px-1.5 text-[11px]"
                          onClick={() => setEditingFields(editingFields.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* ---- Message template ---- */}
                  {editing.bookingMethod === "email" ? (
                    <div className="space-y-1.5">
                      <Input
                        value={editing.bodySubject}
                        onChange={(event) =>
                          setEditing({ ...editing, bodySubject: event.target.value })
                        }
                        placeholder="Subject template — Booking {{reference}} to {{deliverySuburb}}"
                        className="h-8 font-mono text-[11px]"
                      />
                      <Textarea
                        value={editing.bodyTemplate}
                        onChange={(event) =>
                          setEditing({ ...editing, bodyTemplate: event.target.value })
                        }
                        rows={4}
                        placeholder="Body template. Use {{key}} for any field above. Leave blank to list every field as Label: value."
                        className="font-mono text-[11px]"
                      />
                    </div>
                  ) : null}

                  <div className="flex gap-2">
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
                          // Only send fields when the user actually defined some,
                          // otherwise the carrier keeps using the standard form.
                          formFields: editingFields.length ? editingFields : null,
                        }

                        const saved = await act(payload, "save-carrier")
                        if (saved) {
                          setEditing(null)
                          setEditingFields([])
                        }
                      }}
                    >
                      {editing.id ? "Save changes" : "Create carrier"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
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
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {loading ? "Loading…" : "No carriers yet."}
                </CardContent>
              </Card>
            ) : (
              carriers.map((carrier) => (
                <Card key={carrier.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          <Truck className="h-4 w-4 shrink-0" />
                          {carrier.name}
                          <Badge variant="outline" className="text-[10px]">
                            {carrier.bookingMethod}
                          </Badge>
                          {!carrier.enabled ? (
                            <Badge variant="secondary" className="text-[10px]">
                              disabled
                            </Badge>
                          ) : null}
                        </CardTitle>
                        <CardDescription>
                          {carrier.bookingMethod === "email"
                            ? carrier.bookingEmail || "No booking email set"
                            : carrier.portalUrl || "Portal booking"}
                          {carrier.cutoffTime ? ` · cutoff ${carrier.cutoffTime}` : ""}
                          {carrier.accountNumber ? ` · acct ${carrier.accountNumber}` : ""}
                          {` · ${carrier._count.bookings} bookings`}
                        </CardDescription>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpanded(expanded === carrier.id ? null : carrier.id)}
                        >
                          {expanded === carrier.id ? "Hide" : "Service areas"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
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
                            // Only preload fields the carrier actually defined,
                            // so opening the editor cannot freeze the default
                            // form into a custom one by accident.
                            setEditingFields(carrier.hasCustomForm ? carrier.formFields : [])
                            window.scrollTo({ top: 0, behavior: "smooth" })
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
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

                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {carrier.zones.map((zone) => (
                        <Badge key={zone.id} variant="secondary" className="gap-1 text-[10px]">
                          <MapPin className="h-2.5 w-2.5" />
                          {zone.matchValue}
                          <span className="text-muted-foreground">p{zone.priority}</span>
                        </Badge>
                      ))}
                      {!carrier.zones.length ? (
                        <span className="text-xs text-amber-600">
                          No service areas — this carrier will never be matched.
                        </span>
                      ) : null}
                    </div>

                    {expanded === carrier.id ? (
                      <div className="space-y-3 rounded-lg border p-3">
                        <div className="space-y-1.5">
                          {carrier.zones.map((zone) => (
                            <div
                              key={zone.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-medium">{zone.name}</span>
                                <span className="ml-2 text-muted-foreground">
                                  {MATCH_LABEL[zone.matchType]} {zone.matchValue} · priority{" "}
                                  {zone.priority} · {zone.leadTimeDays}d · {money(zone.baseRate)} +{" "}
                                  {money(zone.perKgRate)}/kg
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px]"
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
                            className="h-8 rounded-md border bg-background px-2 text-xs"
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
                            className="h-8 text-xs"
                          />
                          <Input
                            value={newZone.name}
                            onChange={(event) =>
                              setNewZone((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="Area name"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={newZone.priority}
                            onChange={(event) =>
                              setNewZone((current) => ({ ...current, priority: event.target.value }))
                            }
                            placeholder="Priority"
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
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
                            Add
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Lower priority wins, so a single postcode set to 10 overrides a whole-state
                          rule at 90.
                        </p>

                        <div className="border-t pt-3">
                          <p className="mb-1.5 text-xs font-medium">
                            Booking form ({carrier.formFields.length} fields)
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
          <TabsContent value="test" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Who covers this address?</CardTitle>
                <CardDescription>
                  Runs the same resolver the agent uses when an order comes in. Creates nothing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_100px_auto]">
                  <Input
                    value={test.city}
                    onChange={(event) => setTest((current) => ({ ...current, city: event.target.value }))}
                    placeholder="Suburb"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={test.state}
                    onChange={(event) => setTest((current) => ({ ...current, state: event.target.value }))}
                    placeholder="State (NSW)"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={test.postcode}
                    onChange={(event) => setTest((current) => ({ ...current, postcode: event.target.value }))}
                    placeholder="Postcode"
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
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
                    Resolve
                  </Button>
                </div>

                {testResult === "none" ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    No carrier covers that address. Add a service area, or the booking will need
                    routing by hand.
                  </div>
                ) : testResult ? (
                  <div className="rounded-md border p-3 text-xs">
                    <p className="text-sm font-medium">{testResult.carrier}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {testResult.zone} · matched on {testResult.matchedOn} ·{" "}
                      {testResult.leadTimeDays} day lead · {testResult.bookingMethod}
                    </p>
                    {testResult.estimatedPrice !== null ? (
                      <p className="mt-1 font-medium">Est. {money(testResult.estimatedPrice)}</p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Bookings ---------------- */}
          <TabsContent value="bookings" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Freight bookings</CardTitle>
                <CardDescription>
                  Drafts contact nobody. Sending needs a human, because the carrier acts on it
                  immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!bookings.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No bookings yet."}
                  </p>
                ) : (
                  bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">{booking.bookingNumber}</span>
                          <Badge
                            variant={booking.status === "sent" ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {booking.status}
                          </Badge>
                          {booking.createdByAgent ? (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Bot className="h-2.5 w-2.5" />
                              agent
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {booking.carrier.name}
                          {booking.sentTo ? ` · sent to ${booking.sentTo}` : ""}
                          {booking.sentAt ? ` · ${new Date(booking.sentAt).toLocaleString()}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {booking.quotedPrice !== null ? (
                          <span className="text-sm font-medium">{money(booking.quotedPrice)}</span>
                        ) : null}
                        {booking.status === "draft" ? (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Send className="h-2.5 w-2.5" />
                            needs approval
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
