"use client"

import { useEffect, useMemo, useState } from "react"
import { FolderTree, Plus, Trash2 } from "lucide-react"

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
    void reload()
  }, [])

  async function reload() {
    setCategories(await fetchCategories())
  }

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
    await fetch(`/api/categories/${id}`, { method: "DELETE" })
    await reload()
  }

  return (
    <AppShell title="Categories" breadcrumbs={[{ label: "Categories" }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Categories & Subcategories</h1>
            <p className="text-muted-foreground">Create top-level categories and nested subcategories for the customer website and app.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="mr-2 h-4 w-4" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create category</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Parent category</Label>
                  <Select value={form.parentId} onValueChange={(value) => setForm((current) => ({ ...current, parentId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Parent category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">Top level category</SelectItem>
                      {rootCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveCategory}>Save Category</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total categories</p><p className="text-2xl font-bold">{categories.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Top level</p><p className="text-2xl font-bold">{rootCategories.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Subcategories</p><p className="text-2xl font-bold">{categories.length - rootCategories.length}</p></CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {grouped.map((category) => (
            <Card key={category.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FolderTree className="h-4 w-4" />
                      {category.name}
                    </CardTitle>
                    <CardDescription>{category.description || "No description set"}</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void deleteCategory(category.id)}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {category.children.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No subcategories yet.
                  </div>
                ) : (
                  category.children.map((child) => (
                    <div key={child.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                      <div>
                        <p className="font-medium">{child.name}</p>
                        <p className="text-xs text-muted-foreground">{child.description || "Subcategory"}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => void deleteCategory(child.id)}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
