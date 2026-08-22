"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, ChefHat, Factory, Loader2, RefreshCw, Search, ShieldAlert } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

interface RecipeLine {
  id: string
  quantity: number
  unit: string
  wastePercent: number
  component: { name: string; sku: string; baseUnit: string; costPrice: number }
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
  product: { name: string; sku: string }
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

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  planned: "outline",
  released: "outline",
  in_progress: "default",
  completed: "secondary",
  cancelled: "destructive",
}

function money(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ProductionPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState("runs")
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  const [batchQuery, setBatchQuery] = useState("")
  const [trace, setTrace] = useState<Trace | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const [recipeData, runData] = await Promise.all([
        fetch("/api/production?view=recipes").then((response) => response.json()),
        fetch("/api/production").then((response) => response.json()),
      ])

      if (recipeData.success) setRecipes(recipeData.data)
      if (runData.success) setRuns(runData.data)
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
    [load]
  )

  return (
    <AppShell title="Production">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Production</h1>
            <p className="text-sm text-muted-foreground">
              Recipes, batches, and which lot went into what.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="recipes">Recipes</TabsTrigger>
            <TabsTrigger value="trace">Trace a batch</TabsTrigger>
          </TabsList>

          {/* ---------------- Runs ---------------- */}
          <TabsContent value="runs" className="mt-4 space-y-2">
            {!runs.length ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {loading ? "Loading…" : "No production runs yet. Plan one from a recipe."}
                </CardContent>
              </Card>
            ) : (
              runs.map((run) => (
                <Card key={run.id}>
                  <CardContent className="space-y-2 pt-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">{run.orderNumber}</span>
                          <Badge variant={STATUS_TONE[run.status] || "outline"} className="text-[10px]">
                            {run.status.replace(/_/g, " ")}
                          </Badge>
                          {run.batchCode ? (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {run.batchCode}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm font-medium">{run.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {run.status === "completed"
                            ? `Made ${run.producedQty} of ${run.plannedQty} planned` +
                              (run.rejectedQty ? ` · ${run.rejectedQty} rejected` : "") +
                              ` · yield ${((run.producedQty / (run.plannedQty || 1)) * 100).toFixed(1)}%` +
                              ` · ${money(run.unitCost)}/unit`
                            : `Planned ${run.plannedQty}` +
                              (run.bom ? ` · ${run.bom.name}` : "")}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                        >
                          {expanded === run.id ? "Hide" : "Materials"}
                        </Button>

                        {run.status === "planned" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={acting === run.id}
                            onClick={() => void act({ action: "start", id: run.id }, run.id)}
                          >
                            Start
                          </Button>
                        ) : null}

                        {run.status === "in_progress" || run.status === "planned" ? (
                          <Button
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={acting === run.id}
                            onClick={() => {
                              const made = window.prompt(
                                `How many good units came out?\n(Planned ${run.plannedQty})`,
                                String(run.plannedQty)
                              )
                              if (made === null) return

                              const rejected = window.prompt("How many were rejected?", "0")
                              if (rejected === null) return

                              void act(
                                {
                                  action: "complete",
                                  id: run.id,
                                  producedQty: Number(made),
                                  rejectedQty: Number(rejected),
                                },
                                run.id
                              )
                            }}
                          >
                            Complete
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {expanded === run.id ? (
                      <div className="space-y-1 rounded-md border p-2">
                        {run.consumptions.map((line) => (
                          <div
                            key={line.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <span className="min-w-0 truncate">{line.component.name}</span>
                            <span className="shrink-0 text-muted-foreground">
                              planned {line.plannedQty}
                              {run.status === "completed" ? ` · used ${line.actualQty}` : ""}
                              {line.batchCode ? ` · lot ${line.batchCode}` : ""}
                            </span>
                          </div>
                        ))}
                        {run.status === "completed" ? (
                          <p className="border-t pt-1.5 text-xs font-medium">
                            Material cost {money(run.materialCost)}
                          </p>
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
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {loading ? "Loading…" : "No recipes yet."}
                </CardContent>
              </Card>
            ) : (
              recipes.map((recipe) => (
                <Card key={recipe.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          <ChefHat className="h-4 w-4 shrink-0" />
                          {recipe.name}
                          <Badge variant="outline" className="text-[10px]">
                            v{recipe.version}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Makes {recipe.yieldQty} {recipe.yieldUnit} of {recipe.product.name}
                          {recipe.standardTimeMinutes
                            ? ` · ${Math.round(recipe.standardTimeMinutes / 60)}h`
                            : ""}
                          {` · ${recipe._count.productionOrders} runs`}
                        </CardDescription>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {recipe.capacity ? (
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {recipe.capacity.batches} batch
                              {recipe.capacity.batches === 1 ? "" : "es"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              possible now
                            </p>
                          </div>
                        ) : null}
                        <Button
                          size="sm"
                          disabled={acting === recipe.id || recipe.capacity?.batches === 0}
                          onClick={() => {
                            const batches = window.prompt(
                              `How many batches?\n(Ingredients allow ${recipe.capacity?.batches ?? "?"})`,
                              "1"
                            )
                            if (batches === null) return

                            void act(
                              { action: "plan", bomId: recipe.id, batches: Number(batches) },
                              recipe.id
                            )
                          }}
                        >
                          Plan run
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {recipe.capacity?.limitedBy && recipe.capacity.batches < 3 ? (
                      <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        Limited by {recipe.capacity.limitedBy}
                      </div>
                    ) : null}

                    <div className="space-y-1">
                      {recipe.lines.map((line) => (
                        <div
                          key={line.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <span className="min-w-0 truncate">{line.component.name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {line.quantity} {line.unit}
                            {line.wastePercent ? ` · +${line.wastePercent}% waste` : ""}
                          </span>
                        </div>
                      ))}
                    </div>

                    {recipe.instructions ? (
                      <p className="border-t pt-2 text-xs text-muted-foreground">
                        {recipe.instructions}
                      </p>
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
                  <ShieldAlert className="h-4 w-4" />
                  Trace a batch
                </CardTitle>
                <CardDescription>
                  Enter a finished batch code to see what went into it, or a supplier lot to see
                  which runs used it and who received the result.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={batchQuery}
                    onChange={(event) => setBatchQuery(event.target.value)}
                    placeholder="RDMNAP-20260822 or MANILDRA-L2291"
                    className="h-8 font-mono text-xs"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur()
                      }
                    }}
                  />
                  <Button
                    size="sm"
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
                    <Search className="mr-1.5 h-3 w-3" />
                    Trace
                  </Button>
                </div>

                {trace ? (
                  <div className="space-y-3">
                    {trace.customersAffected.length ? (
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                        <p className="text-sm font-medium text-destructive">
                          {trace.customersAffected.length} customer
                          {trace.customersAffected.length === 1 ? "" : "s"} received product from
                          this lot
                        </p>
                        <div className="mt-2 space-y-1">
                          {trace.shippedTo.slice(0, 20).map((row, index) => (
                            <div key={index} className="flex justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate">
                                {row.customer}
                                {row.phone ? ` · ${row.phone}` : ""}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {row.orderNumber} · {row.quantity} × {row.product}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {trace.usedIn.length ? (
                      <div className="rounded-md border p-3">
                        <p className="mb-1.5 text-xs font-medium">Used in these runs</p>
                        {trace.usedIn.map((row, index) => (
                          <p key={index} className="text-xs text-muted-foreground">
                            {row.orderNumber} — {row.qty} of {row.component} into {row.product}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {trace.producedAs.map((run) => (
                      <div key={run.orderNumber} className="rounded-md border p-3">
                        <p className="mb-1.5 text-xs font-medium">
                          {run.orderNumber} made {run.producedQty} × {run.product} from
                        </p>
                        {run.madeFrom.map((line, index) => (
                          <div key={index} className="flex justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate">{line.component}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {line.qty}
                              {line.supplierBatch ? ` · lot ${line.supplierBatch}` : " · lot not recorded"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}

                    {!trace.usedIn.length && !trace.producedAs.length ? (
                      <p className="rounded-md border p-3 text-xs text-muted-foreground">
                        Nothing found for that code.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
