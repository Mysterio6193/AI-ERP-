"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, Clock, Loader2, Lock, Play, Plus, Radio, RefreshCw, Shield, ShieldCheck, Wrench, Sparkles, AlertCircle } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
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
  model: string | null
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

const MODEL_PRESETS = [
  { label: "Default for Role", value: "" },
  { label: "DeepSeek Chat (V3)", value: "deepseek/deepseek-chat" },
  { label: "Meta Llama 3.3 70B", value: "meta-llama/llama-3.3-70b-instruct" },
  { label: "Claude 3.5 Sonnet", value: "anthropic/claude-3.5-sonnet" },
  { label: "Claude 3.7 Sonnet", value: "anthropic/claude-3.7-sonnet" },
  { label: "OpenAI GPT-4o Mini", value: "openai/gpt-4o-mini" },
  { label: "Google Gemini 2.0 Flash", value: "google/gemini-2.0-flash-001" },
]

interface AutonomyState {
  thresholds: {
    maxOrderValue: number
    maxPurchaseOrderValue: number
    maxPaymentValue: number
    maxDiscountPercent: number
    maxInventoryAdjustment: number
    allowOutboundMessages: boolean
    readOnly: boolean
  }
  limits: Record<string, number>
  allowSettingWrites: boolean
  summary: string[]
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
  low: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  high: "text-rose-600 dark:text-rose-400",
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
  const [autonomy, setAutonomy] = useState<AutonomyState | null>(null)

  const [draft, setDraft] = useState({
    name: "",
    description: "",
    avatar: "🤖",
    instructions: "",
    model: "",
    tools: [] as string[],
  })

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const [result, watchResult, policyResult] = await Promise.all([
        fetch("/api/agent/definitions").then((response) => response.json()),
        fetch("/api/agent/heartbeat").then((response) => response.json()),
        fetch("/api/agent/policy").then((response) => response.json()),
      ])

      if (result.success) {
        setAgents(result.data.definitions)
        setCatalogue(result.data.catalogue)
      }

      if (watchResult.success) {
        setWatch(watchResult.data)
      }

      if (policyResult.success) {
        setAutonomy(policyResult.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const active = agents.find((agent) => agent.id === selected) || null

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
    [load, toast]
  )

  function toggleTool(agent: AgentDefinition, toolName: string) {
    const current = agent.tools ?? catalogue.map((tool) => tool.name)
    const next = current.includes(toolName)
      ? current.filter((name) => name !== toolName)
      : [...current, toolName]

    void patch(agent.id, { tools: next })
  }

  return (
    <AppShell title="Agents" breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Agents" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Autonomous Agents & Copilots"
          description="Configure system personas, tool permissions, autonomy thresholds, and continuous heartbeat monitoring."
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
                New Agent
              </Button>
            </div>
          }
        />

        {/* Autonomy Card */}
        {autonomy ? (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Autonomy & Guardrail Thresholds
                    {autonomy.thresholds.readOnly ? (
                      <Badge variant="secondary" className="text-[10px]">
                        read-only mode
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-700">
                        active autonomy
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Defines financial ceilings and modification limits before the agent halts and requests supervisor approval.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving === "policy"}
                    onClick={async () => {
                      setSaving("policy")
                      try {
                        const response = await fetch("/api/agent/policy", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ reset: true }),
                        }).then((r) => r.json())
                        if (response.success) await load()
                      } finally {
                        setSaving(null)
                      }
                    }}
                  >
                    Reset Defaults
                  </Button>
                  <Button
                    size="sm"
                    variant={autonomy.thresholds.readOnly ? "default" : "outline"}
                    disabled={saving === "policy"}
                    onClick={async () => {
                      setSaving("policy")
                      try {
                        const response = await fetch("/api/agent/policy", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ readOnly: !autonomy.thresholds.readOnly }),
                        }).then((r) => r.json())
                        if (response.success) await load()
                      } finally {
                        setSaving(null)
                      }
                    }}
                  >
                    {autonomy.thresholds.readOnly ? "Enable Write Autonomy" : "Lock to Read-Only"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3.5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Policy Summary
                </p>
                <ul className="space-y-1">
                  {autonomy.summary.map((line) => (
                    <li key={line} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {!autonomy.thresholds.readOnly ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["maxOrderValue", "Sales order limit", "$"],
                      ["maxPurchaseOrderValue", "Purchase order limit", "$"],
                      ["maxPaymentValue", "Payment limit", "$"],
                      ["maxDiscountPercent", "Discount limit", "%"],
                      ["maxInventoryAdjustment", "Stock correction limit", "units"],
                    ] as const
                  ).map(([field, label, unit]) => (
                    <label
                      key={field}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-2.5 hover:bg-muted/20 transition-colors"
                    >
                      <span className="text-xs font-medium text-foreground">
                        {label}
                        <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                          ({unit === "$" ? "dollars" : unit})
                        </span>
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={autonomy.limits[field]}
                        defaultValue={autonomy.thresholds[field]}
                        disabled={saving === "policy"}
                        className="h-8 w-28 text-xs font-mono"
                        onBlur={async (event) => {
                          const next = Number(event.target.value)
                          if (next === autonomy.thresholds[field]) return

                          setSaving("policy")
                          try {
                            const response = await fetch("/api/agent/policy", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ [field]: next }),
                            }).then((r) => r.json())
                            if (response.success) await load()
                          } finally {
                            setSaving(null)
                          }
                        }}
                      />
                    </label>
                  ))}

                  <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-2.5 hover:bg-muted/20 transition-colors">
                    <span className="text-xs font-medium text-foreground">Send customer messages directly</span>
                    <input
                      type="checkbox"
                      checked={autonomy.thresholds.allowOutboundMessages}
                      disabled={saving === "policy"}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      onChange={async (event) => {
                        setSaving("policy")
                        try {
                          const response = await fetch("/api/agent/policy", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ allowOutboundMessages: event.target.checked }),
                          }).then((r) => r.json())
                          if (response.success) await load()
                        } finally {
                          setSaving(null)
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Limits are bypassed while the agent is locked in read-only mode.
                </p>
              )}

              <label className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/20 transition-colors">
                <span className="text-xs font-medium text-foreground">
                  Allow agent to propose business configuration updates
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground leading-relaxed">
                    Tax rates, due dates, numbering, and pricing rules. Every proposal requires explicit human sign-off with clear parameter diffs.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={autonomy.allowSettingWrites}
                  disabled={saving === "policy"}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
                  onChange={async (event) => {
                    setSaving("policy")
                    try {
                      const response = await fetch("/api/agent/policy", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ allowSettingWrites: event.target.checked }),
                      }).then((r) => r.json())
                      if (response.success) await load()
                    } finally {
                      setSaving(null)
                    }
                  }}
                />
              </label>
            </CardContent>
          </Card>
        ) : null}

        {/* Watch Loop Card */}
        {watch ? (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Radio className="h-4 w-4 text-sky-500" />
                    Continuous Business Watchdog (Heartbeat)
                    <Badge
                      variant={watch.config.enabled ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {watch.config.enabled ? "monitoring active" : "disabled"}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Monitors stock depletion, invoice overdue milestones, and anomalous orders on every cron tick.
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
                    Dry Run
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
                    {watch.config.enabled ? "Turn Off" : "Turn On"}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {!watch.recipients.length ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>No Telegram accounts linked. Connect staff Telegram under Agent Settings to receive live heartbeat alerts.</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Alerting {watch.recipients.map((person) => person.name).join(", ")} · max {watch.config.maxPerTick} alerts/tick
                </p>
              )}

              <div>
                <p className="mb-1.5 text-xs font-semibold text-foreground">
                  Active Signals ({watch.signals.length})
                </p>
                {!watch.signals.length ? (
                  <p className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    All clear. No operational anomalies detected.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {watch.signals.map((signal, index) => (
                      <div key={index} className="rounded-lg border border-border bg-card p-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={signal.severity === "urgent" ? "destructive" : "outline"}
                            className="text-[10px]"
                          >
                            {signal.severity}
                          </Badge>
                          <span className="font-medium text-foreground">{signal.title}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{signal.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {watch.recent.length ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-foreground">Recently Dispatched</p>
                  <div className="space-y-1">
                    {watch.recent.slice(0, 5).map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-2 text-xs text-muted-foreground rounded border border-border/60 p-2"
                      >
                        <span className="truncate font-medium">{row.title}</span>
                        <span className="shrink-0 text-[11px]">
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

        {/* Create Agent Form */}
        {creating ? (
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-base">Create Custom Agent</CardTitle>
              <CardDescription className="text-xs">
                Configure a purpose-specific copilot with custom system instructions, model routing, and restricted tool privileges.
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
                  placeholder="Agent Name (e.g. Lead Qualifier)"
                  className="h-8 text-xs"
                />
                <Input
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Short purpose description"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">AI Model Engine</label>
                <div className="flex flex-wrap gap-1">
                  {MODEL_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, model: preset.value }))}
                      className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
                        draft.model === preset.value
                          ? "border-primary bg-primary text-primary-foreground font-medium"
                          : "border-border bg-background hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <Input
                  value={draft.model}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, model: event.target.value.trim() }))
                  }
                  placeholder="Or custom OpenRouter model: e.g. anthropic/claude-3.5-sonnet"
                  className="h-8 font-mono text-xs"
                />
              </div>

              <Textarea
                value={draft.instructions}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, instructions: event.target.value }))
                }
                placeholder="You qualify inbound food wholesale leads. Ask about venue type, weekly carton volume and delivery schedule. Log everything. Never discuss special discounts."
                rows={4}
                className="text-xs"
              />

              <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                <p className="text-xs font-semibold text-foreground">
                  Allowed Tools ({draft.tools.length} of {catalogue.length})
                </p>
                {RISK_ORDER.map((risk) => (
                  <div key={risk}>
                    <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${RISK_TONE[risk]}`}>
                      {risk} {risk === "high" ? " — requires manual sign-off" : ""}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(byRisk[risk] || []).map((tool) => (
                        <button
                          key={tool.name}
                          type="button"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              tools: current.tools.includes(tool.name)
                                ? current.tools.filter((name) => name !== tool.name)
                                : [...current.tools, tool.name],
                            }))
                          }
                          className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
                            draft.tools.includes(tool.name)
                              ? "border-primary bg-primary text-primary-foreground font-medium"
                              : "border-border bg-background hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          {tool.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
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
                      setDraft({ name: "", description: "", avatar: "🤖", instructions: "", model: "", tools: [] })
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
                  Create Agent
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Agent Cards Grid */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className={`cursor-pointer transition-all border ${
                selected === agent.id ? "border-primary ring-1 ring-primary shadow-sm" : "hover:border-border/80 hover:shadow-sm"
              }`}
              onClick={() => setSelected(selected === agent.id ? null : agent.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <span className="text-xl">{agent.avatar || "🤖"}</span>
                  <span className="truncate">{agent.name}</span>
                  {agent.isSystem ? (
                    <Lock className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  ) : null}
                  {!agent.enabled ? (
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      inactive
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription className="text-xs line-clamp-2">
                  {agent.description || "No description provided."}
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
                  <span>{agent.runCount} runs executed</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active Agent Inspector Card */}
        {active ? (
          <Card className="border border-border">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="text-2xl">{active.avatar || "🤖"}</span>
                    {active.name}
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {active.slug}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    {active.isSystem
                      ? "System agent. Core to SupplySure OS operational flow."
                      : "Custom workspace agent."}
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
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Run Now
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
                <p className="mb-1 text-xs font-semibold text-foreground">System Directives & Instructions</p>
                <Textarea
                  defaultValue={active.instructions}
                  rows={6}
                  className="text-xs"
                  onBlur={(event) => {
                    if (event.target.value !== active.instructions) {
                      void patch(active.id, { instructions: event.target.value })
                    }
                  }}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Saved automatically on blur. Real-time ERP context and company metadata are injected at runtime.
                </p>
              </div>

              {/* AI Model Settings */}
              <div className="space-y-2 rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold text-foreground">Assigned AI Model</p>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {active.model || "Default for Purpose"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {MODEL_PRESETS.map((preset) => {
                    const isSelected = (active.model || "") === preset.value
                    return (
                      <button
                        key={preset.label}
                        disabled={saving === active.id}
                        onClick={() =>
                          void patch(active.id, {
                            model: preset.value || null,
                          })
                        }
                        className={`rounded border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-50 ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground font-medium"
                            : "border-border bg-background hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>

                <Input
                  defaultValue={active.model || ""}
                  placeholder="Or custom model ID: e.g. deepseek/deepseek-chat"
                  className="h-8 font-mono text-xs"
                  onBlur={(event) => {
                    const value = event.target.value.trim()
                    if (value !== (active.model || "")) {
                      void patch(active.id, {
                        model: value || null,
                      })
                    }
                  }}
                />
              </div>

              {/* Schedule Settings */}
              <div className="space-y-2 rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Automated Trigger Schedule</p>
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
                            ? "border-primary bg-primary text-primary-foreground font-medium"
                            : "border-border bg-background hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>

                <Input
                  defaultValue={active.schedule || ""}
                  placeholder="Or standard cron format: 0 8 * * 1-5"
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
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                    Scheduled Routine Prompt
                  </p>
                  <Textarea
                    defaultValue={active.runPrompt || ""}
                    rows={2}
                    placeholder="Audit leads with no contact for 7 days and draft follow-up CRM reminders."
                    className="text-xs"
                    onBlur={(event) => {
                      if (event.target.value !== (active.runPrompt || "")) {
                        void patch(active.id, { runPrompt: event.target.value })
                      }
                    }}
                  />
                </div>

                <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground pt-1">
                  <span>
                    Next: {active.nextRunAt ? new Date(active.nextRunAt).toLocaleString() : "not scheduled"}
                  </span>
                  <span>
                    Last: {active.lastRunAt ? new Date(active.lastRunAt).toLocaleString() : "never"}
                  </span>
                </div>

                {active.lastRunError ? (
                  <p className="text-xs text-destructive">{active.lastRunError}</p>
                ) : null}
              </div>

              {/* Tools Allowlist */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold text-foreground">
                    Allowed Capabilities & Tools (
                    {active.tools === null
                      ? `all ${catalogue.length}`
                      : `${active.tools.length} of ${catalogue.length}`}
                    )
                  </p>
                </div>

                {RISK_ORDER.map((risk) => (
                  <div key={risk} className="mb-2">
                    <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${RISK_TONE[risk]}`}>
                      {risk} {risk === "high" ? " — always requires approval" : ""}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(byRisk[risk] || []).map((tool) => {
                        const granted = active.tools === null || active.tools.includes(tool.name)

                        return (
                          <button
                            key={tool.name}
                            disabled={saving === active.id}
                            onClick={() => toggleTool(active, tool.name)}
                            className={`rounded border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-50 ${
                              granted
                                ? "border-primary bg-primary text-primary-foreground font-medium"
                                : "border-border bg-background hover:bg-muted text-muted-foreground"
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
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  )
}

