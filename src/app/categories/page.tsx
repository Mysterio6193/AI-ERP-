"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { FolderTree, Plus, Trash2, Layers, Boxes } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"

interface CategoryRow {
  id: string
  name: string
  description?: string | null
  parentId?: string | null
  _count?: { products: number }
}

async function fetchCategories() {
  const response = await fetch("/api/categories")
  const payload = await response.json()
  return payload.success ? payload.data || [] : []
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", parentId: "root" })

  useEffect(() => {
    let ignore = false
    fetchCategories().then((data) => {
      if (!ignore) {
        setCategories(data)
      }
    })
    return () => {
      ignore = true
    }
  }, [])

  const reload = useCallback(async () => {
    const data = await fetchCategories()
    setCategories(data)
  }, [])

  const rootCategories = useMemo(() => categories.filter((category) => !category.parentId), [categories])
  const grouped = useMemo(
    () =>
      rootCategories.map((category) => ({
        ...category,
        children: categories.filter((candidate) => candidate.parentId === category.id),
      })),
    [categories, rootCategories]
  )

  async function saveCategory() {
    if (!form.name.trim()) return
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        parentId: form.parentId === "root" ? null : form.parentId,
      }),
    })
    setDialogOpen(false)
    setForm({ name: "", description: "", parentId: "root" })
    await reload()
  }

  async function deleteCategory(id: string) {
    if (!confirm("Are you sure you want to delete this category?")) return
    await fetch(`/api/categories/${id}`, { method: "DELETE" })
    await reload()
  }

  return (
    <AppShell title="Categories" breadcrumbs={[{ label: "Categories" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Categories & Taxonomy"
          description="Create top-level categories and nested subcategories for the product catalog, website, and ordering apps."
          actions={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Category
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Category</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Category Name *</Label>
                    <Input
                      placeholder="e.g. Beverages, Bakery, Packaging"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      placeholder="Short description for storefront & catalog"
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Parent Category</Label>
                    <Select value={form.parentId} onValueChange={(value) => setForm((current) => ({ ...current, parentId: value }))}>
                      <SelectTrigger><SelectValue placeholder="Parent category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="root">Top Level Category (Root)</SelectItem>
                        {rootCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveCategory}>Save Category</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            title="Total Categories"
            value={categories.length}
            description="Catalog taxonomy nodes"
            icon={FolderTree}
          />
          <KpiCard
            title="Top Level Categories"
            value={rootCategories.length}
            description="Primary catalog groups"
            icon={Layers}
          />
          <KpiCard
            title="Subcategories"
            value={categories.length - rootCategories.length}
            description="Nested category tiers"
            icon={Boxes}
          />
        </div>

        {grouped.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="No categories configured"
            description="Organize your product catalog by creating top-level categories and subcategories."
            action={
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Category
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {grouped.map((category) => (
              <Card key={category.id} className="border-border shadow-sm transition-all hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                        <FolderTree className="h-4 w-4 text-primary shrink-0" />
                        <span className="truncate">{category.name}</span>
                        <Badge variant="outline" className="text-[10px] ml-1">
                          {category.children.length} sub
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">{category.description || "No description set"}</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={() => void deleteCategory(category.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {category.children.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground text-center">
                      No subcategories configured under this category.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {category.children.map((child) => (
                        <div key={child.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5 hover:bg-muted/50 transition-colors">
                          <div className="min-w-0">
                            <p className="font-medium text-xs text-foreground truncate">{child.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{child.description || "Subcategory"}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/80" onClick={() => void deleteCategory(child.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
