"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Globe, Loader2, RotateCcw, Save } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

interface NamespaceMeta {
  namespace: string
  label: string
  description: string
  writeRoles: string[]
}

interface NamespacePayload {
  namespace: string
  label: string
  description: string
  settings: Record<string, any>
  defaults: Record<string, any>
  customised: { global: boolean; company: boolean }
  canWrite: boolean
}

const money = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Renders what a setting will actually do.
 *
 * Abstract configuration is the kind people get wrong — "pad 5, reset yearly"
 * means nothing until you see `SO-2026-01042`. Every preview here is computed
 * from the values currently in the form, not from saved state.
 */
function Preview({ namespace, settings }: { namespace: string; settings: Record<string, any> }) {
  const lines = useMemo(() => {
    try {
      if (namespace === "numbering") {
        const year = new Date().getFullYear()
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")

        return Object.entries(settings).map(([kind, format]: [string, any]) => {
          const token =
            format.dateToken === "none"
              ? ""
              : format.dateToken === "YY"
                ? String(year).slice(2)
                : format.dateToken === "YYYYMMDD"
                  ? stamp
                  : format.dateToken === "YYYYMM"
                    ? stamp.slice(0, 6)
                    : String(year)

          const sep = format.separator ?? "-"
          const seq = String(format.start ?? 1).padStart(format.pad ?? 5, "0")
          const example = [format.prefix, token, seq].filter(Boolean).join(sep) + (format.suffix || "")

          return `${kind}: ${example}${format.useCounter ? "" : "  (legacy generator)"}`
        })
      }

      if (namespace === "invoicing") {
        const today = new Date()
        const add = (days: number) =>
          new Date(today.getTime() + days * 86400_000).toLocaleDateString()

        const eom = new Date(today.getFullYear(), today.getMonth() + 1, 0).toLocaleDateString()

        return settings.dueDateSource === "fixedDays"
          ? [`Every invoice issued today falls due ${add(settings.fixedDays)} (fixed ${settings.fixedDays} days).`]
          : [
              `Net 7 customer invoiced today → due ${add(7)}`,
              `Net 30 customer → due ${add(30)}`,
              `COD (terms 0) → due ${settings.codDueSameDay ? "today" : add(settings.fallbackDays)}`,
              `End of month (terms -1) → due ${eom}`,
              `No terms set → due ${add(settings.fallbackDays)}`,
            ]
      }

      if (namespace === "aging") {
        return (settings.buckets || []).map(
          (bucket: any) =>
            `${bucket.label}: ${bucket.minDays <= -1000 ? "not yet due" : `${bucket.minDays} days`}${
              bucket.maxDays === null ? " and over" : ` to ${bucket.maxDays} days`
            }`
        )
      }

      if (namespace === "tax") {
        return [
          settings.defaultRate === null
            ? "Rate inherits the company's GST setting."
            : `Default rate ${settings.defaultRate}% when nothing more specific applies.`,
          `Resolved in order: ${(settings.resolutionOrder || []).join(" → ")}.`,
          `Rounded to ${settings.roundingDp} decimal places, per ${settings.roundingMode}.`,
          settings.pricesIncludeTax
            ? "Prices treated as tax-inclusive (not yet implemented)."
            : "Prices are tax-exclusive; GST is added.",
        ]
      }

      if (namespace === "pricing") {
        return settings.enablePriceLists
          ? [
              "Customer price lists apply to order lines.",
              settings.volumeBreaks ? "Quantity breaks honoured." : "Quantity breaks ignored.",
              `Discounts stacked using "${settings.discountStacking}".`,
              `Line discount capped at ${settings.maxLineDiscountPercent}%.`,
            ]
          : [
              `Price lists are OFF — every line uses ${settings.fallback === "retailPrice" ? "retail" : "wholesale"} price.`,
              "Turning this on changes what customers are charged. Run the comparison report first.",
            ]
      }

      if (namespace === "branding") {
        return [
          `Theme: "${settings.invoiceTheme}" template with ${settings.primaryColor} accent palette.`,
          `Document logos: ${settings.showLogoOnDocuments ? "Enabled" : "Hidden"}.`,
          `Payment QR code: ${settings.showPaymentQrOnInvoice ? "Printed on invoice PDF for instant mobile payments" : "Disabled"}.`,
          `Bank Remittance: ${settings.showBankDetailsOnInvoice ? "Included in footer" : "Omitted"}.`,
          `Date display format: ${settings.dateFormat}.`,
        ]
      }

      if (namespace === "dashboard") {
        return [
          `Active KPI cards: ${(settings.kpiCardsVisible || []).join(", ")}.`,
          `Default reporting horizon: ${settings.defaultTimeframe}.`,
          `Trend charts: ${settings.showSalesTrend ? "Enabled" : "Hidden"}.`,
          `Display density: ${settings.compactMode ? "Compact table layout" : "Standard comfortable layout"}.`,
        ]
      }

      if (namespace === "automation") {
        return [
          settings.autoApproveOrdersUnder > 0
            ? `Orders under $${settings.autoApproveOrdersUnder} auto-approved if stock is allocated.`
            : "All orders require manual supervisor approval.",
          settings.blockOrdersOnCreditHold
            ? "Customer orders immediately blocked if account is on credit hold or overdue."
            : "Orders allowed on credit hold with warning banner.",
          `Pick lists: ${settings.autoGeneratePickList ? "Auto-generated upon order confirmation" : "Manual warehouse trigger"}.`,
          `Telegram notifications: ${settings.telegramAlertsEnabled ? "Active for high-priority events" : "Disabled"}.`,
        ]
      }

      if (namespace === "agentPersona") {
        return [
          `Agent persona: "${settings.personaName}" with ${settings.tone} tone of voice.`,
          settings.autoConfirmLowRiskActions
            ? "Auto-executes low-risk operational queries without prompting."
            : "Requires explicit operator confirmation for every mutating tool action.",
          `Custom system directives: "${settings.customSystemInstructions}".`,
        ]
      }

      if (namespace === "ops") {
        return [
          `New inventory starts at reorder level ${settings.lowStockReorderLevel}, reorder qty ${settings.lowStockReorderQty}.`,
          `Default payment terms: ${
            settings.defaultPaymentTerms === 0
              ? "COD"
              : settings.defaultPaymentTerms === -1
                ? "end of month"
                : `Net ${settings.defaultPaymentTerms}`
          }.`,
          `Amounts shown with ${settings.currencyDisplay === "code" ? "currency code (AUD 1,000.00)" : `symbol (${money(1000)})`}.`,
        ]
      }

      return []
    } catch {
      return ["Preview unavailable for these values."]
    }
  }, [namespace, settings])

  if (!lines.length) {
    return null
  }

  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        What this means
      </p>
      <div className="space-y-0.5">
        {lines.map((line, index) => (
          <p key={index} className="font-mono text-[11px]">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

/** Renders one field by inferring its control from the default's type. */
function Field({
  path,
  value,
  onChange,
  disabled,
}: {
  path: string
  value: any
  onChange: (next: any) => void
  disabled: boolean
}) {
  const label = path
    .split(".")
    .at(-1)!
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())

  if (typeof value === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3 rounded-md border p-2.5">
        <span className="text-xs">{label}</span>
        <input
          type="checkbox"
          checked={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    )
  }

  if (typeof value === "number") {
    return (
      <label className="flex items-center justify-between gap-3 rounded-md border p-2.5">
        <span className="text-xs">{label}</span>
        <Input
          type="number"
          value={value}
          disabled={disabled}
          className="h-7 w-28 text-xs"
          onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
        />
      </label>
    )
  }

  if (typeof value === "string") {
    return (
      <label className="flex items-center justify-between gap-3 rounded-md border p-2.5">
        <span className="text-xs">{label}</span>
        <Input
          value={value}
          disabled={disabled}
          className="h-7 w-44 text-xs"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }

  if (value === null) {
    return (
      <label className="flex items-center justify-between gap-3 rounded-md border p-2.5">
        <span className="text-xs">
          {label}
          <span className="ml-2 text-[10px] text-muted-foreground">inherits</span>
        </span>
        <Input
          placeholder="inherit"
          disabled={disabled}
          className="h-7 w-28 text-xs"
          onChange={(event) =>
            onChange(event.target.value === "" ? null : Number(event.target.value))
          }
        />
      </label>
    )
  }

  return null
}

export default function BusinessSettingsPage() {
  const { toast } = useToast()
  const [namespaces, setNamespaces] = useState<NamespaceMeta[]>([])
  const [active, setActive] = useState("tax")
  const [payload, setPayload] = useState<NamespacePayload | null>(null)
  const [draft, setDraft] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scope, setScope] = useState<"global" | "company">("global")

  useEffect(() => {
    void fetch("/api/settings/_index")
      .then((response) => response.json())
      .then((result) => {
        if (result.success) setNamespaces(result.data)
      })
  }, [])

  const load = useCallback(async (namespace: string) => {
    setLoading(true)

    try {
      const result = await fetch(`/api/settings/${namespace}`).then((response) => response.json())

      if (result.success) {
        setPayload(result.data)
        setDraft(structuredClone(result.data.settings))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(active)
  }, [active, load])

  const dirty = useMemo(
    () => payload && JSON.stringify(draft) !== JSON.stringify(payload.settings),
    [draft, payload]
  )

  function setPath(path: string[], next: any) {
    setDraft((current) => {
      const copy = structuredClone(current)
      let node: any = copy

      for (const segment of path.slice(0, -1)) {
        node = node[segment]
      }

      node[path.at(-1)!] = next
      return copy
    })
  }

  const disabled = !payload?.canWrite || saving

  return (
    <AppShell title="Business settings">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Business settings</h1>
            <p className="text-sm text-muted-foreground">
              How this business works — tax, due dates, numbering, pricing. Defaults match
              current behaviour, so nothing changes until you change it.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <button
              onClick={() => setScope("global")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                scope === "global" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              <Globe className="h-3 w-3" />
              All entities
            </button>
            <button
              onClick={() => setScope("company")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                scope === "company" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              <Building2 className="h-3 w-3" />
              This entity only
            </button>
          </div>
        </div>

        <Tabs value={active} onValueChange={setActive}>
          <TabsList>
            {namespaces.map((entry) => (
              <TabsTrigger key={entry.namespace} value={entry.namespace}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={active} className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {payload?.label || "Loading…"}
                      {payload && !payload.customised.global && !payload.customised.company ? (
                        <Badge variant="outline" className="text-[10px]">
                          using defaults
                        </Badge>
                      ) : null}
                      {scope === "company" && payload?.customised.company ? (
                        <Badge variant="secondary" className="text-[10px]">
                          overridden for this entity
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>{payload?.description}</CardDescription>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={async () => {
                        if (!window.confirm("Reset these settings to defaults?")) return
                        setSaving(true)

                        try {
                          await fetch(`/api/settings/${active}?scope=${scope}`, { method: "DELETE" })
                          await load(active)
                        } finally {
                          setSaving(false)
                        }
                      }}
                    >
                      <RotateCcw className="mr-1.5 h-3 w-3" />
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      disabled={disabled || !dirty}
                      onClick={async () => {
                        setSaving(true)

                        try {
                          const result = await fetch(`/api/settings/${active}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ settings: draft, scope }),
                          }).then((response) => response.json())

                          if (!result.success) {
                            toast({
                              variant: "destructive",
                              title: "Failed to save settings",
                              description: result.error || "Save failed",
                            })
                            return
                          }

                          await load(active)
                          toast({
                            title: "Settings saved",
                            description: "Business settings updated successfully.",
                          })
                        } finally {
                          setSaving(false)
                        }
                      }}
                    >
                      {saving ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 h-3 w-3" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {!payload?.canWrite && payload ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
                    You can view these but not change them.
                  </p>
                ) : null}

                <Preview namespace={active} settings={draft} />

                {loading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(draft).map(([key, value]) => {
                      // Nested groups (numbering's per-document formats) get
                      // their own block rather than being flattened.
                      if (value && typeof value === "object" && !Array.isArray(value)) {
                        return (
                          <div key={key} className="rounded-lg border p-3">
                            <p className="mb-2 text-xs font-medium capitalize">
                              {key.replace(/([A-Z])/g, " $1")}
                            </p>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {Object.entries(value as Record<string, any>).map(([field, inner]) => (
                                <Field
                                  key={field}
                                  path={`${key}.${field}`}
                                  value={inner}
                                  disabled={disabled}
                                  onChange={(next) => setPath([key, field], next)}
                                />
                              ))}
                            </div>
                          </div>
                        )
                      }

                      if (Array.isArray(value)) {
                        return (
                          <div key={key} className="rounded-lg border p-3">
                            <p className="mb-1 text-xs font-medium capitalize">
                              {key.replace(/([A-Z])/g, " $1")}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {JSON.stringify(value)}
                            </p>
                          </div>
                        )
                      }

                      return (
                        <Field
                          key={key}
                          path={key}
                          value={value}
                          disabled={disabled}
                          onChange={(next) => setPath([key], next)}
                        />
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
