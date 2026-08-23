"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search, History, ArrowDownRight, ArrowUpRight, Package, ArrowLeft } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"

type StockMovement = {
  id: string
  type: string
  quantity: number
  reason?: string | null
  reference?: string | null
  referenceType?: string | null
  createdAt: string
  product: {
    id: string
    sku: string
    name: string
  }
  warehouse: {
    id: string
    name: string
    code: string
  }
}

const toneByType: Record<string, string> = {
  purchase: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  adjustment: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  sale: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  out: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  in: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
}

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const response = await fetch("/api/stock-movements")
        const payload = await response.json()
        if (payload.success) {
          setMovements(payload.data || [])
        }
      } catch (error) {
        console.error("Error loading stock movements:", error)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const filteredMovements = useMemo(() => {
    const query = search.toLowerCase()
    return movements.filter((movement) => {
      return (
        movement.product.name.toLowerCase().includes(query) ||
        movement.product.sku.toLowerCase().includes(query) ||
        (movement.reference || "").toLowerCase().includes(query) ||
        (movement.reason || "").toLowerCase().includes(query)
      )
    })
  }, [movements, search])

  const totals = {
    purchases: movements.filter((movement) => movement.type === "purchase").length,
    inbound: movements.filter((movement) => movement.quantity > 0).reduce((sum, movement) => sum + movement.quantity, 0),
    outbound: movements.filter((movement) => movement.quantity < 0).reduce((sum, movement) => sum + Math.abs(movement.quantity), 0),
  }

  return (
    <AppShell title="Stock Movements" breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: "Stock Movements" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Stock Movement Audit Log"
          description="Immutable journal of inventory adjustments, purchase receipts, manufacturing consumption, and sales dispatches."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Inventory
              </Link>
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            title="Total Movement Events"
            value={movements.length}
            description="Audited ledger entries"
            icon={History}
          />
          <KpiCard
            title="Inbound Units Received"
            value={totals.inbound}
            description="Purchasing & stock-in"
            icon={ArrowDownRight}
          />
          <KpiCard
            title="Outbound Units Dispatched"
            value={totals.outbound}
            description="Fulfillment & adjustments"
            icon={ArrowUpRight}
          />
        </div>

        <Card className="border-border shadow-sm overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Movement Register</CardTitle>
                <CardDescription className="text-xs">
                  Purchase order receipts and inventory adjustments create verified ledger movements here automatically.
                </CardDescription>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search SKU, product, ref, or reason..."
                  className="pl-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold">Product</TableHead>
                  <TableHead className="font-semibold">Movement Type & Qty</TableHead>
                  <TableHead className="font-semibold">Warehouse Location</TableHead>
                  <TableHead className="font-semibold">Reference Document</TableHead>
                  <TableHead className="font-semibold">Audit Reason</TableHead>
                  <TableHead className="font-semibold">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                      Loading stock movements ledger...
                    </TableCell>
                  </TableRow>
                ) : filteredMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12">
                      <EmptyState
                        icon={History}
                        title="No stock movements found"
                        description="No movement transactions match your query or have been recorded yet."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMovements.map((movement) => (
                    <TableRow key={movement.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm text-foreground">{movement.product.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{movement.product.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={toneByType[movement.type] || "bg-muted text-muted-foreground font-medium"}>
                            {movement.type}
                          </Badge>
                          <span className={`font-mono text-sm font-semibold ${movement.quantity >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                            {movement.quantity >= 0 ? "+" : ""}
                            {movement.quantity}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm text-foreground">{movement.warehouse.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{movement.warehouse.code}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground">
                        {movement.reference || "Manual"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {movement.reason || "Standard balance adjustment"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(movement.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
