"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Factory, Gauge, Plus, Save, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

/**
 * Work centres and routings.
 *
 * The two screens sit together because they are two halves of one question:
 * a routing says how long a step takes, a work centre says whether there are
 * enough hours in the week to take it.
 */

interface WorkCenter {
  id: string
  code: string
  name: string
  description: string | null
  warehouseId: string | null
  warehouse: { id: string; name: string } | null
  minutesPerDay: number | null
  effectiveMinutesPerDay: number
  parallelCapacity: number
  efficiencyPercent: number
  costPerHour: number
  setupMinutes: number
  status: string
  load: {
    bookedMinutes: number
    availableMinutes: number
    utilisationPercent: number
    overloaded: boolean
    operationCount: number
  } | null
}

interface RoutingStep {
  id?: string
  sequence: number
  name: string
  workCenterId: string | null
  /** Null means inherit from the work centre, then from settings. */
  setupMinutes: number | null
  runMinutesPerUnit: number
  queueMinutes: number | null
  moveMinutes: number | null
  scrapPercent: number
  instructions: string | null
}

interface ScheduleStep {
  sequence: number
  name: string
  workCenter: string | null
  inputQty: number
  outputQty: number
  scrapQty: number
  setupMinutes: number
  runMinutes: number
  workMinutes: number
  elapsedMinutes: number
  laborCost: number
}

interface Schedule {
  steps: ScheduleStep[]
  totalWorkMinutes: number
  totalElapsedMinutes: number
  totalLaborCost: number
  requiredInputQty: number
  leadTimeDays: number
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  maintenance: "bg-amber-100 text-amber-700",
  retired: "bg-slate-200 text-slate-600",
}

function minutes(value: number) {
  if (value < 60) return `${value}m`
  const hours = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export default function WorkCentersPage() {
  const { toast } = useToast()

  const [centers, setCenters] = useState<WorkCenter[]>([])
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([])
  const [boms, setBoms] = useState<Array<{ id: string; name: string; yieldQty: number; yieldUnit: string }>>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState({
    code: "",
    name: "",
    warehouseId: "",
    minutesPerDay: "",
    parallelCapacity: 1,
    efficiencyPercent: 100,
    costPerHour: 0,
    setupMinutes: 0,
  })

  const [selectedBom, setSelectedBom] = useState<string>("")
  const [steps, setSteps] = useState<RoutingStep[]>([])
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [previewQty, setPreviewQty] = useState<number>(0)
  const [sequenceStep, setSequenceStep] = useState(10)
  const [savingRouting, setSavingRouting] = useState(false)

  const loadCenters = useCallback(async () => {
    try {
      const result = await fetch("/api/work-centers").then((response) => response.json())
      if (result.success) {
        setCenters(result.data)
        if (result.meta?.settings?.sequenceStep) {
          setSequenceStep(result.meta.settings.sequenceStep)
        }
      }
    } catch {
      toast({ title: "Could not load work centres", variant: "destructive" })
    }
  }, [toast])

  useEffect(() => {
    const boot = async () => {
      setLoading(true)
      await loadCenters()
      try {
        const [wh, bom] = await Promise.all([
          fetch("/api/warehouses").then((r) => r.json()),
          fetch("/api/production?view=recipes").then((r) => r.json()),
        ])
        if (wh.success) setWarehouses(wh.data.map((w: any) => ({ id: w.id, name: w.name })))
        if (bom.success) setBoms(bom.data)
      } catch {
        // Reference data is a convenience here; the page still works without it.
      }
      setLoading(false)
    }
    boot()
  }, [loadCenters])

  const loadRouting = useCallback(
    async (bomId: string, qty?: number) => {
      if (!bomId) return
      try {
        const url = `/api/routings/${bomId}${qty ? `?qty=${qty}` : ""}`
        const result = await fetch(url).then((response) => response.json())
        if (result.success) {
          setSteps(
            result.data.steps.map((step: any) => ({
              id: step.id,
              sequence: step.sequence,
              name: step.name,
              workCenterId: step.workCenterId,
              setupMinutes: step.setupMinutes,
              runMinutesPerUnit: step.runMinutesPerUnit,
              queueMinutes: step.queueMinutes,
              moveMinutes: step.moveMinutes,
              scrapPercent: step.scrapPercent,
              instructions: step.instructions,
            }))
          )
          setSchedule(result.data.schedule)
          setPreviewQty(result.data.previewQty)
        }
      } catch {
        toast({ title: "Could not load routing", variant: "destructive" })
      }
    },
    [toast]
  )

  useEffect(() => {
    if (selectedBom) loadRouting(selectedBom)
  }, [selectedBom, loadRouting])

  const createCenter = async () => {
    try {
      const response = await fetch("/api/work-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: draft.code,
          name: draft.name,
          warehouseId: draft.warehouseId || null,
          // Blank means inherit, which is not the same as zero.
          minutesPerDay: draft.minutesPerDay === "" ? null : Number(draft.minutesPerDay),
          parallelCapacity: Number(draft.parallelCapacity),
          efficiencyPercent: Number(draft.efficiencyPercent),
          costPerHour: Number(draft.costPerHour),
          setupMinutes: Number(draft.setupMinutes),
        }),
      })
      const result = await response.json()

      if (!result.success) {
        toast({ title: result.error || "Could not create work centre", variant: "destructive" })
        return
      }

      toast({ title: `${result.data.code} created` })
      setCreateOpen(false)
      setDraft({ code: "", name: "", warehouseId: "", minutesPerDay: "", parallelCapacity: 1, efficiencyPercent: 100, costPerHour: 0, setupMinutes: 0 })
      loadCenters()
    } catch {
      toast({ title: "Could not create work centre", variant: "destructive" })
    }
  }

  const removeCenter = async (center: WorkCenter) => {
    try {
      const result = await fetch(`/api/work-centers/${center.id}`, { method: "DELETE" }).then((r) => r.json())
      toast({ title: result.message || `${center.code} removed` })
      loadCenters()
    } catch {
      toast({ title: "Could not remove work centre", variant: "destructive" })
    }
  }

  const addStep = () => {
    const last = steps.at(-1)
    setSteps([
      ...steps,
      {
        sequence: last ? last.sequence + sequenceStep : sequenceStep,
        name: "",
        workCenterId: null,
        setupMinutes: null,
        runMinutesPerUnit: 0,
        queueMinutes: null,
        moveMinutes: null,
        scrapPercent: 0,
        instructions: null,
      },
    ])
  }

  const updateStep = (index: number, field: keyof RoutingStep, value: any) => {
    setSteps(steps.map((step, i) => (i === index ? { ...step, [field]: value } : step)))
  }

  const saveRouting = async () => {
    if (!selectedBom) return
    setSavingRouting(true)
    try {
      const response = await fetch(`/api/routings/${selectedBom}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps, previewQty }),
      })
      const result = await response.json()

      if (!result.success) {
        toast({ title: result.error || "Could not save routing", variant: "destructive" })
        return
      }

      setSchedule(result.data.schedule)
      toast({ title: `Routing saved — ${minutes(result.data.schedule.totalElapsedMinutes)} lead time` })
      loadCenters()
    } catch {
      toast({ title: "Could not save routing", variant: "destructive" })
    } finally {
      setSavingRouting(false)
    }
  }

  const overloaded = useMemo(() => centers.filter((c) => c.load?.overloaded).length, [centers])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Work Centres & Routings</h1>
          <p className="text-sm text-muted-foreground">
            Where work happens, how long each step takes, and whether the week has room for it.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Work Centre
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Work centres</p>
            <p className="text-2xl font-bold">{centers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Over capacity</p>
            <p className={`text-2xl font-bold ${overloaded ? "text-red-600" : ""}`}>{overloaded}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Booked minutes</p>
            <p className="text-2xl font-bold">
              {centers.reduce((sum, c) => sum + (c.load?.bookedMinutes || 0), 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="centers">
        <TabsList className="grid w-full grid-cols-2 sm:max-w-md">
          <TabsTrigger value="centers">Work Centres</TabsTrigger>
          <TabsTrigger value="routings">Routings</TabsTrigger>
        </TabsList>

        <TabsContent value="centers" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4" />
                Capacity
              </CardTitle>
              <CardDescription>
                Utilisation counts outstanding work, including steps not yet given a date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-right">Per day</TableHead>
                    <TableHead className="text-right">Parallel</TableHead>
                    <TableHead className="text-right">Efficiency</TableHead>
                    <TableHead className="text-right">Rate/hr</TableHead>
                    <TableHead className="text-right">Utilisation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : centers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                        No work centres yet. Add the machines and benches work actually happens on.
                      </TableCell>
                    </TableRow>
                  ) : (
                    centers.map((center) => (
                      <TableRow key={center.id}>
                        <TableCell className="font-mono text-xs font-medium">{center.code}</TableCell>
                        <TableCell className="min-w-40 whitespace-normal">{center.name}</TableCell>
                        <TableCell className="text-muted-foreground">{center.warehouse?.name || "—"}</TableCell>
                        <TableCell className="text-right">
                          {minutes(center.effectiveMinutesPerDay)}
                          {center.minutesPerDay === null && (
                            <span className="ml-1 text-[10px] text-muted-foreground">inherited</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">×{center.parallelCapacity}</TableCell>
                        <TableCell className="text-right">{center.efficiencyPercent}%</TableCell>
                        <TableCell className="text-right">${center.costPerHour.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {center.load ? (
                            <span className={center.load.overloaded ? "font-semibold text-red-600" : ""}>
                              {center.load.utilisationPercent}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[center.status] || ""}>{center.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeCenter(center)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routings" className="mt-4 space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Factory className="h-4 w-4" />
                Method
              </CardTitle>
              <CardDescription>
                Steps for one recipe. Sequence numbers are spaced so a step can be inserted later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Recipe</Label>
                  <Select value={selectedBom} onValueChange={setSelectedBom}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a recipe to route" />
                    </SelectTrigger>
                    <SelectContent>
                      {boms.map((bom) => (
                        <SelectItem key={bom.id} value={bom.id}>
                          {bom.name} ({bom.yieldQty} {bom.yieldUnit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Preview quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={previewQty}
                    onChange={(event) => setPreviewQty(Number(event.target.value) || 0)}
                    onBlur={() => selectedBom && loadRouting(selectedBom, previewQty)}
                  />
                </div>
              </div>

              {selectedBom && (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Seq</TableHead>
                          <TableHead className="min-w-40">Step</TableHead>
                          <TableHead className="min-w-44">Work centre</TableHead>
                          <TableHead className="w-28">Setup</TableHead>
                          <TableHead className="w-32">Min/unit</TableHead>
                          <TableHead className="w-28">Queue</TableHead>
                          <TableHead className="w-28">Move</TableHead>
                          <TableHead className="w-28">Scrap %</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {steps.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                              No routing yet. This recipe schedules on its standard time alone.
                            </TableCell>
                          </TableRow>
                        ) : (
                          steps.map((step, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="h-8 min-w-20"
                                  value={step.sequence}
                                  onChange={(e) => updateStep(index, "sequence", Number(e.target.value) || 0)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8"
                                  placeholder="Mix, Bake, Pack"
                                  value={step.name}
                                  onChange={(e) => updateStep(index, "name", e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={step.workCenterId || "none"}
                                  onValueChange={(value) =>
                                    updateStep(index, "workCenterId", value === "none" ? null : value)
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Unassigned</SelectItem>
                                    {centers
                                      .filter((c) => c.status === "active")
                                      .map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                          {c.code} — {c.name}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  placeholder="inherit"
                                  className="h-8 min-w-20"
                                  value={step.setupMinutes ?? ""}
                                  onChange={(e) =>
                                    updateStep(index, "setupMinutes", e.target.value === "" ? null : Number(e.target.value))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="h-8 min-w-24"
                                  value={step.runMinutesPerUnit}
                                  onChange={(e) => updateStep(index, "runMinutesPerUnit", Number(e.target.value) || 0)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  placeholder="inherit"
                                  className="h-8 min-w-20"
                                  value={step.queueMinutes ?? ""}
                                  onChange={(e) =>
                                    updateStep(index, "queueMinutes", e.target.value === "" ? null : Number(e.target.value))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  placeholder="inherit"
                                  className="h-8 min-w-20"
                                  value={step.moveMinutes ?? ""}
                                  onChange={(e) =>
                                    updateStep(index, "moveMinutes", e.target.value === "" ? null : Number(e.target.value))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.1"
                                  className="h-8 min-w-20"
                                  value={step.scrapPercent}
                                  onChange={(e) => updateStep(index, "scrapPercent", Number(e.target.value) || 0)}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={addStep}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Step
                    </Button>
                    <Button onClick={saveRouting} disabled={savingRouting}>
                      <Save className="mr-2 h-4 w-4" />
                      {savingRouting ? "Saving…" : "Save Routing"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {schedule && schedule.steps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Schedule for {previewQty} unit{previewQty === 1 ? "" : "s"}
                </CardTitle>
                <CardDescription>
                  Machine time drives capacity; elapsed time is what a customer is promised.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] uppercase text-muted-foreground">Machine time</p>
                    <p className="text-lg font-semibold">{minutes(schedule.totalWorkMinutes)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] uppercase text-muted-foreground">Lead time</p>
                    <p className="text-lg font-semibold">{minutes(schedule.totalElapsedMinutes)}</p>
                    <p className="text-[11px] text-muted-foreground">{schedule.leadTimeDays} days</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] uppercase text-muted-foreground">Must start</p>
                    <p className="text-lg font-semibold">{schedule.requiredInputQty}</p>
                    <p className="text-[11px] text-muted-foreground">to finish {previewQty}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] uppercase text-muted-foreground">Labour cost</p>
                    <p className="text-lg font-semibold">${schedule.totalLaborCost.toFixed(2)}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Step</TableHead>
                        <TableHead>Work centre</TableHead>
                        <TableHead className="text-right">In</TableHead>
                        <TableHead className="text-right">Scrap</TableHead>
                        <TableHead className="text-right">Out</TableHead>
                        <TableHead className="text-right">Machine</TableHead>
                        <TableHead className="text-right">Elapsed</TableHead>
                        <TableHead className="text-right">Labour</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedule.steps.map((step) => (
                        <TableRow key={step.sequence}>
                          <TableCell className="min-w-32 whitespace-normal">
                            <span className="font-mono text-xs text-muted-foreground">{step.sequence}</span>{" "}
                            {step.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{step.workCenter || "Unassigned"}</TableCell>
                          <TableCell className="text-right">{step.inputQty}</TableCell>
                          <TableCell className="text-right text-amber-700">
                            {step.scrapQty ? step.scrapQty : "—"}
                          </TableCell>
                          <TableCell className="text-right">{step.outputQty}</TableCell>
                          <TableCell className="text-right">{minutes(step.workMinutes)}</TableCell>
                          <TableCell className="text-right">{minutes(step.elapsedMinutes)}</TableCell>
                          <TableCell className="text-right">${step.laborCost.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Work Centre</DialogTitle>
            <DialogDescription>
              Leave a field blank to inherit the manufacturing defaults from Settings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Code</Label>
              <Input
                placeholder="MIX-01"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="Mixing line 1"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Site</Label>
              <Select
                value={draft.warehouseId || "none"}
                onValueChange={(value) => setDraft({ ...draft, warehouseId: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Minutes per day</Label>
              <Input
                type="number"
                placeholder="inherit"
                value={draft.minutesPerDay}
                onChange={(e) => setDraft({ ...draft, minutesPerDay: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parallel units</Label>
              <Input
                type="number"
                min="1"
                value={draft.parallelCapacity}
                onChange={(e) => setDraft({ ...draft, parallelCapacity: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Efficiency %</Label>
              <Input
                type="number"
                value={draft.efficiencyPercent}
                onChange={(e) => setDraft({ ...draft, efficiencyPercent: Number(e.target.value) || 100 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cost per hour</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.costPerHour}
                onChange={(e) => setDraft({ ...draft, costPerHour: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createCenter} disabled={!draft.code || !draft.name}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
