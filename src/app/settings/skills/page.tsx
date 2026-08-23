"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, BookOpen, GraduationCap, History, Loader2, Plus, RefreshCw, RotateCcw, Sparkles, User, Wrench } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface Skill {
  id: string
  slug: string
  name: string
  description: string
  content: string
  category: string
  status: string
  version: number
  useCount: number
  successCount: number
  failureCount: number
  successRate: number | null
  createdByAgent: boolean
  tools: string[]
  lastUsedAt: string | null
  _count: { revisions: number }
}

interface Revision {
  id: string
  version: number
  content: string
  changeNote: string | null
  createdAt: string
}

export default function SkillsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [skills, setSkills] = useState<Skill[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [creating, setCreating] = useState(false)

  const [draft, setDraft] = useState({ name: "", description: "", content: "" })

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const result = await fetch("/api/agent/skills").then((response) => response.json())
      if (result.success) setSkills(result.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell title="Agent Skills" breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Standard Procedures" }]}>
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Standard Operating Procedures (SOPs)"
          description="Operational workflows learned by agents or taught by supervisors. Procedures are automatically matched against user intents."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                New Procedure
              </Button>
            </div>
          }
        />

        {creating ? (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Define Operating Procedure
              </CardTitle>
              <CardDescription className="text-xs">
                The description is matched by the agent router to determine when to trigger this SOP.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Procedure Name</label>
                  <Input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    placeholder="e.g. Month-End Stock Reconciliation"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Trigger Condition / When to Run</label>
                  <Input
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    placeholder="e.g. Triggered on the final business day of every month"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Step-by-Step Instructions</label>
                <Textarea
                  value={draft.content}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  rows={6}
                  placeholder={`1. Call list_sales_orders for current period.\n2. Filter by open status.\n3. Summarise missing inventory balances.`}
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  disabled={
                    !draft.name.trim() ||
                    !draft.description.trim() ||
                    !draft.content.trim() ||
                    saving === "new"
                  }
                  onClick={async () => {
                    setSaving("new")

                    try {
                      const result = await fetch("/api/agent/skills", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(draft),
                      }).then((response) => response.json())

                      if (!result.success) {
                        toast({
                          variant: "destructive",
                          title: "Failed to save skill",
                          description: result.error || "Could not save skill",
                        })
                        return
                      }

                      setCreating(false)
                      setDraft({ name: "", description: "", content: "" })
                      await load()
                      toast({
                        title: "Procedure saved",
                        description: "Skill registered for autonomous execution.",
                      })
                    } finally {
                      setSaving(null)
                    }
                  }}
                >
                  {saving === "new" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                  Save Procedure
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!skills.length ? (
          <Card className="border border-border">
            <CardContent className="py-12 text-center">
              <GraduationCap className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">No standard procedures recorded</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {loading
                  ? "Loading procedures…"
                  : "The agent writes procedures after solving complex operational flows, or you can write them directly."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {skills.map((skill) => (
              <Card key={skill.id} className={`border border-border transition-colors ${skill.status === "archived" ? "opacity-60" : "hover:border-border/80"}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{skill.name}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          v{skill.version}
                        </Badge>
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          {skill.createdByAgent ? (
                            <>
                              <Bot className="h-3 w-3 text-primary" />
                              learned
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3 text-emerald-500" />
                              taught
                            </>
                          )}
                        </Badge>
                        {skill.status === "archived" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            archived
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Executed {skill.useCount}×
                        {skill.successRate !== null
                          ? ` · ${skill.successRate}% success rate`
                          : " · no outcomes recorded"}
                        {skill._count.revisions > 1 ? ` · ${skill._count.revisions} revisions` : ""}
                        {skill.tools.length ? ` · requires ${skill.tools.length} tools` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-xs"
                        onClick={async () => {
                          if (open === skill.id) {
                            setOpen(null)
                            return
                          }

                          setOpen(skill.id)
                          const result = await fetch(`/api/agent/skills?slug=${skill.slug}`).then(
                            (response) => response.json()
                          )
                          if (result.success) setRevisions(result.data.revisions)
                        }}
                      >
                        {open === skill.id ? "Hide Steps" : "View Steps"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive"
                        disabled={saving === skill.id}
                        onClick={() =>
                          void (async () => {
                            setSaving(skill.id)

                            try {
                              await fetch("/api/agent/skills", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: skill.status === "archived" ? "restore" : "archive",
                                  id: skill.id,
                                }),
                              })
                              await load()
                              toast({
                                title: skill.status === "archived" ? "Procedure restored" : "Procedure archived",
                                description: `"${skill.name}" updated successfully.`,
                              })
                            } finally {
                              setSaving(null)
                            }
                          })()
                        }
                      >
                        {skill.status === "archived" ? "Restore" : "Archive"}
                      </Button>
                    </div>
                  </div>

                  {open === skill.id ? (
                    <div className="space-y-3 pt-2 border-t border-border/60">
                      <Textarea
                        defaultValue={skill.content}
                        rows={8}
                        className="font-mono text-xs bg-muted/30"
                        onBlur={async (event) => {
                          if (event.target.value === skill.content) return

                          setSaving(skill.id)

                          try {
                            await fetch("/api/agent/skills", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "improve",
                                slug: skill.slug,
                                content: event.target.value,
                                changeNote: "Manual supervisor edit",
                              }),
                            })
                            await load()
                            toast({
                              title: "Procedure updated",
                              description: "New version saved to revision history.",
                            })
                          } finally {
                            setSaving(null)
                          }
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Saved automatically as a new version when you click away.
                      </p>

                      {revisions.length > 1 ? (
                        <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <History className="h-3.5 w-3.5 text-primary" />
                            Revision Changelog
                          </p>
                          {revisions.map((revision) => (
                            <p key={revision.id} className="text-[11px] text-muted-foreground font-mono">
                              v{revision.version} — {revision.changeNote || "routine update"} ·{" "}
                              {new Date(revision.createdAt).toLocaleDateString()}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

