"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Boxes, Grid3x3, Loader2, Plus, RefreshCw, Route } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface BinLine {
  productId: string
  sku: string
  name: string
  quantity: number
  batchCode: string | null
}

interface Bin {
  id: string
  code: string
  zone: string
  status: string
  isPickable: boolean
  maxUnits: number | null
  used: number
  lines: BinLine[]
}

interface BinsPayload {
  warehouseId: string
  zones: string[]
  bins: Bin[]
  totals: { bins: number; occupied: number; units: number }
}

const ALL_ZONES = "__all__"

export default function BinsPage() {
  const [data, setData] = useState<BinsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [zone, setZone] = useState(ALL_ZONES)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [generateOpen, setGenerateOpen] = useState(false)
  const [spec, setSpec] = useState({ zone: "A", aisles: "6", racksPerAisle: "4", levels: "3", maxUnits: "" })
  const [specError, setSpecError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = zone === ALL_ZONES ? "" : `?zone=${encodeURIComponent(zone)}`
      const res = await fetch(`/api/warehouse/bins${query}`)
      const body = await res.json()

      if (body.success) {
        setData(body.data)
        setError(null)
      } else {
        setError(body.error || "Failed to load bins")
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load bins")
    } finally {
      setLoading(false)
    }
  }, [zone])

  useEffect(() => {
    load()
  }, [load])

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch("/api/warehouse/bins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      return { status: res.status, body: await res.json() }
    } finally {
      setBusy(false)
    }
  }

  async function generate() {
    setSpecError(null)
    const result = await post({
      action: "generate",
      zone: spec.zone,
      aisles: Number(spec.aisles),
      racksPerAisle: Number(spec.racksPerAisle),
      levels: Number(spec.levels),
      maxUnits: spec.maxUnits.trim() === "" ? null : Number(spec.maxUnits),
    })

    if (!result.body.success) {
      setSpecError(result.body.error)
      return
    }

    setGenerateOpen(false)
    await load()
  }

  async function resequence() {
    await post({ action: "resequence" })
    await load()
  }

  const bins = data?.bins ?? []

  // How full the zone is, which is the number a warehouse manager asks for
  // before anyone asks which shelf anything is on.
  const fill = useMemo(() => {
    const withCeiling = bins.filter((bin) => bin.maxUnits !== null)
    if (!withCeiling.length) return null

    const capacity = withCeiling.reduce((sum, bin) => sum + (bin.maxUnits ?? 0), 0)
    const used = withCeiling.reduce((sum, bin) => sum + bin.used, 0)

    if (capacity <= 0) return null

    const percent = (used / capacity) * 100

    // A nearly empty warehouse rounds to 0, which reads as a broken number
    // sitting next to a non-zero unit count.
    return percent > 0 && percent < 1 ? "<1%" : `${Math.round(percent)}%`
  }, [bins])

  return (
    <AppShell
      title="Bin Locations"
      breadcrumbs={[{ label: "Warehouse", href: "/warehouse" }, { label: "Bins" }]}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/warehouse"
              className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Warehouse
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Bin Locations</h1>
            <p className="text-sm text-muted-foreground">
              Shelves in the order a picker walks them, and what is on each one.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All zones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ZONES}>All zones</SelectItem>
                {(data?.zones ?? []).map((z) => (
                  <SelectItem key={z} value={z}>
                    Zone {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={resequence} disabled={busy}>
              <Route className="mr-2 h-4 w-4" />
              Resequence
            </Button>

            <Button size="sm" onClick={() => setGenerateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add bins
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Bins</CardDescription>
              <CardTitle className="text-2xl">{data?.totals.bins ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Occupied</CardDescription>
              <CardTitle className="text-2xl">{data?.totals.occupied ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Units stored</CardDescription>
              <CardTitle className="text-2xl">{data?.totals.units ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Capacity used</CardDescription>
              <CardTitle className="text-2xl">{fill ?? "—"}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Grid3x3 className="h-4 w-4" />
              Walking order
            </CardTitle>
            <CardDescription>
              Top to bottom is the route. Turn serpentine picking on or off in Warehouse settings,
              then resequence.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading bins…
              </div>
            ) : bins.length === 0 ? (
              <div className="space-y-3 py-12 text-center">
                <Boxes className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No bins yet. Add a zone and the racking is numbered for you.
                </p>
                <Button size="sm" onClick={() => setGenerateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add bins
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Bin</TableHead>
                      <TableHead>Contents</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Capacity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bins.map((bin, index) => (
                      <TableRow key={bin.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                        <TableCell className="font-mono text-sm font-medium">{bin.code}</TableCell>
                        <TableCell className="max-w-[320px]">
                          {bin.lines.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Empty</span>
                          ) : (
                            <div className="space-y-0.5">
                              {bin.lines.map((line) => (
                                <div
                                  key={`${line.productId}-${line.batchCode ?? ""}`}
                                  className="truncate text-sm"
                                >
                                  <span className="font-medium">{line.sku}</span>{" "}
                                  <span className="text-muted-foreground">{line.name}</span>
                                  {line.batchCode ? (
                                    <span className="text-muted-foreground"> · lot {line.batchCode}</span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{bin.used}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {bin.maxUnits ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={bin.status === "active" ? "secondary" : "destructive"}>
                              {bin.status}
                            </Badge>
                            {!bin.isPickable ? <Badge variant="outline">bulk</Badge> : null}
                            {bin.maxUnits !== null && bin.used > bin.maxUnits ? (
                              <Badge variant="destructive">over</Badge>
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

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add bins</DialogTitle>
            <DialogDescription>
              Numbers a whole zone as ZONE-AISLE-RACK-LEVEL. Re-running skips bins that already
              exist, so this is safe after adding an aisle.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bin-zone">Zone</Label>
              <Input
                id="bin-zone"
                value={spec.zone}
                onChange={(e) => setSpec({ ...spec, zone: e.target.value })}
                placeholder="A"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bin-aisles">Aisles</Label>
              <Input
                id="bin-aisles"
                type="number"
                min={1}
                value={spec.aisles}
                onChange={(e) => setSpec({ ...spec, aisles: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bin-racks">Racks per aisle</Label>
              <Input
                id="bin-racks"
                type="number"
                min={1}
                value={spec.racksPerAisle}
                onChange={(e) => setSpec({ ...spec, racksPerAisle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bin-levels">Levels</Label>
              <Input
                id="bin-levels"
                type="number"
                min={1}
                value={spec.levels}
                onChange={(e) => setSpec({ ...spec, levels: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bin-max">Units per bin</Label>
              <Input
                id="bin-max"
                type="number"
                min={1}
                value={spec.maxUnits}
                onChange={(e) => setSpec({ ...spec, maxUnits: e.target.value })}
                placeholder="Leave blank for no limit"
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {Number(spec.aisles) > 0 && Number(spec.racksPerAisle) > 0 && Number(spec.levels) > 0
              ? `${Number(spec.aisles) * Number(spec.racksPerAisle) * Number(spec.levels)} bins, ${spec.zone.toUpperCase() || "?"}-01-1-1 to ${spec.zone.toUpperCase() || "?"}-${String(spec.aisles).padStart(2, "0")}-${spec.racksPerAisle}-${spec.levels}.`
              : "Enter aisles, racks and levels."}
          </p>

          {specError ? <p className="text-sm text-destructive">{specError}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Create bins
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
