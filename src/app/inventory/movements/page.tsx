"use client"

import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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
  purchase: "bg-emerald-100 text-emerald-700",
  adjustment: "bg-amber-100 text-amber-700",
  sale: "bg-rose-100 text-rose-700",
  out: "bg-rose-100 text-rose-700",
  in: "bg-blue-100 text-blue-700",
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
    <AppShell title="Stock Movements" breadcrumbs={[{ label: "Inventory" }, { label: "Stock Movements" }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Movements</h1>
          <p className="text-muted-foreground">Track inventory receipts, adjustments, sales, and purchase-order receipts across warehouses.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total movement logs</CardDescription>
              <CardTitle className="text-2xl">{movements.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Inbound units</CardDescription>
              <CardTitle className="text-2xl">{totals.inbound}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outbound units</CardDescription>
              <CardTitle className="text-2xl">{totals.outbound}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Movement register</CardTitle>
            <CardDescription>Purchase order receipts now create stock movements here automatically.</CardDescription>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search SKU, product, reference, or reason..."
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Loading stock movements...
                    </TableCell>
                  </TableRow>
                ) : filteredMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No stock movements found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{movement.product.name}</p>
                          <p className="text-xs text-muted-foreground">{movement.product.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={toneByType[movement.type] || "bg-slate-100 text-slate-700"}>
                            {movement.type}
                          </Badge>
                          <span className={`font-medium ${movement.quantity >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {movement.quantity >= 0 ? "+" : ""}
                            {movement.quantity}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{movement.warehouse.name}</p>
                          <p className="text-xs text-muted-foreground">{movement.warehouse.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>{movement.reference || "Manual"}</TableCell>
                      <TableCell>{movement.reason || "No reason supplied"}</TableCell>
                      <TableCell>{new Date(movement.createdAt).toLocaleString()}</TableCell>
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
