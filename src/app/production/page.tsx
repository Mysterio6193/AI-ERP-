"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Boxes,
  Calendar,
  ChefHat,
  CheckCircle,
  Factory,
  FileText,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/types"

interface RecipeLine {
  id: string
  quantity: number
  unit: string
  wastePercent: number
  component: { id?: string; name: string; sku: string; baseUnit: string; costPrice: number }
}

interface Recipe {
  id: string
  name: string
  version: number
  yieldQty: number
  yieldUnit: string
  standardTimeMinutes: number | null
  instructions: string | null
  status: string
  productId: string
  product: { id?: string; name: string; sku: string }
  lines: RecipeLine[]
  capacity: { batches: number; outputQty: number; limitedBy: string | null } | null
  _count: { productionOrders: number }
}

interface Run {
  id: string
  orderNumber: string
  status: string
  batchCode: string | null
  plannedQty: number
  producedQty: number
  rejectedQty: number
  materialCost: number
  unitCost: number
  scheduledFor: string | null
  completedAt: string | null
  createdByAgent: boolean
  bomId: string | null
  product: { name: string; sku: string }
  bom: { name: string } | null
  consumptions: Array<{
    id: string
    plannedQty: number
    actualQty: number
    batchCode: string | null
    component: { name: string; sku: string }
  }>
}

interface Trace {
  batchCode: string
  producedAs: Array<{
    orderNumber: string
    product: string
    producedQty: number
    madeFrom: Array<{ component: string; qty: number; supplierBatch: string | null }>
  }>
  usedIn: Array<{ orderNumber: string; product: string; component: string; qty: number }>
  shippedTo: Array<{
    customer: string
    phone: string | null
    orderNumber: string
    product: string
    quantity: number
  }>
  customersAffected: string[]
}

interface ProductOption {
  id: string
  name: string
  sku: string
  baseUnit: string
  costPrice: number
}

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  planned: "outline",
  released: "outline",
  in_progress: "default",
  completed: "secondary",
  cancelled: "destructive",
}

function money(value: number) {
  // Follows the company's country rather than assuming a dollar sign.
  return formatCurrency(value)
}

export default function ProductionPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState("runs")
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  const [batchQuery, setBatchQuery] = useState("")
  const [trace, setTrace] = useState<Trace | null>(null)

  // Plan Run Modal State
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [selectedRecipeForPlan, setSelectedRecipeForPlan] = useState<Recipe | null>(null)
  const [planBatches, setPlanBatches] = useState(1)
  const [planScheduledDate, setPlanScheduledDate] = useState("")
  const [planNotes, setPlanNotes] = useState("")

  // Complete Run & QA Modal State
  const [completeModalOpen, setCompleteModalOpen] = useState(false)
  const [selectedRunForComplete, setSelectedRunForComplete] = useState<Run | null>(null)
  const [producedQtyInput, setProducedQtyInput] = useState(0)
  const [rejectedQtyInput, setRejectedQtyInput] = useState(0)
  const [qaNotes, setQaNotes] = useState("")

  // Create Recipe (BOM) Modal State
  const [createBomOpen, setCreateBomOpen] = useState(false)
  const [bomName, setBomName] = useState("")
  const [bomProductId, setBomProductId] = useState("")
  const [bomYieldQty, setBomYieldQty] = useState(100)
  const [bomYieldUnit, setBomYieldUnit] = useState("carton")
  const [bomStandardTime, setBomStandardTime] = useState(60)
  const [bomInstructions, setBomInstructions] = useState("")
  const [bomLines, setBomLines] = useState<
    Array<{ componentId: string; quantity: number; unit: string; wastePercent: number }>
  >([
    { componentId: "", quantity: 1, unit: "kg", wastePercent: 0 },
  ])

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const [recipeData, runData, productData] = await Promise.all([
        fetch("/api/production?view=recipes").then((response) => response.json()),
        fetch("/api/production").then((response) => response.json()),
        fetch("/api/products").then((response) => response.json()).catch(() => ({ success: false })),
      ])

      if (recipeData.success) setRecipes(recipeData.data)
      if (runData.success) setRuns(runData.data)
      if (productData.success) setProducts(productData.data || [])
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
        const result = await fetch("/api/production", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((response) => response.json())

        if (!result.success) {
          toast({
            variant: "destructive",
            title: "Production action failed",
            description: result.error || "Operation failed",
          })
          return null
        }

        await load()
        toast({
          title: "Production updated",
          description: "Operation completed successfully.",
        })
        return result.data
      } finally {
        setActing(null)
      }
    },
    [load, toast]
  )

  // Handlers for interactive modals
  function handleOpenPlan(recipe?: Recipe) {
    const target = recipe || recipes[0] || null
    setSelectedRecipeForPlan(target)
    setPlanBatches(1)
    setPlanScheduledDate(new Date().toISOString().slice(0, 10))
    setPlanNotes("")
    setPlanModalOpen(true)
  }

  async function handleConfirmPlan() {
    if (!selectedRecipeForPlan) return
    const res = await act(
      {
        action: "plan",
        bomId: selectedRecipeForPlan.id,
        batches: planBatches,
        scheduledFor: planScheduledDate || undefined,
        notes: planNotes || undefined,
      },
      selectedRecipeForPlan.id
    )
    if (res) {
      setPlanModalOpen(false)
    }
  }

  function handleOpenComplete(run: Run) {
    setSelectedRunForComplete(run)
    setProducedQtyInput(run.plannedQty)
    setRejectedQtyInput(0)
    setQaNotes("Batch passed visual, density, and safety QA standards.")
    setCompleteModalOpen(true)
  }

  async function handleConfirmComplete() {
    if (!selectedRunForComplete) return
    const res = await act(
      {
        action: "complete",
        id: selectedRunForComplete.id,
        producedQty: Number(producedQtyInput),
        rejectedQty: Number(rejectedQtyInput),
        notes: qaNotes,
      },
      selectedRunForComplete.id
    )
    if (res) {
      setCompleteModalOpen(false)
    }
  }

  function addBomLine() {
    setBomLines((prev) => [
      ...prev,
      { componentId: "", quantity: 1, unit: "kg", wastePercent: 0 },
    ])
  }

  function removeBomLine(index: number) {
    setBomLines((prev) => prev.filter((_, idx) => idx !== index))
  }

  function updateBomLine(index: number, field: string, value: any) {
    setBomLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line))
    )
  }

  async function handleSaveRecipe() {
    if (!bomName.trim() || !bomProductId) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please provide a recipe name and select a finished good product.",
      })
      return
    }

    const validLines = bomLines.filter((l) => Boolean(l.componentId))
    if (validLines.length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please specify at least one component ingredient line.",
      })
      return
    }

    const res = await act(
      {
        action: "create_recipe",
        name: bomName,
        productId: bomProductId,
        yieldQty: Number(bomYieldQty) || 1,
        yieldUnit: bomYieldUnit,
        standardTimeMinutes: Number(bomStandardTime) || null,
        instructions: bomInstructions || null,
        lines: validLines,
      },
      "create-recipe"
    )

    if (res) {
      setCreateBomOpen(false)
      setBomName("")
      setBomProductId("")
      setBomLines([{ componentId: "", quantity: 1, unit: "kg", wastePercent: 0 }])
    }
  }

  // Aggregate production metrics
  const metrics = useMemo(() => {
    const totalRuns = runs.length
    const inProgressRuns = runs.filter((r) => r.status === "in_progress").length
    const completedRuns = runs.filter((r) => r.status === "completed")
    const totalProduced = completedRuns.reduce((sum, r) => sum + r.producedQty, 0)
    const totalPlanned = completedRuns.reduce((sum, r) => sum + r.plannedQty, 0)
    const overallYield = totalPlanned > 0 ? (totalProduced / totalPlanned) * 100 : 100
    const totalMaterialCost = completedRuns.reduce((sum, r) => sum + r.materialCost, 0)

    return {
      totalRuns,
      inProgressRuns,
      completedRuns: completedRuns.length,
      overallYield: overallYield.toFixed(1),
      totalMaterialCost,
      totalRecipes: recipes.length,
    }
  }, [runs, recipes])

  return (
    <AppShell title="Production">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Manufacturing & Work Orders</h1>
            <p className="text-sm text-muted-foreground">
              Bills of Materials (BOM), batch production runs, capacity, and lot traceability.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenPlan()}
              disabled={recipes.length === 0}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" /> Plan Run
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setCreateBomOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New Recipe / BOM
            </Button>
          </div>
        </div>

        {/* Manufacturing KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Factory className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Work Orders</p>
                <p className="text-xl font-bold">{metrics.inProgressRuns} running</p>
                <p className="text-[11px] text-muted-foreground">{metrics.totalRuns} total scheduled</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overall Yield Rate</p>
                <p className="text-xl font-bold">{metrics.overallYield}%</p>
                <p className="text-[11px] text-emerald-600">{metrics.completedRuns} batches completed</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <ChefHat className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Recipes (BOMs)</p>
                <p className="text-xl font-bold">{metrics.totalRecipes} BOMs</p>
                <p className="text-[11px] text-muted-foreground">Multi-stage formulations</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Material Cost</p>
                <p className="text-xl font-bold">{money(metrics.totalMaterialCost)}</p>
                <p className="text-[11px] text-muted-foreground">Automated COGS deduction</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="runs">Production Runs & Work Orders</TabsTrigger>
            <TabsTrigger value="recipes">Recipes & Bills of Materials</TabsTrigger>
            <TabsTrigger value="trace">Batch & Lot Traceability</TabsTrigger>
          </TabsList>

          {/* ---------------- Runs ---------------- */}
          <TabsContent value="runs" className="mt-4 space-y-3">
            {!runs.length ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  <Factory className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold text-slate-800">No production runs yet</p>
                  <p className="text-xs mt-1">Select a recipe from the Recipes tab or click "Plan Run" above.</p>
                </CardContent>
              </Card>
            ) : (
              runs.map((run) => (
                <Card key={run.id} className="transition-all hover:border-slate-300">
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold text-xs text-slate-900">{run.orderNumber}</span>
                          <Badge variant={STATUS_TONE[run.status] || "outline"} className="text-[10px]">
                            {run.status.replace(/_/g, " ")}
                          </Badge>
                          {run.batchCode ? (
                            <Badge variant="outline" className="font-mono text-[10px] bg-slate-50">
                              Lot: {run.batchCode}
                            </Badge>
                          ) : null}
                          {run.scheduledFor ? (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(run.scheduledFor).toLocaleDateString()}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-slate-900">{run.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {run.status === "completed"
                            ? `Made ${run.producedQty} of ${run.plannedQty} planned` +
                              (run.rejectedQty ? ` · ${run.rejectedQty} rejected` : "") +
                              ` · yield ${((run.producedQty / (run.plannedQty || 1)) * 100).toFixed(1)}%` +
                              ` · unit cost ${money(run.unitCost)}`
                            : `Planned ${run.plannedQty} units` +
                              (run.bom ? ` · Recipe: ${run.bom.name}` : "")}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                        >
                          {expanded === run.id ? "Hide Materials" : "View Materials"}
                        </Button>

                        {run.status === "planned" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100"
                            disabled={acting === run.id}
                            onClick={() => void act({ action: "start", id: run.id }, run.id)}
                          >
                            <Play className="h-3 w-3 mr-1" /> Start Run
                          </Button>
                        ) : null}

                        {run.status === "in_progress" || run.status === "planned" ? (
                          <Button
                            size="sm"
                            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700"
                            disabled={acting === run.id}
                            onClick={() => handleOpenComplete(run)}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Complete & QA
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {expanded === run.id ? (
                      <div className="space-y-2 rounded-xl border bg-slate-50/70 p-3">
                        <p className="text-xs font-semibold text-slate-700">Required Ingredients & Bill of Materials</p>
                        <div className="space-y-1.5">
                          {run.consumptions.map((line) => (
                            <div
                              key={line.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white rounded-lg p-2 border"
                            >
                              <span className="font-medium text-slate-800">{line.component.name}</span>
                              <span className="text-muted-foreground">
                                Planned: <strong className="text-slate-900">{line.plannedQty}</strong>
                                {run.status === "completed" ? ` · Actual: ${line.actualQty}` : ""}
                                {line.batchCode ? ` · Lot: ${line.batchCode}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                        {run.status === "completed" ? (
                          <div className="flex justify-between items-center border-t pt-2 text-xs font-semibold text-slate-900">
                            <span>Total Batch Material Cost</span>
                            <span>{money(run.materialCost)}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ---------------- Recipes ---------------- */}
          <TabsContent value="recipes" className="mt-4 space-y-3">
            {!recipes.length ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold text-slate-800">No recipes configured</p>
                  <p className="text-xs mt-1">Create your first Bill of Materials (BOM) to start planning runs.</p>
                  <Button
                    size="sm"
                    className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setCreateBomOpen(true)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Recipe
                  </Button>
                </CardContent>
              </Card>
            ) : (
              recipes.map((recipe) => (
                <Card key={recipe.id} className="transition-all hover:border-slate-300">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          <ChefHat className="h-4 w-4 shrink-0 text-emerald-600" />
                          {recipe.name}
                          <Badge variant="outline" className="text-[10px]">
                            v{recipe.version}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Yields {recipe.yieldQty} {recipe.yieldUnit} of <strong>{recipe.product.name}</strong>
                          {recipe.standardTimeMinutes
                            ? ` · ${Math.round(recipe.standardTimeMinutes / 60)}h labor`
                            : ""}
                          {` · ${recipe._count.productionOrders} runs logged`}
                        </CardDescription>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        {recipe.capacity ? (
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-900">
                              {recipe.capacity.batches} batch
                              {recipe.capacity.batches === 1 ? "" : "es"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              possible from on-hand stock
                            </p>
                          </div>
                        ) : null}
                        <Button
                          size="sm"
                          className="bg-slate-900 hover:bg-slate-800"
                          disabled={acting === recipe.id || recipe.capacity?.batches === 0}
                          onClick={() => handleOpenPlan(recipe)}
                        >
                          <Play className="h-3 w-3 mr-1.5" /> Plan Run
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {recipe.capacity?.limitedBy && recipe.capacity.batches < 3 ? (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        Production capacity currently bottlenecked by <strong>{recipe.capacity.limitedBy}</strong>.
                      </div>
                    ) : null}

                    <div className="space-y-1.5 rounded-xl border bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-700 mb-1">Formulation & Bill of Materials</p>
                      {recipe.lines.map((line) => (
                        <div
                          key={line.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white rounded-lg p-2 border"
                        >
                          <span className="font-medium text-slate-800">{line.component.name}</span>
                          <span className="text-muted-foreground">
                            {line.quantity} {line.unit}
                            {line.wastePercent ? ` (+${line.wastePercent}% scrap allowance)` : ""}
                          </span>
                        </div>
                      ))}
                    </div>

                    {recipe.instructions ? (
                      <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                        <span className="font-semibold text-slate-700">Standard Operating Procedure: </span>
                        {recipe.instructions}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ---------------- Traceability ---------------- */}
          <TabsContent value="trace" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-4 w-4 text-indigo-600" />
                  Forward & Backward Lot Traceability
                </CardTitle>
                <CardDescription>
                  Enter a finished batch code to trace upstream ingredient suppliers, or enter a supplier lot code to perform a full recall blast-radius audit.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={batchQuery}
                    onChange={(event) => setBatchQuery(event.target.value)}
                    placeholder="Enter Finished Lot (e.g. BATCH-2026-001) or Supplier Lot (e.g. MANILDRA-L2291)"
                    className="font-mono text-xs"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur()
                      }
                    }}
                  />
                  <Button
                    disabled={!batchQuery.trim() || acting === "trace"}
                    onClick={async () => {
                      setActing("trace")

                      try {
                        const result = await fetch(
                          `/api/production?view=trace&batchCode=${encodeURIComponent(batchQuery.trim())}`
                        ).then((response) => response.json())

                        if (result.success) setTrace(result.data)
                      } finally {
                        setActing(null)
                      }
                    }}
                  >
                    <Search className="mr-1.5 h-4 w-4" />
                    Trace Lot
                  </Button>
                </div>

                {trace ? (
                  <div className="space-y-4 pt-2">
                    {trace.customersAffected.length ? (
                      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-2">
                        <p className="text-sm font-bold text-destructive flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {trace.customersAffected.length} Customer
                          {trace.customersAffected.length === 1 ? "" : "s"} Received Product from this Lot
                        </p>
                        <div className="space-y-1.5">
                          {trace.shippedTo.slice(0, 20).map((row, index) => (
                            <div key={index} className="flex justify-between items-center gap-2 text-xs bg-white p-2 rounded-lg border">
                              <span className="font-medium text-slate-800">
                                {row.customer}
                                {row.phone ? ` (${row.phone})` : ""}
                              </span>
                              <span className="text-muted-foreground">
                                Order <strong>{row.orderNumber}</strong> · {row.quantity} × {row.product}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {trace.usedIn.length ? (
                      <div className="rounded-xl border bg-slate-50 p-4 space-y-2">
                        <p className="text-xs font-semibold text-slate-800 uppercase tracking-wider">Used in Downstream Production Runs</p>
                        <div className="space-y-1">
                          {trace.usedIn.map((row, index) => (
                            <p key={index} className="text-xs text-slate-700 bg-white p-2 rounded border">
                              Run <strong>{row.orderNumber}</strong>: {row.qty} of {row.component} used to formulate {row.product}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {trace.producedAs.map((run) => (
                      <div key={run.orderNumber} className="rounded-xl border p-4 space-y-2">
                        <p className="text-xs font-semibold text-slate-800">
                          Work Order <strong>{run.orderNumber}</strong> produced {run.producedQty} × {run.product}
                        </p>
                        <div className="space-y-1">
                          {run.madeFrom.map((line, index) => (
                            <div key={index} className="flex justify-between gap-2 text-xs text-muted-foreground bg-slate-50 p-1.5 rounded">
                              <span>{line.component} ({line.qty})</span>
                              <span>{line.supplierBatch ? `Supplier Lot: ${line.supplierBatch}` : "Internal Stock"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {!trace.usedIn.length && !trace.producedAs.length ? (
                      <p className="rounded-xl border p-4 text-xs text-muted-foreground text-center">
                        No upstream or downstream movements recorded for lot code "{batchQuery}".
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ---------------- Plan Run Modal ---------------- */}
      <Dialog open={planModalOpen} onOpenChange={setPlanModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-blue-600" />
              Plan Production Run
            </DialogTitle>
            <DialogDescription>
              Schedule a new manufacturing batch and reserve warehouse raw materials.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Selected Recipe (BOM)</Label>
              <Select
                value={selectedRecipeForPlan?.id || ""}
                onValueChange={(val) => {
                  const rec = recipes.find((r) => r.id === val) || null
                  setSelectedRecipeForPlan(rec)
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select Recipe" /></SelectTrigger>
                <SelectContent>
                  {recipes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} ({r.product.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRecipeForPlan && (
              <div className="rounded-xl border bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Standard Yield:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedRecipeForPlan.yieldQty} {selectedRecipeForPlan.yieldUnit} / batch
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Feasible Batches:</span>
                  <span className="font-semibold text-emerald-700">
                    {selectedRecipeForPlan.capacity?.batches ?? 0} batches based on raw materials
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Batch Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={planBatches}
                  onChange={(e) => setPlanBatches(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Scheduled Date</Label>
                <Input
                  type="date"
                  value={planScheduledDate}
                  onChange={(e) => setPlanScheduledDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Production Run Notes</Label>
              <Textarea
                rows={2}
                placeholder="Shift instructions, priority, line allocation..."
                value={planNotes}
                onChange={(e) => setPlanNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPlanModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleConfirmPlan}
              disabled={!selectedRecipeForPlan}
            >
              Confirm & Plan Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Complete & QA Modal ---------------- */}
      <Dialog open={completeModalOpen} onOpenChange={setCompleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              Complete Work Order & Quality Assurance
            </DialogTitle>
            <DialogDescription>
              Record actual finished good output, scrap, and QA inspection approval.
            </DialogDescription>
          </DialogHeader>

          {selectedRunForComplete && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Work Order:</span>
                  <span className="font-mono font-semibold">{selectedRunForComplete.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Product:</span>
                  <span className="font-semibold">{selectedRunForComplete.product.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Planned Output:</span>
                  <span className="font-semibold text-slate-900">{selectedRunForComplete.plannedQty} units</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Good Units Produced</Label>
                  <Input
                    type="number"
                    min="0"
                    value={producedQtyInput}
                    onChange={(e) => setProducedQtyInput(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Rejected / Scrapped</Label>
                  <Input
                    type="number"
                    min="0"
                    value={rejectedQtyInput}
                    onChange={(e) => setRejectedQtyInput(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Quality Inspection & Sign-off Notes</Label>
                <Textarea
                  rows={2}
                  value={qaNotes}
                  onChange={(e) => setQaNotes(e.target.value)}
                  placeholder="Passed QA, temperature, packaging, label checks..."
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCompleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleConfirmComplete}
            >
              Finish Run & Restock Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Create Recipe (BOM) Modal ---------------- */}
      <Dialog open={createBomOpen} onOpenChange={setCreateBomOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-emerald-600" />
              Create Bill of Materials (BOM Recipe)
            </DialogTitle>
            <DialogDescription>
              Define multi-stage formulations, raw ingredient requirements, scrap allowances, and standard cycle time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Recipe Name</Label>
                <Input
                  placeholder="e.g. Standard 500g Roasted Coffee Blend"
                  value={bomName}
                  onChange={(e) => setBomName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Output Finished Good</Label>
                <Select value={bomProductId} onValueChange={setBomProductId}>
                  <SelectTrigger><SelectValue placeholder="Select Finished Product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Yield Quantity / Batch</Label>
                <Input
                  type="number"
                  min="1"
                  value={bomYieldQty}
                  onChange={(e) => setBomYieldQty(Number(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Yield Unit</Label>
                <Input
                  placeholder="carton, kg, units"
                  value={bomYieldUnit}
                  onChange={(e) => setBomYieldUnit(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Labor Time (Minutes)</Label>
                <Input
                  type="number"
                  min="0"
                  value={bomStandardTime}
                  onChange={(e) => setBomStandardTime(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Raw Material Ingredients
                </Label>
                <Button type="button" size="sm" variant="outline" onClick={addBomLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Ingredient
                </Button>
              </div>

              <div className="space-y-2">
                {bomLines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border">
                    <div className="flex-1">
                      <Select
                        value={line.componentId}
                        onValueChange={(val) => updateBomLine(idx, "componentId", val)}
                      >
                        <SelectTrigger className="bg-white text-xs"><SelectValue placeholder="Select Component Product" /></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Qty"
                        className="bg-white text-xs"
                        value={line.quantity}
                        onChange={(e) => updateBomLine(idx, "quantity", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        placeholder="Unit"
                        className="bg-white text-xs"
                        value={line.unit}
                        onChange={(e) => updateBomLine(idx, "unit", e.target.value)}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Waste %"
                        className="bg-white text-xs"
                        value={line.wastePercent}
                        onChange={(e) => updateBomLine(idx, "wastePercent", Number(e.target.value) || 0)}
                      />
                    </div>
                    {bomLines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeBomLine(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <Label className="text-xs">Standard Operating Procedure / Manufacturing Instructions</Label>
              <Textarea
                rows={3}
                placeholder="Step 1: Weigh ingredients. Step 2: Heat to 85°C. Step 3: Package into sterile containers..."
                value={bomInstructions}
                onChange={(e) => setBomInstructions(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateBomOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSaveRecipe}
            >
              Save Recipe & BOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
