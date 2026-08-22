"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, Clock, Loader2, Lock, Play, Plus, Radio, RefreshCw, Shield, Wrench } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface AgentDefinition {
  id: string
  slug: string
  name: string
  description: string | null
  avatar: string | null
  instructions: string
  tools: string[] | null
  audience: string
  maxSteps: number
  trigger: string
  schedule: string | null
  runPrompt: string | null
  enabled: boolean
  isSystem: boolean
  runCount: number
  lastRunAt: string | null
  nextRunAt: string | null
  lastRunStatus: string | null
  lastRunError: string | null
}

interface WatchState {
  config: { enabled: boolean; maxPerTick: number }
  recipients: Array<{ id: string; name: string; role: string }>
  signals: Array<{ kind: string; severity: string; title: string; body: string }>
  recent: Array<{
    id: string
    kind: string
    severity: string
    title: string
    status: string
    sentAt: string
  }>
}

/** Schedules people actually want, so nobody has to write cron from memory. */
const SCHEDULE_PRESETS = [
  { label: "Off", value: "" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily 7am", value: "0 7 * * *" },
  { label: "Weekdays 8am", value: "0 8 * * 1-5" },
  { label: "Weekdays 5pm", value: "0 17 * * 1-5" },
  { label: "Mondays 9am", value: "0 9 * * 1" },
]

interface CatalogueTool {
  name: string
  risk: "read" | "low" | "medium" | "high"
  roles: string[] | null
  alwaysApprove: boolean
}

const RISK_TONE: Record<string, string> = {
  read: "text-muted-foreground",
  low: "text-emerald-600",
  medium: "text-amber-600",
  high: "text-red-600",
}

const RISK_ORDER = ["read", "low", "medium", "high"]

export default function AgentStudioPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [catalogue, setCatalogue] = useState<CatalogueTool[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [watch, setWatch] = useState<WatchState | null>(null)

  const [draft, setDraft] = useState({
    name: "",
    description: "",
    avatar: "🤖",
    instructions: "",
    tools: [] as string[],
  })

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const [result, watchResult] = await Promise.all([
        fetch("/api/agent/definitions").then((response) => response.json()),
        fetch("/api/agent/heartbeat").then((response) => response.json()),
      ])

      if (result.success) {
        setAgents(result.data.definitions)
        setCatalogue(result.data.catalogue)
      }

      if (watchResult.success) {
        setWatch(watchResult.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const active = agents.find((agent) => agent.id === selected) || null

  // Grouped by risk so the consequence of granting a tool is visible while
  // choosing it, rather than buried in a flat alphabetical list.
  const byRisk = useMemo(() => {
    const groups: Record<string, CatalogueTool[]> = {}
    for (const tool of catalogue) {
      groups[tool.risk] = groups[tool.risk] || []
      groups[tool.risk].push(tool)
    }
    return groups
  }, [catalogue])

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setSaving(id)

      try {
        const response = await fetch("/api/agent/definitions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...body }),
        })

        const result = await response.json()
        if (!result.success) {
          toast({
            variant: "destructive",
            title: "Failed to update agent",
            description: result.error || "Request failed",
          })
          return
        }

        await load()
        toast({
          title: "Agent updated",
          description: "Agent configuration saved successfully.",
        })
      } finally {
        setSaving(null)
      }
    },
    [load]
  )

  function toggleTool(agent: AgentDefinition, toolName: string) {
    // null means "everything"; materialise it before removing one.
    const current = agent.tools ?? catalogue.map((tool) => tool.name)
    const next = current.includes(toolName)
      ? current.filter((name) => name !== toolName)
      : [...current, toolName]

    void patch(agent.id, { tools: next })
  }

  return (
    <AppShell title="Agents">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
            <p className="text-sm text-muted-foreground">
              Build an agent by choosing what it is told and which tools it can reach.
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
              New agent
            </Button>
          </div>
        </div>

        {/* ---- The watch loop ---- */}
        {watch ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Radio className="h-4 w-4" />
                    Watching
                    <Badge
                      variant={watch.config.enabled ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {watch.config.enabled ? "on" : "off"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Checks the business on every tick and messages you only when something crosses a
                    line. Silence is the normal outcome.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving === "watch"}
                    onClick={async () => {
                      setSaving("watch")

                      try {
                        const result = await fetch("/api/agent/heartbeat", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "run", dryRun: true }),
                        }).then((response) => response.json())

                        const data = result.data
                        if (result.success) {
                          toast({
                            title: `Heartbeat check: ${data.signalsFound} signal(s)`,
                            description: `Would send ${data.sent.length} notification(s) to ${data.recipients} recipient(s).`,
                          })
                        } else {
                          toast({
                            variant: "destructive",
                            title: "Heartbeat dry run failed",
                            description: result.error || "Execution failed",
                          })
                        }
                      } finally {
                        setSaving(null)
                      }
                    }}
                  >
                    Dry run
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving === "watch-toggle"}
                    onClick={async () => {
                      setSaving("watch-toggle")

                      try {
                        await fetch("/api/agent/heartbeat", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ enabled: !watch.config.enabled }),
                        })
                        await load()
                      } finally {
                        setSaving(null)
                      }
                    }}
                  >
                    {watch.config.enabled ? "Turn off" : "Turn on"}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {!watch.recipients.length ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                  Nobody has linked a Telegram account, so there is nowhere to send alerts. Link one
                  from the agent settings to start receiving them.
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Alerting {watch.recipients.map((person) => person.name).join(", ")} · at most{" "}
                  {watch.config.maxPerTick} per tick
                </p>
              )}

              <div>
                <p className="mb-1.5 text-xs font-medium">
                  Visible right now ({watch.signals.length})
                </p>
                {!watch.signals.length ? (
                  <p className="rounded-md border p-3 text-xs text-muted-foreground">
                    Nothing needs attention. This is the intended state.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {watch.signals.map((signal, index) => (
                      <div key={index} className="rounded-md border p-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={signal.severity === "urgent" ? "destructive" : "outline"}
                            className="text-[10px]"
                          >
                            {signal.severity}
                          </Badge>
                          <span className="font-medium">{signal.title}</span>
                        </div>
                        <p className="mt-0.5 text-muted-foreground">{signal.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {watch.recent.length ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium">Recently sent</p>
                  <div className="space-y-1">
                    {watch.recent.slice(0, 6).map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                      >
                        <span className="truncate">{row.title}</span>
                        <span className="shrink-0">
                          {new Date(row.sentAt).toLocaleString()}
                          {row.status !== "sent" ? ` · ${row.status}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {creating ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New agent</CardTitle>
              <CardDescription>
                A narrow agent is usually a better agent. Give it one job and only the tools that
                job needs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-[80px_1fr_1fr]">
                <Input
                  value={draft.avatar}
                  onChange={(event) => setDraft((current) => ({ ...current, avatar: event.target.value }))}
                  placeholder="🤖"
                  className="h-8 text-center text-xs"
                />
                <Input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Agent name"
                  className="h-8 text-xs"
                />
                <Input
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="What it does"
                  className="h-8 text-xs"
                />
              </div>

              <Textarea
                value={draft.instructions}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, instructions: event.target.value }))
                }
                placeholder="You qualify inbound leads for a pizza-base manufacturer. Ask about venue type, weekly volume and current supplier. Log everything. Never discuss pricing."
                rows={5}
                className="text-xs"
              />

              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium">
                  Tools ({draft.tools.length} of {catalogue.length})
                </p>
                {RISK_ORDER.map((risk) => (
                  <div key={risk}>
                    <p className={`mb-1 text-[10px] uppercase tracking-wide ${RISK_TONE[risk]}`}>
                      {risk}
                      {risk === "high" ? " — always needs approval" : ""}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(byRisk[risk] || []).map((tool) => (
                        <button
                          key={tool.name}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              tools: current.tools.includes(tool.name)
                                ? current.tools.filter((name) => name !== tool.name)
                                : [...current.tools, tool.name],
                            }))
                          }
                          className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                            draft.tools.includes(tool.name)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:bg-accent"
                          }`}
                        >
                          {tool.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!draft.name.trim() || !draft.instructions.trim() || saving === "new"}
                  onClick={async () => {
                    setSaving("new")

                    try {
                      const response = await fetch("/api/agent/definitions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(draft),
                      })

                      const result = await response.json()
                      if (!result.success) {
                        toast({
                          variant: "destructive",
                          title: "Failed to create agent",
                          description: result.error || "Creation failed",
                        })
                        return
                      }

                      setCreating(false)
                      setDraft({ name: "", description: "", avatar: "🤖", instructions: "", tools: [] })
                      await load()
                      toast({
                        title: "Agent created",
                        description: "New agent created successfully.",
                      })
                    } finally {
                      setSaving(null)
                    }
                  }}
                >
                  Create agent
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className={`cursor-pointer transition-colors ${selected === agent.id ? "border-primary" : ""}`}
              onClick={() => setSelected(selected === agent.id ? null : agent.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="text-lg">{agent.avatar || "🤖"}</span>
                  {agent.name}
                  {agent.isSystem ? (
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  ) : null}
                  {!agent.enabled ? (
                    <Badge variant="secondary" className="text-[10px]">
                      off
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription className="text-xs">
                  {agent.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Wrench className="h-2.5 w-2.5" />
                    {agent.tools === null ? "all tools" : `${agent.tools.length} tools`}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {agent.audience}
                  </Badge>
                  <span>{agent.runCount} runs</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {active ? (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="text-lg">{active.avatar || "🤖"}</span>
                    {active.name}
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {active.slug}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {active.isSystem
                      ? "Built in. Editable, but cannot be deleted — it backs a default surface."
                      : "Custom agent."}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving === active.id || !active.runPrompt}
                    title={active.runPrompt ? "Run now" : "Set a run prompt first"}
                    onClick={async () => {
                      setSaving(active.id)

                      try {
                        const response = await fetch("/api/agent/definitions/run", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: active.id }),
                        })

                        const result = await response.json()

                        if (result.success) {
                          toast({
                            title: `${active.name} executed`,
                            description: result.data.text || "(no reply)",
                          })
                        } else {
                          toast({
                            variant: "destructive",
                            title: "Agent run failed",
                            description: result.error || "Execution failed",
                          })
                        }

                        await load()
                      } finally {
                        setSaving(null)
                      }
                    }}
                  >
                    <Play className="mr-1.5 h-3 w-3" />
                    Run now
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving === active.id}
                    onClick={() => void patch(active.id, { enabled: !active.enabled })}
                  >
                    {active.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium">Instructions</p>
                <Textarea
                  defaultValue={active.instructions}
                  rows={8}
                  className="text-xs"
                  onBlur={(event) => {
                    if (event.target.value !== active.instructions) {
                      void patch(active.id, { instructions: event.target.value })
                    }
                  }}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Saved when you click away. Business context is appended automatically.
                </p>
              </div>

              {/* ---- Schedule ---- */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  <p className="text-xs font-medium">Schedule</p>
                  {active.lastRunStatus === "failed" ? (
                    <Badge variant="destructive" className="text-[10px]">
                      last run failed
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1">
                  {SCHEDULE_PRESETS.map((preset) => {
                    const current = active.trigger === "schedule" ? active.schedule || "" : ""
                    const selectedPreset = current === preset.value

                    return (
                      <button
                        key={preset.label}
                        disabled={saving === active.id}
                        onClick={() =>
                          void patch(active.id, {
                            trigger: preset.value ? "schedule" : "manual",
                            schedule: preset.value || null,
                          })
                        }
                        className={`rounded border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-50 ${
                          selectedPreset
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                        }`}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>

                <Input
                  defaultValue={active.schedule || ""}
                  placeholder="Or a cron expression: 0 7 * * 1-5"
                  className="h-8 font-mono text-xs"
                  onBlur={(event) => {
                    const value = event.target.value.trim()
                    if (value !== (active.schedule || "")) {
                      void patch(active.id, {
                        schedule: value || null,
                        trigger: value ? "schedule" : "manual",
                      })
                    }
                  }}
                />

                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    What it should do on each run
                  </p>
                  <Textarea
                    defaultValue={active.runPrompt || ""}
                    rows={2}
                    placeholder="Review leads that have had no contact for 7 days and draft a follow-up task for each."
                    className="text-xs"
                    onBlur={(event) => {
                      if (event.target.value !== (active.runPrompt || "")) {
                        void patch(active.id, { runPrompt: event.target.value })
                      }
                    }}
                  />
                </div>

                <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span>
                    Next:{" "}
                    {active.nextRunAt ? new Date(active.nextRunAt).toLocaleString() : "not scheduled"}
                  </span>
                  <span>
                    Last:{" "}
                    {active.lastRunAt ? new Date(active.lastRunAt).toLocaleString() : "never"}
                  </span>
                </div>

                {active.lastRunError ? (
                  <p className="text-[11px] text-destructive">{active.lastRunError}</p>
                ) : null}

                {active.trigger === "schedule" && !active.runPrompt ? (
                  <p className="text-[11px] text-amber-600">
                    Scheduled but no run prompt — it will be skipped until you give it something to do.
                  </p>
                ) : null}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5" />
                  <p className="text-xs font-medium">
                    Tools —{" "}
                    {active.tools === null
                      ? `all ${catalogue.length}`
                      : `${active.tools.length} of ${catalogue.length}`}
                  </p>
                </div>

                {RISK_ORDER.map((risk) => (
                  <div key={risk} className="mb-2">
                    <p className={`mb-1 text-[10px] uppercase tracking-wide ${RISK_TONE[risk]}`}>
                      {risk}
                      {risk === "high" ? " — always needs approval" : ""}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(byRisk[risk] || []).map((tool) => {
                        const granted = active.tools === null || active.tools.includes(tool.name)

                        return (
                          <button
                            key={tool.name}
                            disabled={saving === active.id}
                            onClick={() => toggleTool(active, tool.name)}
                            className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors disabled:opacity-50 ${
                              granted
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:bg-accent"
                            }`}
                          >
                            {tool.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                <Bot className="h-3.5 w-3.5 shrink-0" />
                An allowlist can only ever remove reach. Role limits and approval thresholds still
                apply on top, so granting a tool here does not bypass them.
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  )
}
