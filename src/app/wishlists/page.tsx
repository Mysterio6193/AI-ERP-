"use client"

import { useEffect, useMemo, useState } from "react"
import { Heart, Search, Trash2, Package, Users, Bookmark } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

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
  return payload.success ? payload.data || [] : []
}

export default function WishlistsPage() {
  const [search, setSearch] = useState("")
  const [wishlists, setWishlists] = useState<WishlistRow[]>([])

  useEffect(() => {
    void fetchWishlists().then(setWishlists)
  }, [])

  const summary = useMemo(() => ({
    total: wishlists.length,
    items: wishlists.reduce((sum, wishlist) => sum + wishlist.itemCount, 0),
    customers: new Set(wishlists.map((wishlist) => wishlist.customer.id)).size,
  }), [wishlists])

  async function handleSearch(value: string) {
    setSearch(value)
    setWishlists(await fetchWishlists(value))
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
    <AppShell title="Customer Wishlists" breadcrumbs={[{ label: "Commerce", href: "/commerce" }, { label: "Wishlists" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Customer Wishlists"
          description="See what B2B and B2C customers are saving for later, and use it for merchandising or sales follow-up."
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            title="Total Wishlists"
            value={summary.total}
            icon={Bookmark}
          />
          <KpiCard
            title="Saved Items"
            value={summary.items}
            icon={Package}
          />
          <KpiCard
            title="Active Customers"
            value={summary.customers}
            icon={Users}
          />
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader className="p-4 sm:p-6 pb-2">
            <CardTitle className="text-base">Search Wishlists</CardTitle>
            <CardDescription>Find by wishlist name, customer business, or email.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="relative max-w-xl">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => void handleSearch(event.target.value)}
                placeholder="Search wishlists..."
              />
            </div>
          </CardContent>
        </Card>

        {wishlists.length === 0 ? (
          <Card className="border-border shadow-sm">
            <EmptyState
              icon={Heart}
              title="No wishlists found"
              description={search ? "No customer wishlists match your search term." : "No customer wishlists saved yet."}
            />
          </Card>
        ) : (
          <div className="grid gap-4">
            {wishlists.map((wishlist) => (
              <Card key={wishlist.id} className="border-border shadow-sm">
                <CardHeader className="p-4 sm:p-6 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Heart className="h-4 w-4 text-rose-500 fill-rose-500/20" />
                        {wishlist.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {wishlist.customer.name} · {wishlist.customer.email || "No email"} · Updated {new Date(wishlist.updatedAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{wishlist.visibility}</Badge>
                      <Badge variant="secondary">{wishlist.itemCount} items</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => void deleteWishlist(wishlist.id)}
                        aria-label={`Delete ${wishlist.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {wishlist.items.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border bg-muted/20 p-3.5">
                      <p className="font-medium text-sm text-foreground">{item.productName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.productSku}{item.variantName ? ` · ${item.variantName}` : ""}</p>
                      <p className="mt-2 text-xs font-medium text-foreground">Saved Qty: <span className="text-muted-foreground font-normal">{item.quantity}</span></p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
