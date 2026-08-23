"use client"

import { useCallback, useEffect, useState } from "react"
import { Brain, Building2, Loader2, Plus, RefreshCw, Trash2, User, Globe } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

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
    label: "Company Knowledge",
    icon: Building2,
    blurb: "Business operational heuristics, regional routing rules, and company-wide policies shared by all staff.",
  },
  user: {
    label: "Personal Directives",
    icon: User,
    blurb: "Your individual preferences, communication cadence, and custom report formats.",
  },
  entity: {
    label: "Customer & Vendor Facts",
    icon: Globe,
    blurb: "Account-specific nuances, warehouse delivery windows, and special logistics constraints.",
  },
}

export default function MemoryPage() {
  const { toast } = useToast()
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
    <AppShell title="Agent Memory" breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Memory" }]}>
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Agent Long-Term Memory"
          description="Manage operational facts, customer nuances, and learned business rules retained across all chat sessions."
          actions={
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          }
        />

        <Tabs value={scope} onValueChange={setScope}>
          <TabsList className="grid w-full grid-cols-3 bg-muted p-1">
            <TabsTrigger value="company" className="text-xs flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Company ({memories.filter((m) => m.scope === "company").length})
            </TabsTrigger>
            <TabsTrigger value="user" className="text-xs flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Personal ({memories.filter((m) => m.scope === "user").length})
            </TabsTrigger>
            <TabsTrigger value="entity" className="text-xs flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Accounts ({memories.filter((m) => m.scope === "entity").length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={scope} className="mt-4">
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-primary" />
                  {meta.label}
                  <Badge variant="outline" className="text-[10px]">
                    {inScope.length} records
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  {meta.blurb}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {scope !== "entity" ? (
                  <div className="flex gap-2 border-b border-border pb-3">
                    <Input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={
                        scope === "company"
                          ? "e.g. We don't deliver to Tasmania on Mondays — customers arrange 3PL freight."
                          : "e.g. I prefer daily revenue summaries formatted with dollar amounts first."
                      }
                      className="h-8 text-xs"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur()
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={!draft.trim() || saving === "new"}
                      className="shrink-0 h-8 text-xs"
                      onClick={async () => {
                        setSaving("new")

                        try {
                          const result = await fetch("/api/agent/memory", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ scope, content: draft, importance: 70 }),
                          }).then((response) => response.json())

                          if (!result.success) {
                            toast({
                              variant: "destructive",
                              title: "Failed to save memory",
                              description: result.error || "Could not save memory",
                            })
                            return
                          }

                          setDraft("")
                          await load()
                          toast({
                            title: "Memory recorded",
                            description: "Operational knowledge updated successfully.",
                          })
                        } finally {
                          setSaving(null)
                        }
                      }}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Teach
                    </Button>
                  </div>
                ) : null}

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !inScope.length ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    {scope === "entity"
                      ? "No account-specific facts recorded yet. The agent logs nuances as you process customer orders."
                      : "No memories in this scope yet. Teach a fact above or continue chatting with the assistant."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {inScope.map((memory) => (
                      <div
                        key={memory.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-xs font-medium text-foreground leading-relaxed">{memory.content}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Badge variant="outline" className="text-[10px]">
                              {memory.category}
                            </Badge>
                            {memory.entityName ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {memory.entityName}
                              </Badge>
                            ) : null}
                            {memory.source === "user" ? (
                              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                operator taught
                              </Badge>
                            ) : null}
                            <span>
                              importance {memory.importance}
                              {memory.useCount ? ` · referenced ${memory.useCount}×` : " · never referenced"}
                            </span>
                          </div>
                        </div>

                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={saving === memory.id}
                          onClick={async () => {
                            if (!window.confirm(`Forget this fact?\n\n"${memory.content}"`)) return
                            setSaving(memory.id)

                            try {
                              await fetch(`/api/agent/memory?id=${memory.id}`, { method: "DELETE" })
                              await load()
                              toast({
                                title: "Memory deleted",
                                description: "Fact permanently removed from agent context.",
                              })
                            } finally {
                              setSaving(null)
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}

