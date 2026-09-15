"use client"

import { useState } from "react"
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Phone,
  Search,
  ShieldAlert,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface TraceNode {
  lot: string
  depth: number
  productName: string | null
  quantity: number
  via: string
}

interface RecallCustomer {
  customerId: string
  customerName: string
  phone: string | null
  email: string | null
  quantity: number
  orders: string[]
  lots: string[]
  nearestDepth: number
}

interface Dossier {
  batchCode: string
  batch: {
    status: string
    quantity: number
    reserved: number
    expiryDate: string | null
    holdReason: string | null
    inventory: { product: { sku: string; name: string } } | null
  } | null
  producedBy: Array<{
    orderNumber: string
    status: string
    completedAt: string | null
    producedQty: number
    product: { sku: string; name: string }
  }>
  ingredients: { nodes: TraceNode[]; truncated: boolean }
  recall: {
    affectedLots: Array<{ lot: string; depth: number }>
    customers: RecallCustomer[]
    totalQuantity: number
    truncated: boolean
  }
  onHand: number
}

export default function TraceabilityPage() {
  const [lot, setLot] = useState("")
  const [data, setData] = useState<Dossier | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function search() {
    const code = lot.trim()
    if (!code) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/traceability?batchCode=${encodeURIComponent(code)}`)
      const body = await res.json()

      if (body.success) {
        setData(body.data)
      } else {
        setError(body.error || "Trace failed")
        setData(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Trace failed")
      setData(null)
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  const recall = data?.recall
  const hasCustomers = (recall?.customers.length ?? 0) > 0

  return (
    <AppShell title="Lot Traceability" breadcrumbs={[{ label: "Traceability" }]}>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Lot Traceability</h1>
          <p className="text-sm text-muted-foreground">
            What went into a lot, what it became, and who has to be called.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-2 pt-6 sm:flex-row">
            <Input
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") search()
              }}
              placeholder="Lot code from the carton, e.g. RDMNAP-20260915"
              className="min-w-0 flex-1 font-mono"
            />
            <Button onClick={search} disabled={loading || !lot.trim()}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Trace
            </Button>
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {searched && !loading && !error && data && !data.batch && data.producedBy.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No lot called <span className="font-mono">{data.batchCode}</span> has been received or
              produced.
            </CardContent>
          </Card>
        ) : null}

        {data && (data.batch || data.producedBy.length > 0) ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Still on hand</CardDescription>
                  <CardTitle className="text-2xl">{data.onHand}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  Can be stopped before it ships
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Already shipped</CardDescription>
                  <CardTitle className="text-2xl">{recall?.totalQuantity ?? 0}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  Across {recall?.customers.length ?? 0} customer(s)
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Lots implicated</CardDescription>
                  <CardTitle className="text-2xl">{recall?.affectedLots.length ?? 0}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  This lot and everything made from it
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Status</CardDescription>
                  <CardTitle className="text-2xl capitalize">
                    {data.batch?.status ?? "—"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  {data.batch?.holdReason ?? " "}
                </CardContent>
              </Card>
            </div>

            {recall?.truncated ? (
              <Card className="border-amber-500">
                <CardContent className="flex items-start gap-2 py-4 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    The chain runs deeper than this trace follows, so there may be further affected
                    lots. Treat this list as a starting point, not a complete one.
                  </span>
                </CardContent>
              </Card>
            ) : null}

            <Card className={hasCustomers ? "border-destructive" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert
                    className={`h-4 w-4 ${hasCustomers ? "text-destructive" : "text-muted-foreground"}`}
                  />
                  Who has to be called
                </CardTitle>
                <CardDescription>
                  Named from dispatch records, never inferred from order dates. Most directly
                  affected first.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 sm:px-6">
                {!hasCustomers ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No dispatch record links this lot, or anything made from it, to a customer.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Orders</TableHead>
                          <TableHead>Lot received</TableHead>
                          <TableHead className="text-right">Units</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recall!.customers.map((customer) => (
                          <TableRow key={customer.customerId}>
                            <TableCell className="font-medium">
                              {customer.customerName}
                              {customer.nearestDepth === 0 ? (
                                <Badge variant="destructive" className="ml-2">
                                  direct
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="ml-2">
                                  {customer.nearestDepth} step
                                  {customer.nearestDepth === 1 ? "" : "s"} on
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {customer.phone ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {customer.phone}
                                </span>
                              ) : null}
                              {customer.email ? (
                                <span className="text-muted-foreground">{customer.email}</span>
                              ) : null}
                              {!customer.phone && !customer.email ? (
                                <span className="text-muted-foreground">No contact on file</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {customer.orders.join(", ")}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {customer.lots.join(", ")}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {customer.quantity}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ArrowUpFromLine className="h-4 w-4" />
                    What went into it
                  </CardTitle>
                  <CardDescription>Ingredient lots, and their ingredients.</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.ingredients.nodes.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">
                      No lot-tracked ingredients recorded against this lot.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {data.ingredients.nodes.map((node) => (
                        <li
                          key={node.lot}
                          className="flex flex-wrap items-baseline gap-2 text-sm"
                          style={{ paddingLeft: `${Math.min(node.depth - 1, 6) * 16}px` }}
                        >
                          <span className="font-mono">{node.lot}</span>
                          <span className="text-muted-foreground">{node.productName}</span>
                          <Badge variant="outline">{node.quantity}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ArrowDownToLine className="h-4 w-4" />
                    What it became
                  </CardTitle>
                  <CardDescription>Downstream lots, by how far removed.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(recall?.affectedLots ?? []).map((affected) => (
                      <li
                        key={affected.lot}
                        className="flex flex-wrap items-baseline gap-2 text-sm"
                        style={{ paddingLeft: `${Math.min(affected.depth, 6) * 16}px` }}
                      >
                        <span className="font-mono">{affected.lot}</span>
                        {affected.depth === 0 ? (
                          <Badge variant="secondary">this lot</Badge>
                        ) : (
                          <Badge variant="outline">
                            {affected.depth} step{affected.depth === 1 ? "" : "s"} on
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {data.producedBy.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Production runs that made this lot</CardTitle>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Run</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Produced</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.producedBy.map((run) => (
                          <TableRow key={run.orderNumber}>
                            <TableCell className="font-mono text-xs">{run.orderNumber}</TableCell>
                            <TableCell>{run.product.name}</TableCell>
                            <TableCell className="capitalize">{run.status}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {run.producedQty}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  )
}
