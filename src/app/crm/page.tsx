"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CircleDollarSign,
  Clock,
  Loader2,
  PhoneOff,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

interface FocusItem {
  reason: "task_overdue" | "case_open" | "account_lapsing" | "invoice_overdue"
  title: string
  detail: string
  customer: string | null
  customerId: string | null
  entityId: string | null
  value: number | null
}

interface PipelineStage {
  stage: string
  count: number
  value: number
  weighted: number
  opportunities: Array<{
    id: string
    name: string
    customer: string | null
    value: number
    probability: number
    expectedCloseDate: string | null
  }>
}

interface TaskRow {
  id: string
  title: string
  dueAt: string | null
  priority: string
  customer: string | null
}

interface CaseRow {
  id: string
  caseNumber: string
  subject: string
  category: string
  severity: string
  createdByAgent: boolean
  customer: { name: string } | null
  contact: { name: string } | null
  assignedTo: { name: string } | null
}

interface ActivityRow {
  id: string
  type: string
  subject: string
  body: string | null
  occurredAt: string
  createdByAgent: boolean
  customer: { name: string } | null
  contact: { name: string } | null
  user: { name: string } | null
}

interface LeadRow {
  id: string
  businessName: string
  contactName: string | null
  phone: string | null
  email: string | null
  suburb: string | null
  source: string
  status: string
  estimatedValue: number | null
  owner: { name: string } | null
}

interface LapsedRow {
  customerId: string
  customer: string
  contact: string | null
  phone: string | null
  usualGapDays: number
  daysSinceLastOrder: number
  monthlyValueAtRisk: number
}

const REASON_META: Record<FocusItem["reason"], { label: string; icon: typeof Clock; tone: string }> = {
  case_open: { label: "Case", icon: AlertTriangle, tone: "text-red-600" },
  task_overdue: { label: "Overdue", icon: Clock, tone: "text-amber-600" },
  account_lapsing: { label: "Going quiet", icon: PhoneOff, tone: "text-orange-600" },
  invoice_overdue: { label: "Unpaid", icon: CircleDollarSign, tone: "text-rose-600" },
}

const STAGE_ORDER = ["prospect", "qualified", "proposal", "negotiation"]

function nextStage(stage: string) {
  const index = STAGE_ORDER.indexOf(stage)
  return index >= 0 && index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null
}

function money(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CrmPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState("focus")
  const [loading, setLoading] = useState(true)
  const [focus, setFocus] = useState<{ items: FocusItem[]; counters: Record<string, number> } | null>(null)
  const [pipeline, setPipeline] = useState<{ byStage: PipelineStage[]; totalValue: number; weightedValue: number; totalCount: number } | null>(null)
  const [cases, setCases] = useState<CaseRow[]>([])
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [lapsed, setLapsed] = useState<LapsedRow[]>([])
  const [newLead, setNewLead] = useState({ businessName: "", contactName: "", phone: "" })

  // The prospect list runs to thousands of rows, so leads are searched and
  // paged server-side rather than loaded with everything else.
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [leadSearch, setLeadSearch] = useState("")
  const [leadStatus, setLeadStatus] = useState("all")
  const [leadPage, setLeadPage] = useState(1)
  const [leadMeta, setLeadMeta] = useState({ total: 0, pageCount: 0 })
  const [leadsLoading, setLeadsLoading] = useState(false)

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true)

    try {
      const params = new URLSearchParams({
        view: "leads",
        page: String(leadPage),
        pageSize: "50",
      })
      if (leadSearch.trim()) params.set("search", leadSearch.trim())
      if (leadStatus !== "all") params.set("status", leadStatus)

      const result = await fetch(`/api/crm?${params}`).then((response) => response.json())

      if (result.success) {
        setLeads(result.data.leads)
        setLeadMeta({ total: result.data.total, pageCount: result.data.pageCount })
      }
    } finally {
      setLeadsLoading(false)
    }
  }, [leadPage, leadSearch, leadStatus])

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const views = ["focus", "pipeline", "cases", "activities", "lapsed"]
      const responses = await Promise.all(
        views.map((view) => fetch(`/api/crm?view=${view}`).then((response) => response.json()))
      )

      const [focusData, pipelineData, casesData, activityData, lapsedData] = responses

      if (focusData.success) setFocus(focusData.data)
      if (pipelineData.success) setPipeline(pipelineData.data)
      if (casesData.success) setCases(casesData.data)
      if (activityData.success) setActivities(activityData.data)
      if (lapsedData.success) setLapsed(lapsedData.data)

      await loadLeads()
    } finally {
      setLoading(false)
    }
  }, [loadLeads])

  const [acting, setActing] = useState<string | null>(null)

  const act = useCallback(
    async (action: string, payload: Record<string, unknown>, key: string) => {
      setActing(key)

      try {
        const response = await fetch("/api/crm/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        })

        const result = await response.json()

        if (!result.success) {
          toast({
            variant: "destructive",
            title: "CRM action failed",
            description: result.error || "Action failed",
          })
          return
        }

        await load()
        toast({
          title: "CRM updated",
          description: "Action completed successfully.",
        })
      } finally {
        setActing(null)
      }
    },
    [load]
  )

  useEffect(() => {
    void load()
  }, [load])

  // Debounced so typing in the search box does not fire a query per character.
  useEffect(() => {
    const timer = setTimeout(() => void loadLeads(), 250)
    return () => clearTimeout(timer)
  }, [loadLeads])

  const openStages = pipeline?.byStage.filter((stage) => !["won", "lost"].includes(stage.stage)) || []

  return (
    <AppShell title="CRM">
      <div className="space-y-6">
        <PageHeader
          title="CRM"
          description="Accounts, pipeline and what needs attention today."
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Needs Attention"
            value={focus?.items.length ?? 0}
            icon={CalendarClock}
          />
          <KpiCard
            title="Open Cases"
            value={focus?.counters?.openCases ?? 0}
            icon={AlertTriangle}
          />
          <KpiCard
            title="Active Leads"
            value={focus?.counters?.activeLeads ?? 0}
            icon={Users}
          />
          <KpiCard
            title="Pipeline (weighted)"
            value={money(pipeline?.weightedValue ?? 0)}
            icon={TrendingUp}
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="focus">Today</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="lapsed">Going quiet</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="cases">Cases</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="focus" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What needs attention</CardTitle>
                <CardDescription>
                  Ranked across overdue follow-ups, open complaints, accounts going quiet and money owed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!focus?.items.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "Nothing needs attention. Enjoy it."}
                  </p>
                ) : (
                  focus.items.map((item, index) => {
                    const meta = REASON_META[item.reason]
                    const Icon = meta.icon

                    return (
                      <div
                        key={`${item.reason}-${index}`}
                        className="flex items-start gap-3 rounded-lg border p-3"
                      >
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.customerId ? (
                              <Link
                                href={`/crm/accounts/${item.customerId}`}
                                className="underline underline-offset-2"
                              >
                                {item.customer}
                              </Link>
                            ) : (
                              item.customer
                            )}
                            {item.customer ? " · " : ""}
                            {item.detail}
                          </p>
                        </div>
                        {item.value ? (
                          <span className="shrink-0 text-sm font-medium">{money(item.value)}</span>
                        ) : null}

                        {item.entityId && item.reason === "case_open" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            disabled={acting === `case-${item.entityId}`}
                            onClick={() =>
                              void act(
                                "resolveCase",
                                { caseId: item.entityId, resolution: "Resolved from CRM" },
                                `case-${item.entityId}`
                              )
                            }
                          >
                            Resolve
                          </Button>
                        ) : null}

                        {item.entityId && item.reason === "task_overdue" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            disabled={acting === `task-${item.entityId}`}
                            onClick={() =>
                              void act("completeTask", { taskId: item.entityId }, `task-${item.entityId}`)
                            }
                          >
                            Done
                          </Button>
                        ) : null}

                        {item.entityId && item.reason === "account_lapsing" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            disabled={acting === `lapse-${item.entityId}`}
                            onClick={() =>
                              void act(
                                "snoozeLapsed",
                                { customerId: item.entityId, days: 3 },
                                `lapse-${item.entityId}`
                              )
                            }
                          >
                            Chase
                          </Button>
                        ) : null}

                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {meta.label}
                        </Badge>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipeline" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {openStages.map((stage) => (
                <Card key={stage.stage}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm capitalize">{stage.stage}</CardTitle>
                    <CardDescription>
                      {stage.count} · {money(stage.value)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {stage.opportunities.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Empty</p>
                    ) : (
                      stage.opportunities.map((opportunity) => (
                        <div key={opportunity.id} className="rounded-md border p-2.5">
                          <p className="text-sm font-medium">{opportunity.name}</p>
                          <p className="text-xs text-muted-foreground">{opportunity.customer}</p>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="font-medium">{money(opportunity.value)}</span>
                            <span className="text-muted-foreground">{opportunity.probability}%</span>
                          </div>
                          <div className="mt-2 flex gap-1">
                            {nextStage(stage.stage) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 flex-1 px-2 text-[11px]"
                                disabled={acting === `opp-${opportunity.id}`}
                                onClick={() =>
                                  void act(
                                    "moveOpportunity",
                                    { opportunityId: opportunity.id, stage: nextStage(stage.stage) },
                                    `opp-${opportunity.id}`
                                  )
                                }
                              >
                                Advance
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px]"
                              disabled={acting === `opp-${opportunity.id}`}
                              onClick={() =>
                                void act(
                                  "moveOpportunity",
                                  { opportunityId: opportunity.id, stage: "won" },
                                  `opp-${opportunity.id}`
                                )
                              }
                            >
                              Won
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
              {openStages.length === 0 ? (
                <p className="py-8 text-sm text-muted-foreground">
                  {loading ? "Loading…" : "No open opportunities yet."}
                </p>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="lapsed" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Accounts going quiet</CardTitle>
                <CardDescription>
                  Measured against each account&apos;s own ordering rhythm, not a fixed cut-off.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {lapsed.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {loading
                      ? "Loading…"
                      : "No accounts are off their pattern. Needs at least 3 past orders per account to detect a rhythm."}
                  </p>
                ) : (
                  lapsed.map((account) => (
                    <div
                      key={account.customerId}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/crm/accounts/${account.customerId}`}
                          className="text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {account.customer}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Usually every {account.usualGapDays} days · silent {account.daysSinceLastOrder} days
                          {account.contact ? ` · ${account.contact}` : ""}
                          {account.phone ? ` · ${account.phone}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium">{money(account.monthlyValueAtRisk)}</p>
                          <p className="text-[10px] text-muted-foreground">per month at risk</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acting === `lapse-${account.customerId}`}
                          onClick={() =>
                            void act(
                              "snoozeLapsed",
                              { customerId: account.customerId, days: 3 },
                              `lapse-${account.customerId}`
                            )
                          }
                        >
                          Follow up
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Leads
                  {leadMeta.total ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {leadMeta.total.toLocaleString()} total
                    </span>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  Prospects before they are accounts. Converting one creates the customer and carries
                  the contact across.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                  <Input
                    value={leadSearch}
                    onChange={(event) => {
                      setLeadSearch(event.target.value)
                      setLeadPage(1)
                    }}
                    placeholder="Search name, contact, email, phone, suburb…"
                    className="h-8 flex-1 text-xs"
                  />
                  <select
                    value={leadStatus}
                    onChange={(event) => {
                      setLeadStatus(event.target.value)
                      setLeadPage(1)
                    }}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="all">All statuses</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                  </select>
                  {leadsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                </div>

                <div className="grid gap-2 border-b pb-3 sm:grid-cols-[1fr_1fr_140px_auto]">
                  <Input
                    value={newLead.businessName}
                    onChange={(event) =>
                      setNewLead((current) => ({ ...current, businessName: event.target.value }))
                    }
                    placeholder="Business name"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={newLead.contactName}
                    onChange={(event) =>
                      setNewLead((current) => ({ ...current, contactName: event.target.value }))
                    }
                    placeholder="Contact"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={newLead.phone}
                    onChange={(event) =>
                      setNewLead((current) => ({ ...current, phone: event.target.value }))
                    }
                    placeholder="Phone"
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={!newLead.businessName.trim() || acting === "new-lead"}
                    onClick={async () => {
                      await act("createLead", newLead, "new-lead")
                      setNewLead({ businessName: "", contactName: "", phone: "" })
                    }}
                  >
                    Add lead
                  </Button>
                </div>

                {!leads.length ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {loading || leadsLoading
                      ? "Loading…"
                      : leadSearch || leadStatus !== "all"
                        ? "No leads match that search."
                        : "No leads yet."}
                  </p>
                ) : (
                  leads.map((lead) => (
                    <div
                      key={lead.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{lead.businessName}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {lead.status}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {lead.source}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[lead.contactName, lead.phone, lead.suburb].filter(Boolean).join(" · ")}
                          {lead.estimatedValue ? ` · ~${money(lead.estimatedValue)}/mo` : ""}
                        </p>
                      </div>

                      {lead.status !== "converted" ? (
                        <div className="flex gap-1">
                          {lead.status === "new" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={acting === `lead-${lead.id}`}
                              onClick={() =>
                                void act(
                                  "updateLeadStatus",
                                  { leadId: lead.id, status: "contacted" },
                                  `lead-${lead.id}`
                                )
                              }
                            >
                              Contacted
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={acting === `lead-${lead.id}`}
                            onClick={() =>
                              void act("convertLead", { leadId: lead.id }, `lead-${lead.id}`)
                            }
                          >
                            Convert
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}

                {leadMeta.pageCount > 1 ? (
                  <div className="flex items-center justify-between gap-3 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      Page {leadPage} of {leadMeta.pageCount.toLocaleString()} ·{" "}
                      {leadMeta.total.toLocaleString()} leads
                    </p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        disabled={leadPage <= 1 || leadsLoading}
                        onClick={() => setLeadPage((current) => Math.max(current - 1, 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        disabled={leadPage >= leadMeta.pageCount || leadsLoading}
                        onClick={() =>
                          setLeadPage((current) => Math.min(current + 1, leadMeta.pageCount))
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cases" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Open cases</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {cases.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No open cases."}
                  </p>
                ) : (
                  cases.map((record) => (
                    <div key={record.id} className="flex items-start gap-3 rounded-lg border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {record.caseNumber}
                          </span>
                          <Badge
                            variant={record.severity === "high" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {record.severity}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {record.category}
                          </Badge>
                          {record.createdByAgent ? (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Bot className="h-2.5 w-2.5" />
                              agent
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm font-medium">{record.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.customer?.name}
                          {record.contact?.name ? ` · ${record.contact.name}` : ""}
                          {record.assignedTo?.name ? ` · ${record.assignedTo.name}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={acting === `case-${record.id}`}
                        onClick={() =>
                          void act(
                            "resolveCase",
                            { caseId: record.id, resolution: "Resolved from CRM" },
                            `case-${record.id}`
                          )
                        }
                      >
                        Resolve
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent activity</CardTitle>
                <CardDescription>Calls, visits, notes and messages across all accounts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {activities.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "Nothing logged yet."}
                  </p>
                ) : (
                  activities.map((activity) => (
                    <div key={activity.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {activity.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(activity.occurredAt).toLocaleString()}
                        </span>
                        {activity.createdByAgent ? (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Bot className="h-2.5 w-2.5" />
                            agent
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-medium">{activity.subject}</p>
                      {activity.body ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{activity.body}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activity.customer?.name}
                        {activity.contact?.name ? ` · ${activity.contact.name}` : ""}
                        {activity.user?.name ? ` · logged by ${activity.user.name}` : ""}
                      </p>
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
