"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Coins, Loader2, Plus, TrendingUp } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface CurrencyRow {
  code: string
  name: string
  symbol: string | null
  decimals: number
  isActive: boolean
  isBase: boolean
  rateToBase: number | null
  rateVia: string | null
  rateEffectiveFrom: string | null
  rateError: string | null
}

interface Payload {
  baseCurrency: string
  displayLocale: string
  currencies: CurrencyRow[]
}

export default function CurrenciesPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [newCurrency, setNewCurrency] = useState({ code: "", name: "", symbol: "" })
  const [addError, setAddError] = useState<string | null>(null)

  const [rateOpen, setRateOpen] = useState(false)
  const [rate, setRate] = useState({ from: "", rate: "", effectiveFrom: "", shared: false })
  const [rateError, setRateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/currencies")
      const body = await res.json()

      if (body.success) {
        setData(body.data)
        setError(null)
      } else {
        setError(body.error || "Failed to load currencies")
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load currencies")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch("/api/currencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      return { status: res.status, body: await res.json() }
    } finally {
      setBusy(false)
    }
  }

  async function addCurrency() {
    setAddError(null)
    const result = await post({
      action: "add-currency",
      code: newCurrency.code,
      name: newCurrency.name,
      symbol: newCurrency.symbol || null,
    })

    if (!result.body.success) {
      setAddError(result.body.error)
      return
    }

    setAddOpen(false)
    setNewCurrency({ code: "", name: "", symbol: "" })
    await load()
  }

  async function saveRate() {
    setRateError(null)
    const result = await post({
      action: "set-rate",
      from: rate.from,
      to: data?.baseCurrency,
      rate: Number(rate.rate),
      effectiveFrom: rate.effectiveFrom || undefined,
      shared: rate.shared,
    })

    if (!result.body.success) {
      setRateError(result.body.error)
      return
    }

    setRateOpen(false)
    setRate({ from: "", rate: "", effectiveFrom: "", shared: false })
    await load()
  }

  const currencies = data?.currencies ?? []
  const missingRates = currencies.filter((row) => !row.isBase && row.rateToBase === null)

  return (
    <AppShell
      title="Currencies"
      breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Currencies" }]}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Currencies</h1>
            <p className="text-sm text-muted-foreground">
              What the business trades in, and what each is worth today. Documents keep the rate
              they were raised at.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRate({
                  from: currencies.find((row) => !row.isBase)?.code ?? "",
                  rate: "",
                  effectiveFrom: "",
                  shared: false,
                })
                setRateOpen(true)
              }}
              disabled={currencies.length < 2}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Set a rate
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add currency
            </Button>
          </div>
        </div>

        {error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {missingRates.length > 0 ? (
          <Card className="border-amber-500">
            <CardContent className="flex items-start gap-2 py-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                No usable rate for {missingRates.map((row) => row.code).join(", ")}. Orders in{" "}
                {missingRates.length === 1 ? "that currency" : "those currencies"} will be refused
                rather than priced at a guess.
              </span>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4" />
              Configured currencies
            </CardTitle>
            <CardDescription>
              Base currency is <span className="font-medium">{data?.baseCurrency ?? "—"}</span>.
              Change it in Settings → Currency &amp; Exchange Rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : currencies.length === 0 ? (
              <div className="space-y-3 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No currencies configured yet. Add the ones you trade in.
                </p>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add currency
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Decimals</TableHead>
                      <TableHead className="text-right">Rate to {data?.baseCurrency}</TableHead>
                      <TableHead>As at</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currencies.map((row) => (
                      <TableRow key={row.code}>
                        <TableCell className="font-mono font-medium">{row.code}</TableCell>
                        <TableCell>
                          {row.name}
                          {row.symbol ? (
                            <span className="ml-2 text-muted-foreground">{row.symbol}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.decimals}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.rateToBase === null ? (
                            <span className="text-destructive">none</span>
                          ) : (
                            row.rateToBase.toFixed(6)
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.rateEffectiveFrom
                            ? new Date(row.rateEffectiveFrom).toISOString().slice(0, 10)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.isBase ? <Badge>base</Badge> : null}
                            {!row.isActive ? <Badge variant="outline">inactive</Badge> : null}
                            {row.rateVia && row.rateVia !== "direct" ? (
                              // Worth surfacing: a triangulated rate carries
                              // both legs' spreads, an inverted one the other
                              // side's.
                              <Badge variant="secondary">{row.rateVia}</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a currency</DialogTitle>
            <DialogDescription>
              Minor units are taken from the code — two for most, none for yen, three for dinars.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cur-code">Code</Label>
              <Input
                id="cur-code"
                value={newCurrency.code}
                onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })}
                placeholder="NZD"
                maxLength={3}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cur-name">Name</Label>
              <Input
                id="cur-name"
                value={newCurrency.name}
                onChange={(e) => setNewCurrency({ ...newCurrency, name: e.target.value })}
                placeholder="New Zealand Dollar"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cur-symbol">Symbol</Label>
              <Input
                id="cur-symbol"
                value={newCurrency.symbol}
                onChange={(e) => setNewCurrency({ ...newCurrency, symbol: e.target.value })}
                placeholder="NZ$"
              />
            </div>
          </div>

          {addError ? <p className="text-sm text-destructive">{addError}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={addCurrency} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set an exchange rate</DialogTitle>
            <DialogDescription>
              Rates are dated, not overwritten. Documents already raised keep the rate they used.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rate-from">Currency</Label>
              <select
                id="rate-from"
                value={rate.from}
                onChange={(e) => setRate({ ...rate, from: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {currencies
                  .filter((row) => !row.isBase)
                  .map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.code} — {row.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-value">
                {data?.baseCurrency} per 1 {rate.from || "unit"}
              </Label>
              <Input
                id="rate-value"
                type="number"
                step="0.000001"
                value={rate.rate}
                onChange={(e) => setRate({ ...rate, rate: e.target.value })}
                placeholder="1.085000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-date">Effective from</Label>
              <Input
                id="rate-date"
                type="date"
                value={rate.effectiveFrom}
                onChange={(e) => setRate({ ...rate, effectiveFrom: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for today. A future date is stored and ignored until it arrives.
              </p>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="rate-shared"
                checked={rate.shared}
                onCheckedChange={(checked) => setRate({ ...rate, shared: checked === true })}
              />
              <Label htmlFor="rate-shared" className="text-sm font-normal leading-snug">
                Share with every entity in the group
                <span className="block text-xs text-muted-foreground">
                  Otherwise it applies only to the entity you are working in.
                </span>
              </Label>
            </div>
          </div>

          {rateError ? <p className="text-sm text-destructive">{rateError}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveRate} disabled={busy || !rate.from || !rate.rate}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
