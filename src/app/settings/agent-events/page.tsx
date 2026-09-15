"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  Plus,
  ScrollText,
  Trash2,
  Zap,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface EventPath {
  path: string
  kind: "number" | "string" | "boolean"
  label: string
}

interface EventTypeDescriptor {
  type: string
  label: string
  description: string
  live: boolean
  raisedBy?: string
  paths: EventPath[]
  suggestedCooldownKeyPath?: string
}

interface Filter {
  path: string
  operator: string
  value?: unknown
}

interface Subscription {
  id: string
  eventType: string
  enabled: boolean
  filters: Filter[]
  companyId: string | null
  maxPerHour: number
  cooldownSeconds: number
  cooldownKeyPath: string | null
  prompt: string | null
  agent: { id: string; name: string; slug: string; enabled: boolean }
  _count: { log: number }
}

interface LogRow {
  id: string
  eventId: string
  eventType: string
  ran: boolean
  reason: string | null
  startedAt: string
  subscription: { id: string; agent: { name: string; slug: string } }
}

interface AgentOption {
  id: string
  slug: string
  name: string
  avatar?: string | null
}

const OPERATOR_LABELS: Record<string, string> = {
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  eq: "is",
  ne: "is not",
  contains: "contains",
  in: "is one of",
  exists: "is present",
}

function operatorsFor(kind: EventPath["kind"]) {
  if (kind === "number") return ["gt", "gte", "lt", "lte", "eq", "ne", "exists"]
  if (kind === "boolean") return ["eq", "exists"]
  return ["eq", "ne", "contains", "in", "exists"]
}

function describeFilter(filter: Filter, descriptor: EventTypeDescriptor | undefined) {
  const label = descriptor?.paths.find((p) => p.path === filter.path)?.label ?? filter.path
  const operator = OPERATOR_LABELS[filter.operator] ?? filter.operator

  if (filter.operator === "exists") {
    return `${label} ${filter.value === false ? "is missing" : "is present"}`
  }

  return `${label} ${operator} ${String(filter.value ?? "")}`
}

const BLANK = {
  agentId: "",
  eventType: "",
  filters: [] as Filter[],
  maxPerHour: "60",
  cooldownSeconds: "0",
  cooldownKeyPath: "",
  prompt: "",
  groupWide: false,
}

export default function AgentEventsPage() {
  const { toast } = useToast()

  const [eventTypes, setEventTypes] = useState<EventTypeDescriptor[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [log, setLog] = useState<LogRow[]>([])

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ ...BLANK })
  const [draftError, setDraftError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [main, logs, defs] = await Promise.all([
        fetch("/api/agent/events").then((r) => r.json()),
        fetch("/api/agent/events?view=log").then((r) => r.json()),
        fetch("/api/agent/definitions").then((r) => r.json()),
      ])

      if (main.success) {
        setEventTypes(main.data.eventTypes ?? [])
        setSubscriptions(main.data.subscriptions ?? [])
        setError(null)
      } else {
        setError(main.error || "Failed to load")
      }

      if (logs.success) setLog(logs.data ?? [])

      const list = defs.data?.definitions ?? defs.data ?? []
      setAgents(Array.isArray(list) ? list : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch("/api/agent/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      return { status: res.status, body: await res.json() }
    } finally {
      setBusy(false)
    }
  }

  const selectedType = useMemo(
    () => eventTypes.find((entry) => entry.type === draft.eventType),
    [eventTypes, draft.eventType]
  )

  const liveCount = eventTypes.filter((entry) => entry.live).length

  function pickEventType(type: string) {
    const descriptor = eventTypes.find((entry) => entry.type === type)

    setDraft((current) => ({
      ...current,
      eventType: type,
      // Filters are cleared on purpose: a path from the previous event type
      // will not exist on this one, and a filter on a missing path never
      // matches — an agent that silently never wakes.
      filters: [],
      cooldownKeyPath: descriptor?.suggestedCooldownKeyPath ?? "",
    }))
  }

  function addFilter() {
    const first = selectedType?.paths[0]
    if (!first) return

    setDraft((current) => ({
      ...current,
      filters: [
        ...current.filters,
        { path: first.path, operator: operatorsFor(first.kind)[0], value: "" },
      ],
    }))
  }

  function updateFilter(index: number, patch: Partial<Filter>) {
    setDraft((current) => ({
      ...current,
      filters: current.filters.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)),
    }))
  }

  function removeFilter(index: number) {
    setDraft((current) => ({
      ...current,
      filters: current.filters.filter((_, i) => i !== index),
    }))
  }

  async function save() {
    setDraftError(null)

    if (!draft.agentId || !draft.eventType) {
      setDraftError("Choose an agent and an event")
      return
    }

    // Numbers are sent as numbers; a blank box must not become NaN and be
    // stored as a rate limit nobody chose.
    const filters = draft.filters.map((filter) => {
      const kind = selectedType?.paths.find((p) => p.path === filter.path)?.kind
      const raw = filter.value

      if (filter.operator === "exists") return { path: filter.path, operator: "exists" }
      if (filter.operator === "in") {
        return {
          path: filter.path,
          operator: "in",
          value: String(raw ?? "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
        }
      }

      return {
        path: filter.path,
        operator: filter.operator,
        value: kind === "number" ? Number(raw) : raw,
      }
    })

    const result = await post({
      action: "subscribe",
      agentId: draft.agentId,
      eventType: draft.eventType,
      filters,
      maxPerHour: Number(draft.maxPerHour) || 0,
      cooldownSeconds: Number(draft.cooldownSeconds) || 0,
      cooldownKeyPath: draft.cooldownKeyPath || null,
      prompt: draft.prompt || null,
      groupWide: draft.groupWide,
    })

    if (!result.body.success) {
      setDraftError(result.body.error)
      return
    }

    setOpen(false)
    setDraft({ ...BLANK })
    toast({ title: "Trigger created", description: "The agent will wake when this happens." })
    await load()
  }

  async function toggle(subscription: Subscription) {
    await post({ action: "update", id: subscription.id, enabled: !subscription.enabled })
    await load()
  }

  async function remove(subscription: Subscription) {
    await post({ action: "unsubscribe", id: subscription.id })
    toast({ title: "Trigger removed" })
    await load()
  }

  async function test(subscription: Subscription) {
    const descriptor = eventTypes.find((entry) => entry.type === subscription.eventType)

    // A payload built from the subscription's own filters, so the test
    // exercises the rule rather than a generic shape that always fails it.
    const payload: Record<string, unknown> = {}

    for (const filter of subscription.filters) {
      const kind = descriptor?.paths.find((p) => p.path === filter.path)?.kind
      const segments = filter.path.split(".")
      let node = payload

      for (let i = 0; i < segments.length - 1; i++) {
        node[segments[i]] = (node[segments[i]] as Record<string, unknown>) ?? {}
        node = node[segments[i]] as Record<string, unknown>
      }

      const leaf = segments[segments.length - 1]
      const value = Number(filter.value)

      if (kind === "number" && Number.isFinite(value)) {
        // Land on the passing side of whichever comparison was chosen.
        node[leaf] =
          filter.operator === "gt" || filter.operator === "gte"
            ? value + Math.max(1, Math.abs(value))
            : filter.operator === "lt" || filter.operator === "lte"
              ? Math.max(0, value - 1)
              : value
      } else {
        node[leaf] = filter.value ?? "test"
      }
    }

    const result = await post({
      action: "test",
      eventType: subscription.eventType,
      payload,
    })

    const outcome = result.body.data
    const woke = outcome?.woke?.find(
      (row: { subscriptionId: string }) => row.subscriptionId === subscription.id
    )
    const skipped = outcome?.skipped?.find(
      (row: { subscriptionId: string }) => row.subscriptionId === subscription.id
    )

    toast({
      title: woke ? (woke.ok ? "Agent ran" : "Agent woke but the run failed") : "Did not fire",
      description: woke?.error ?? skipped?.reason ?? "The rule matched and the agent ran.",
      variant: woke?.ok ? undefined : "destructive",
    })

    await load()
  }

  return (
    <AppShell
      title="Event Triggers"
      breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Event triggers" }]}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Event Triggers</h1>
            <p className="text-sm text-muted-foreground">
              Wake an agent when something happens in the business, rather than on a clock.
            </p>
          </div>

          <Button size="sm" onClick={() => setOpen(true)} disabled={!agents.length}>
            <Plus className="mr-2 h-4 w-4" />
            New trigger
          </Button>
        </div>

        {error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Triggers</CardDescription>
              <CardTitle className="text-2xl">{subscriptions.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-2xl">
                {subscriptions.filter((s) => s.enabled && s.agent.enabled).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Events raised by the system</CardDescription>
              <CardTitle className="text-2xl">
                {liveCount}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  of {eventTypes.length}
                </span>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4" />
              Triggers
            </CardTitle>
            <CardDescription>
              Each one wakes its agent when the event happens and every condition passes.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="space-y-3 py-12 text-center">
                <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No triggers yet. An agent with one wakes on its own when something happens.
                </p>
                <Button size="sm" onClick={() => setOpen(true)} disabled={!agents.length}>
                  <Plus className="mr-2 h-4 w-4" />
                  New trigger
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Only if</TableHead>
                      <TableHead>Limits</TableHead>
                      <TableHead>On</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.map((subscription) => {
                      const descriptor = eventTypes.find(
                        (entry) => entry.type === subscription.eventType
                      )

                      return (
                        <TableRow key={subscription.id}>
                          <TableCell className="font-medium">
                            {subscription.agent.name}
                            {!subscription.agent.enabled ? (
                              <Badge variant="outline" className="ml-2">
                                agent off
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{descriptor?.label ?? subscription.eventType}</span>
                              {descriptor && !descriptor.live ? (
                                <Badge variant="destructive">not raised yet</Badge>
                              ) : null}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {subscription.eventType}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[260px] text-sm">
                            {subscription.filters.length === 0 ? (
                              <span className="text-muted-foreground">Every time</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {subscription.filters.map((filter, index) => (
                                  <li key={index} className="truncate">
                                    {describeFilter(filter, descriptor)}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div>
                              {subscription.maxPerHour > 0
                                ? `${subscription.maxPerHour}/hour`
                                : "No cap"}
                            </div>
                            {subscription.cooldownSeconds > 0 ? (
                              <div>{subscription.cooldownSeconds}s per subject</div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={subscription.enabled}
                              onCheckedChange={() => toggle(subscription)}
                              disabled={busy}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => test(subscription)}
                                disabled={busy}
                              >
                                Test
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => remove(subscription)}
                                disabled={busy}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4" />
              What happened
            </CardTitle>
            <CardDescription>
              Every event these triggers saw, and why each one did or did not run. Refusals are kept
              on purpose — a trigger that quietly does nothing is the hard one to debug.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {log.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing yet. Create a trigger and use Test to see it decide.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Agent</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.slice(0, 30).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          {row.ran ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{row.subscription.agent.name}</TableCell>
                        <TableCell className="font-mono text-xs">{row.eventType}</TableCell>
                        <TableCell className="max-w-[320px] text-sm">
                          {row.ran ? (
                            <span className="text-emerald-700">Ran</span>
                          ) : (
                            <span className="text-muted-foreground">{row.reason ?? "Skipped"}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(row.startedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New event trigger</DialogTitle>
            <DialogDescription>
              The agent wakes when this happens and every condition passes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trigger-agent">Agent</Label>
                <select
                  id="trigger-agent"
                  value={draft.agentId}
                  onChange={(e) => setDraft({ ...draft, agentId: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">Choose an agent…</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trigger-event">When this happens</Label>
                <select
                  id="trigger-event"
                  value={draft.eventType}
                  onChange={(e) => pickEventType(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">Choose an event…</option>
                  <optgroup label="Raised by the system">
                    {eventTypes
                      .filter((entry) => entry.live)
                      .map((entry) => (
                        <option key={entry.type} value={entry.type}>
                          {entry.label}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Not raised yet">
                    {eventTypes
                      .filter((entry) => !entry.live)
                      .map((entry) => (
                        <option key={entry.type} value={entry.type}>
                          {entry.label}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {selectedType ? (
              <div
                className={`rounded-md border p-3 text-sm ${
                  selectedType.live ? "" : "border-amber-500 bg-amber-50/50"
                }`}
              >
                <p>{selectedType.description}</p>
                {selectedType.live ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Raised by <span className="font-mono">{selectedType.raisedBy}</span>.
                  </p>
                ) : (
                  <p className="mt-1 flex items-start gap-1.5 text-xs">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    Nothing in the system raises this event yet, so a trigger on it will never fire.
                    You can still create it and it will start working when the event is wired up.
                  </p>
                )}
              </div>
            ) : null}

            {selectedType ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Only if</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add condition
                  </Button>
                </div>

                {draft.filters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No conditions — the agent wakes every time this happens.
                  </p>
                ) : null}

                {draft.filters.map((filter, index) => {
                  const kind =
                    selectedType.paths.find((p) => p.path === filter.path)?.kind ?? "string"

                  return (
                    // On a phone the path name is the part worth reading, so it
                    // takes the first line on its own; squeezed into a shared
                    // row it renders as "Yie" and the rule is unreadable.
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <select
                        value={filter.path}
                        onChange={(e) => {
                          const next = selectedType.paths.find((p) => p.path === e.target.value)
                          updateFilter(index, {
                            path: e.target.value,
                            operator: operatorsFor(next?.kind ?? "string")[0],
                            value: "",
                          })
                        }}
                        className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm sm:w-auto sm:flex-1"
                      >
                        {selectedType.paths.map((path) => (
                          <option key={path.path} value={path.path}>
                            {path.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={filter.operator}
                        onChange={(e) => updateFilter(index, { operator: e.target.value })}
                        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm sm:flex-none"
                      >
                        {operatorsFor(kind).map((operator) => (
                          <option key={operator} value={operator}>
                            {OPERATOR_LABELS[operator]}
                          </option>
                        ))}
                      </select>

                      {filter.operator !== "exists" ? (
                        <Input
                          value={String(filter.value ?? "")}
                          onChange={(e) => updateFilter(index, { value: e.target.value })}
                          placeholder={
                            filter.operator === "in" ? "comma, separated, values" : "value"
                          }
                          type={kind === "number" && filter.operator !== "in" ? "number" : "text"}
                          className="h-9 min-w-0 flex-1 sm:w-32 sm:flex-none"
                        />
                      ) : null}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => removeFilter(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="trigger-prompt">What the agent should do</Label>
              <Textarea
                id="trigger-prompt"
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                placeholder="A large order came in. Check stock covers it and flag anything short."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                The event's details are added below this automatically.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trigger-rate">Most runs per hour</Label>
                <Input
                  id="trigger-rate"
                  type="number"
                  min={0}
                  value={draft.maxPerHour}
                  onChange={(e) => setDraft({ ...draft, maxPerHour: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  A bulk import fires thousands of events. Zero means no cap.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trigger-cooldown">Ignore the same subject for</Label>
                <Input
                  id="trigger-cooldown"
                  type="number"
                  min={0}
                  value={draft.cooldownSeconds}
                  onChange={(e) => setDraft({ ...draft, cooldownSeconds: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Seconds. For one order that changes five times in a minute.
                  {draft.cooldownKeyPath ? (
                    <>
                      {" "}
                      Subject is <span className="font-mono">{draft.cooldownKeyPath}</span>.
                    </>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="trigger-group"
                checked={draft.groupWide}
                onCheckedChange={(checked) => setDraft({ ...draft, groupWide: checked === true })}
              />
              <Label htmlFor="trigger-group" className="text-sm font-normal leading-snug">
                Every entity in the group
                <span className="block text-xs text-muted-foreground">
                  Otherwise only events from the entity you are working in.
                </span>
              </Label>
            </div>
          </div>

          {draftError ? <p className="text-sm text-destructive">{draftError}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create trigger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
