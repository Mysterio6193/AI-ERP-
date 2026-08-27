"use client"

/**
 * The entities this group bills from.
 *
 * These fields are not preferences — they are what prints on an invoice. So the
 * form says which of them a document cannot be raised without, and refuses
 * details that look invented rather than accepting them and failing when a
 * customer tries to pay.
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Building2, Check, Loader2, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

interface CompanyRow {
  id: string
  name: string
  tradingName: string | null
  abn: string | null
  baseCurrency: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  postcode: string | null
  bankName: string | null
  bsb: string | null
  accountNumber: string | null
  accountName: string | null
  missingForInvoicing?: string[]
}

const FIELDS: Array<{ key: keyof CompanyRow; label: string; hint?: string }> = [
  { key: "name", label: "Legal name" },
  { key: "tradingName", label: "Trading name" },
  { key: "abn", label: "ABN", hint: "checksum verified" },
  { key: "baseCurrency", label: "Currency" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postcode", label: "Postcode" },
  { key: "bankName", label: "Bank" },
  { key: "accountName", label: "Account name" },
  { key: "bsb", label: "BSB", hint: "six digits" },
  { key: "accountNumber", label: "Account number" },
]

export function CompanyManager() {
  const { toast } = useToast()
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<CompanyRow>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetch("/api/companies").then((r) => r.json())
      if (result.success) {
        setCompanies(result.data.companies)
        setSelected((current) => current ?? result.data.companies[0]?.id ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected || creating) return

    void (async () => {
      const result = await fetch(`/api/companies/${selected}`).then((r) => r.json())
      if (result.success) setDraft(result.data)
    })()
  }, [selected, creating])

  const save = useCallback(async () => {
    setBusy(true)
    setError(null)

    try {
      const result = await fetch(creating ? "/api/companies" : `/api/companies/${selected}`, {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      }).then((r) => r.json())

      if (!result.success) {
        setError(result.error)
        return
      }

      toast({ title: creating ? "Company added" : "Saved", description: result.note ?? undefined })
      setCreating(false)
      setSelected(result.data.id)
      await load()
    } finally {
      setBusy(false)
    }
  }, [creating, draft, selected, load, toast])

  const remove = useCallback(async () => {
    if (!selected) return
    setBusy(true)
    setError(null)

    try {
      const result = await fetch(`/api/companies/${selected}`, { method: "DELETE" }).then((r) => r.json())
      if (!result.success) {
        setError(result.error)
        return
      }
      toast({ title: `${result.data.name} removed` })
      setSelected(null)
      await load()
    } finally {
      setBusy(false)
    }
  }, [selected, load, toast])

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading companies…
      </div>
    )
  }

  const blocked = draft.missingForInvoicing ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="space-y-1">
        {companies.map((company) => (
          <button
            key={company.id}
            type="button"
            onClick={() => {
              setSelected(company.id)
              setCreating(false)
              setError(null)
            }}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
              selected === company.id && !creating ? "border-primary bg-muted/50" : "hover:bg-muted/30"
            }`}
          >
            <span className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{company.name}</span>
            </span>
          </button>
        ))}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            setCreating(true)
            setDraft({ baseCurrency: "AUD" })
            setError(null)
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add company
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{creating ? "New company" : draft.name || "Company"}</CardTitle>
          <CardDescription className="text-xs">
            These details print on every invoice this entity raises.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 text-xs">
          {error ? (
            <p className="flex items-start gap-1.5 rounded border border-rose-300 bg-rose-50 p-2 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}

          {!creating && blocked.length > 0 ? (
            <p className="flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>This company cannot raise invoices yet — it needs its {blocked.join(", ")}.</span>
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={String(field.key)}>
                <Label className="text-[11px]">
                  {field.label}
                  {field.hint ? (
                    <span className="ml-1 font-normal text-muted-foreground">· {field.hint}</span>
                  ) : null}
                </Label>
                <Input
                  className="h-8 text-xs"
                  value={(draft[field.key] as string) ?? ""}
                  onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs" disabled={busy || !draft.name} onClick={() => void save()}>
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
              {creating ? "Add company" : "Save"}
            </Button>

            {!creating && selected ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Remove
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
