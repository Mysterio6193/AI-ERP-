"use client"

import { useEffect, useMemo, useState } from "react"
import { Heart, Search, Trash2 } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LoadError } from "@/components/ui/load-error"
import { describeLoadError } from "@/lib/client/fetch-list"

interface WishlistRow {
  id: string
  name: string
  visibility: string
  updatedAt: string
  itemCount: number
  customer: {
    id: string
    name: string
    email?: string | null
    status: string
    creditLimit: number
  }
  items: Array<{
    id: string
    quantity: number
    productName: string
    productSku: string
    variantName?: string | null
  }>
}

async function fetchWishlists(search = "") {
  const query = search ? `?search=${encodeURIComponent(search)}` : ""
  const response = await fetch(`/api/wishlists${query}`)
  const payload = await response.json()
  // Throwing rather than returning [] — a failed request must not be
  // indistinguishable from a genuinely empty list.
  if (!payload?.success) {
    throw new Error(payload?.error || `Could not load this data (HTTP ${response.status}).`)
  }

  return payload.data || []
}

export default function WishlistsPage() {
  const [search, setSearch] = useState("")
  const [wishlists, setWishlists] = useState<WishlistRow[]>([])
  // A failed load must not look like nobody has a wishlist.
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void fetchWishlists()
      .then(setWishlists)
      .catch((error) => setLoadError(describeLoadError(error)))
  }, [])

  const summary = useMemo(() => ({
    total: wishlists.length,
    items: wishlists.reduce((sum, wishlist) => sum + wishlist.itemCount, 0),
    customers: new Set(wishlists.map((wishlist) => wishlist.customer.id)).size,
  }), [wishlists])

  async function handleSearch(value: string) {
    setSearch(value)
    setWishlists(await fetchWishlists(value).catch((error) => { setLoadError(describeLoadError(error)); return [] }))
  }

  async function deleteWishlist(id: string) {
    const response = await fetch(`/api/wishlists/${id}`, {
      method: "DELETE",
    })
    const payload = await response.json()
    if (payload.success) {
      setWishlists((current) => current.filter((wishlist) => wishlist.id !== id))
    }
  }

  return (
    <AppShell title="Customer Wishlists" breadcrumbs={[{ label: "Wishlists" }]}>
      <div className="space-y-6">
        {loadError ? <LoadError message={loadError} /> : null}

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customer Wishlists</h1>
          <p className="text-muted-foreground">See what B2B and B2C customers are saving for later, and use it for merchandising or sales follow-up.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Wishlists</p><p className="text-2xl font-bold">{summary.total}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Saved items</p><p className="text-2xl font-bold">{summary.items}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Customers using wishlists</p><p className="text-2xl font-bold">{summary.customers}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search wishlists</CardTitle>
            <CardDescription>Find by wishlist name, customer business, or email.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => void handleSearch(event.target.value)} placeholder="Search wishlists..." />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {wishlists.map((wishlist) => (
            <Card key={wishlist.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Heart className="h-4 w-4 text-rose-500" />
                      {wishlist.name}
                    </CardTitle>
                    <CardDescription>
                      {wishlist.customer.name} · {wishlist.customer.email || "No email"} · updated {new Date(wishlist.updatedAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{wishlist.visibility}</Badge>
                    <Badge variant="outline">{wishlist.itemCount} items</Badge>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                      onClick={() => void deleteWishlist(wishlist.id)}
                      aria-label={`Delete ${wishlist.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {wishlist.items.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">{item.productSku}{item.variantName ? ` · ${item.variantName}` : ""}</p>
                    <p className="mt-2 text-sm">Saved qty: {item.quantity}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
