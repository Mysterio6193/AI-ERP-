"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, GraduationCap, History, Loader2, Plus, RefreshCw, User } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

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

  const active = skills.find((skill) => skill.id === open) || null

  return (
    <AppShell title="Skills">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
            <p className="text-sm text-muted-foreground">
              Procedures the agent worked out and reuses. It writes these itself; you can correct
              them.
            </p>
          </div>
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
              Write one
            </Button>
          </div>
        </div>

        {creating ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">New procedure</CardTitle>
              <CardDescription>
                The description is what the agent reads when deciding whether to use this, so
                describe the trigger, not the steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Name — e.g. Month-end stock reconciliation"
                className="h-8 text-xs"
              />
              <Input
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="When to use it — e.g. On the last working day of each month"
                className="h-8 text-xs"
              />
              <Textarea
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                rows={7}
                placeholder={"The steps. Be specific to this business:\n1. …\n2. …"}
                className="text-xs"
              />
              <div className="flex gap-2">
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
                        window.alert(result.error)
                        return
                      }

                      setCreating(false)
                      setDraft({ name: "", description: "", content: "" })
                      await load()
                    } finally {
                      setSaving(null)
                    }
                  }}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!skills.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <GraduationCap className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Nothing learned yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {loading
                  ? "Loading…"
                  : "The agent writes a procedure after working through something non-obvious, then reuses and corrects it. Or write the first one yourself."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <Card key={skill.id} className={skill.status === "archived" ? "opacity-60" : ""}>
                <CardContent className="space-y-2 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{skill.name}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          v{skill.version}
                        </Badge>
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          {skill.createdByAgent ? (
                            <>
                              <Bot className="h-2.5 w-2.5" />
                              learned
                            </>
                          ) : (
                            <>
                              <User className="h-2.5 w-2.5" />
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
                      <p className="mt-0.5 text-xs text-muted-foreground">{skill.description}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        used {skill.useCount}×
                        {skill.successRate !== null
                          ? ` · ${skill.successRate}% worked`
                          : " · no outcomes recorded"}
                        {skill._count.revisions > 1 ? ` · ${skill._count.revisions} revisions` : ""}
                        {skill.tools.length ? ` · needs ${skill.tools.length} tools` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
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
                        {open === skill.id ? "Hide" : "Steps"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
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
                    <div className="space-y-2">
                      <Textarea
                        defaultValue={skill.content}
                        rows={8}
                        className="font-mono text-[11px]"
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
                                changeNote: "Corrected by hand",
                              }),
                            })
                            await load()
                          } finally {
                            setSaving(null)
                          }
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Saved as a new version when you click away. Earlier versions are kept.
                      </p>

                      {revisions.length > 1 ? (
                        <div className="rounded-md border p-2">
                          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium">
                            <History className="h-3 w-3" />
                            How it changed
                          </p>
                          {revisions.map((revision) => (
                            <p key={revision.id} className="text-[11px] text-muted-foreground">
                              v{revision.version} — {revision.changeNote || "no note"} ·{" "}
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
