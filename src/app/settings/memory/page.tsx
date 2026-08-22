"use client"

import { useCallback, useEffect, useState } from "react"
import { Brain, Building2, Loader2, Plus, RefreshCw, Trash2, User } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Memory {
  id: string
  scope: string
  content: string
  category: string
  importance: number
  key: string | null
  source: string
  useCount: number
  lastUsedAt: string | null
  entityType: string | null
  entityName: string | null
  updatedAt: string
}

const SCOPE_META: Record<string, { label: string; icon: typeof Brain; blurb: string }> = {
  company: {
    label: "The business",
    icon: Building2,
    blurb: "How this company works. Every member of staff shares these.",
  },
  user: {
    label: "You",
    icon: User,
    blurb: "Your own preferences. Nobody else can see or change these.",
  },
  entity: {
    label: "Accounts",
    icon: Brain,
    blurb: "Facts about particular customers and suppliers.",
  },
}

export default function MemoryPage() {
  const [scope, setScope] = useState("company")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [memories, setMemories] = useState<Memory[]>([])
  const [draft, setDraft] = useState("")

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const result = await fetch("/api/agent/memory").then((response) => response.json())
      if (result.success) setMemories(result.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const inScope = memories.filter((memory) => memory.scope === scope)
  const meta = SCOPE_META[scope]
  const Icon = meta.icon

  return (
    <AppShell title="Memory">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
            <p className="text-sm text-muted-foreground">
              What the agent has learned and carries between conversations.
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

        <Tabs value={scope} onValueChange={setScope}>
          <TabsList>
            <TabsTrigger value="company">The business</TabsTrigger>
            <TabsTrigger value="user">You</TabsTrigger>
            <TabsTrigger value="entity">Accounts</TabsTrigger>
          </TabsList>

          <TabsContent value={scope} className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4" />
                  {meta.label}
                  <Badge variant="outline" className="text-[10px]">
                    {inScope.length}
                  </Badge>
                </CardTitle>
                <CardDescription>{meta.blurb}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-2">
                {scope !== "entity" ? (
                  <div className="flex gap-2 border-b pb-3">
                    <Input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={
                        scope === "company"
                          ? "e.g. We don't deliver to Tasmania — customers there arrange their own freight"
                          : "e.g. I prefer short answers with the number first"
                      }
                      className="h-8 text-xs"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur()
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={!draft.trim() || saving === "new"}
                      onClick={async () => {
                        setSaving("new")

                        try {
                          const result = await fetch("/api/agent/memory", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ scope, content: draft, importance: 70 }),
                          }).then((response) => response.json())

                          if (!result.success) {
                            window.alert(result.error)
                            return
                          }

                          setDraft("")
                          await load()
                        } finally {
                          setSaving(null)
                        }
                      }}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Teach it
                    </Button>
                  </div>
                ) : null}

                {!inScope.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {loading
                      ? "Loading…"
                      : scope === "entity"
                        ? "Nothing learned about specific accounts yet. The agent adds these as it works."
                        : "Nothing yet. Teach it something above, or it will pick things up as you work."}
                  </p>
                ) : (
                  inScope.map((memory) => (
                    <div
                      key={memory.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm">{memory.content}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {memory.category}
                          </Badge>
                          {memory.entityName ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {memory.entityName}
                            </Badge>
                          ) : null}
                          {memory.source === "user" ? (
                            <Badge variant="outline" className="text-[10px]">
                              taught
                            </Badge>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground">
                            importance {memory.importance}
                            {memory.useCount ? ` · used ${memory.useCount}×` : " · never used"}
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2"
                        disabled={saving === memory.id}
                        onClick={async () => {
                          if (!window.confirm(`Forget this?\n\n"${memory.content}"`)) return
                          setSaving(memory.id)

                          try {
                            await fetch(`/api/agent/memory?id=${memory.id}`, { method: "DELETE" })
                            await load()
                          } finally {
                            setSaving(null)
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
