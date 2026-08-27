"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Bot,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldOff,
  Target,
  TrendingUp,
  Users,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/types"

interface CampaignRow {
  id: string
  name: string
  type: string
  channel: string
  status: string
  sentAt: string | null
  createdByAgent: boolean
  audience: number
  sent: number
  suppressed: number
  converted: number
  conversionRate: number
  revenue: number
}

interface CampaignMember {
  id: string
  customer: string | null
  recipient: string
  subject: string | null
  message: string | null
  status: string
  suppressionReason: string | null
  convertedValue: number | null
}

interface CampaignDetail {
  id: string
  name: string
  type: string
  channel: string
  status: string
  brief: string | null
  createdByAgent: boolean
  members: CampaignMember[]
}

interface SegmentRow {
  id: string
  name: string
  description: string | null
  definitionJson: string
  updatedAt: string
}

interface ConsentRow {
  id: string
  address: string
  channel: string
  state: string
  source: string | null
  note: string | null
  changedAt: string
}

interface AudiencePreview {
  count: number
  members: Array<{
    customerId: string
    customer: string
    contact: string | null
    hasEmail: boolean
    daysSinceLastOrder: number | null
    orderCount: number
    totalSpend: number
    matchedOn: string[]
  }>
}

interface SendResult {
  ok?: boolean
  dryRun?: boolean
  sent?: number
  suppressed?: number
  failed?: number
  error?: string
}

/**
 * Prebuilt audiences that map to how a food manufacturer actually segments its
 * book: accounts that have gone quiet, accounts that never took a product line,
 * and accounts carrying debt. Each is a real SegmentDefinition, evaluated by
 * the same engine the agent uses.
 */
const AUDIENCE_PRESETS: Array<{
  label: string
  description: string
  definition: unknown
}> = [
  {
    label: "Gone quiet (30+ days)",
    description: "Ordered before, nothing in the last 30 days",
    definition: {
      all: [
        { kind: "metric", metric: "daysSinceLastOrder", op: "gte", value: 30 },
        { kind: "metric", metric: "orderCount", op: "gte", value: 1 },
      ],
    },
  },
  {
    label: "Never tried gluten free",
    description: "Active accounts with no gluten-free line in their history",
    definition: {
      all: [{ kind: "field", field: "status", op: "eq", value: "active" }],
      none: [{ kind: "product", mode: "bought", nameContains: "Gluten Free" }],
    },
  },
  {
    label: "Top accounts",
    description: "Lifetime spend over $10k",
    definition: {
      all: [{ kind: "metric", metric: "totalSpend", op: "gte", value: 10000 }],
    },
  },
  {
    label: "Carrying debt",
    description: "Has an overdue invoice — suppress from promos, use for collections",
    definition: {
      all: [{ kind: "flag", flag: "hasOverdueInvoice", value: true }],
    },
  },
]

function money(value: number) {
  // Follows the company's country rather than assuming a dollar sign.
  return formatCurrency(value)
}

const STATUS_TONE: Record<string, string> = {
  draft: "secondary",
  ready: "outline",
  approved: "outline",
  sending: "outline",
  sent: "default",
  cancelled: "secondary",
}

export default function MarketingPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState("campaigns")
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [segments, setSegments] = useState<SegmentRow[]>([])
  const [consent, setConsent] = useState<ConsentRow[]>([])

  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const [activePreset, setActivePreset] = useState<number | null>(null)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)

  const [draft, setDraft] = useState({ name: "", brief: "" })

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const views = ["campaigns", "segments", "consent"]
      const [campaignData, segmentData, consentData] = await Promise.all(
        views.map((view) => fetch(`/api/marketing?view=${view}`).then((response) => response.json()))
      )

      if (campaignData.success) setCampaigns(campaignData.data)
      if (segmentData.success) setSegments(segmentData.data)
      if (consentData.success) setConsent(consentData.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const act = useCallback(
    async (action: string, payload: Record<string, unknown>, key: string) => {
      setActing(key)

      try {
        const response = await fetch("/api/marketing/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        })

        const result = await response.json()

        if (!result.success) {
          toast({
            variant: "destructive",
            title: "Marketing action failed",
            description: result.error || "Request failed",
          })
          return null
        }

        toast({
          title: "Marketing updated",
          description: "Action executed successfully.",
        })
        return result.data
      } finally {
        setActing(null)
      }
    },
    []
  )

  const openCampaign = useCallback(async (campaignId: string) => {
    setSendResult(null)
    const response = await fetch(`/api/marketing?view=campaign&id=${campaignId}`)
    const result = await response.json()
    if (result.success) setDetail(result.data)
  }, [])

  const totals = campaigns.reduce(
    (sum, campaign) => ({
      audience: sum.audience + campaign.audience,
      sent: sum.sent + campaign.sent,
      converted: sum.converted + campaign.converted,
      revenue: sum.revenue + campaign.revenue,
    }),
    { audience: 0, sent: 0, converted: 0, revenue: 0 }
  )

  return (
    <AppShell title="Marketing">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
            <p className="text-sm text-muted-foreground">
              Audiences, campaigns and what they actually earned. Nothing sends without a human.
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{campaigns.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" />
                Messages sent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{totals.sent}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Conversions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{totals.converted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Attributed revenue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{money(totals.revenue)}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="segments">Audiences</TabsTrigger>
            <TabsTrigger value="consent">Suppressed</TabsTrigger>
          </TabsList>

          {/* ---------------- Campaigns ---------------- */}
          <TabsContent value="campaigns" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campaigns</CardTitle>
                <CardDescription>
                  Audience, delivery and attributed revenue. Attribution is conservative — first
                  order per recipient inside the window only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!campaigns.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No campaigns yet. Build one in the Build tab."}
                  </p>
                ) : (
                  campaigns.map((campaign) => (
                    <div key={campaign.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              className="text-sm font-medium underline-offset-2 hover:underline"
                              onClick={() => void openCampaign(campaign.id)}
                            >
                              {campaign.name}
                            </button>
                            <Badge
                              variant={
                                (STATUS_TONE[campaign.status] as "default" | "secondary" | "outline") ||
                                "outline"
                              }
                              className="text-[10px]"
                            >
                              {campaign.status}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {campaign.channel}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {campaign.type.replace(/_/g, " ")}
                            </Badge>
                            {campaign.createdByAgent ? (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <Bot className="h-2.5 w-2.5" />
                                agent
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {campaign.audience} in audience · {campaign.sent} sent ·{" "}
                            {campaign.suppressed} suppressed · {campaign.converted} converted (
                            {campaign.conversionRate}%)
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium">{money(campaign.revenue)}</p>
                            <p className="text-[10px] text-muted-foreground">attributed</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting === `attr-${campaign.id}`}
                            onClick={async () => {
                              await act("attribute", { campaignId: campaign.id }, `attr-${campaign.id}`)
                              await load()
                            }}
                          >
                            Re-attribute
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {detail ? (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{detail.name}</CardTitle>
                      <CardDescription>
                        {detail.brief || "No brief recorded."}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
                      Close
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting === `preview-${detail.id}`}
                      onClick={async () => {
                        const result = await act(
                          "previewSend",
                          { campaignId: detail.id },
                          `preview-${detail.id}`
                        )
                        if (result) setSendResult({ ...(result as SendResult), dryRun: true })
                      }}
                    >
                      Dry run
                    </Button>
                    <Button
                      size="sm"
                      disabled={acting === `send-${detail.id}` || detail.status === "sent"}
                      onClick={async () => {
                        const sendable = detail.members.filter(
                          (member) => member.status === "pending" && member.message
                        ).length

                        const confirmed = window.confirm(
                          `Send this campaign to ${sendable} recipient(s)?\n\n` +
                            `This contacts real customers. Consent is re-checked per recipient at dispatch.`
                        )
                        if (!confirmed) return

                        const result = await act(
                          "sendCampaign",
                          { campaignId: detail.id },
                          `send-${detail.id}`
                        )
                        if (result) {
                          setSendResult(result as SendResult)
                          await load()
                          await openCampaign(detail.id)
                        }
                      }}
                    >
                      <Send className="mr-2 h-3.5 w-3.5" />
                      Send
                    </Button>
                  </div>

                  {sendResult ? (
                    <div className="rounded-md border bg-muted/40 p-3 text-xs">
                      <p className="font-medium">
                        {sendResult.dryRun ? "Dry run — nothing was sent" : "Send complete"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {sendResult.sent ?? 0} sendable · {sendResult.suppressed ?? 0} suppressed ·{" "}
                        {sendResult.failed ?? 0} failed
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {detail.members.map((member) => (
                      <div key={member.id} className="rounded-md border p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{member.customer}</span>
                          <Badge
                            variant={member.status === "suppressed" ? "destructive" : "outline"}
                            className="text-[10px]"
                          >
                            {member.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{member.recipient}</span>
                        </div>

                        {member.suppressionReason ? (
                          <p className="mt-1 text-xs text-destructive">
                            Suppressed: {member.suppressionReason}
                          </p>
                        ) : null}

                        {member.subject ? (
                          <p className="mt-1 text-xs font-medium">{member.subject}</p>
                        ) : null}

                        {member.message ? (
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                            {member.message}
                          </p>
                        ) : member.status !== "suppressed" ? (
                          <p className="mt-1 text-xs italic text-amber-600">
                            No copy written yet — ask the agent to write this one, or it will be
                            skipped on send.
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          {/* ---------------- Build ---------------- */}
          <TabsContent value="build" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Build a campaign</CardTitle>
                <CardDescription>
                  Pick who it goes to and check the count before creating anything. Copy is written
                  per recipient afterwards, grounded in that account&apos;s own history.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {AUDIENCE_PRESETS.map((preset, index) => (
                    <button
                      key={preset.label}
                      onClick={async () => {
                        setActivePreset(index)
                        const result = await act(
                          "previewAudience",
                          { definition: preset.definition, limit: 50 },
                          `preset-${index}`
                        )
                        if (result) setPreview(result as AudiencePreview)
                      }}
                      className={`rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                        activePreset === index ? "border-primary bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Target className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-sm font-medium">{preset.label}</span>
                        {acting === `preset-${index}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
                    </button>
                  ))}
                </div>

                {preview ? (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <p className="text-sm font-medium">
                        {preview.count} account{preview.count === 1 ? "" : "s"} match
                      </p>
                    </div>

                    {preview.count === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nothing matches this audience yet.
                      </p>
                    ) : (
                      <>
                        <div className="max-h-56 space-y-1.5 overflow-y-auto">
                          {preview.members.map((member) => (
                            <div
                              key={member.customerId}
                              className="flex items-center justify-between gap-3 rounded-md border p-2 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-medium">{member.customer}</p>
                                <p className="text-muted-foreground">
                                  {member.matchedOn.join(" · ")}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="font-medium">{money(member.totalSpend)}</p>
                                {!member.hasEmail ? (
                                  <p className="text-[10px] text-amber-600">no email</p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_1fr_auto]">
                          <Input
                            value={draft.name}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="Campaign name"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={draft.brief}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, brief: event.target.value }))
                            }
                            placeholder="What is this trying to achieve?"
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            disabled={
                              !draft.name.trim() || activePreset === null || acting === "build"
                            }
                            onClick={async () => {
                              if (activePreset === null) return

                              const result = await act(
                                "buildCampaign",
                                {
                                  name: draft.name,
                                  brief: draft.brief,
                                  definition: AUDIENCE_PRESETS[activePreset].definition,
                                  channel: "email",
                                },
                                "build"
                              )

                              if (result) {
                                setDraft({ name: "", brief: "" })
                                setPreview(null)
                                setActivePreset(null)
                                setTab("campaigns")
                                await load()
                              }
                            }}
                          >
                            Create campaign
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Creating resolves recipients now and snapshots the audience, so a later
                          edit can&apos;t change who a past campaign went to. Nothing sends yet.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Pick an audience above to see exactly who it selects.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Segments ---------------- */}
          <TabsContent value="segments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Saved audiences</CardTitle>
                <CardDescription>
                  Stored as definitions, not name lists — re-evaluated every time they&apos;re used,
                  so membership is never stale.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!segments.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No saved audiences yet."}
                  </p>
                ) : (
                  segments.map((segment) => (
                    <div
                      key={segment.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{segment.name}</p>
                        {segment.description ? (
                          <p className="text-xs text-muted-foreground">{segment.description}</p>
                        ) : null}
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {segment.definitionJson.slice(0, 120)}
                          {segment.definitionJson.length > 120 ? "…" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acting === `seg-${segment.id}`}
                          onClick={async () => {
                            const result = await act(
                              "previewAudience",
                              { definition: JSON.parse(segment.definitionJson), limit: 50 },
                              `seg-${segment.id}`
                            )
                            if (result) {
                              setPreview(result as AudiencePreview)
                              setTab("build")
                            }
                          }}
                        >
                          Preview
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Consent ---------------- */}
          <TabsContent value="consent" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Suppressed addresses</CardTitle>
                <CardDescription>
                  Opt-outs, bounces and complaints. Checked on every send — an address here is never
                  contacted, whoever builds the campaign.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!consent.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "Nobody has opted out."}
                  </p>
                ) : (
                  consent.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <ShieldOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium">{record.address}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {record.channel}
                          </Badge>
                          <Badge variant="destructive" className="text-[10px]">
                            {record.state}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(record.changedAt).toLocaleDateString()}
                          {record.source ? ` · ${record.source}` : ""}
                          {record.note ? ` · ${record.note}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={acting === `consent-${record.id}`}
                        onClick={async () => {
                          await act(
                            "recordConsent",
                            {
                              address: record.address,
                              channel: record.channel,
                              state: "granted",
                              source: "manual re-opt-in",
                            },
                            `consent-${record.id}`
                          )
                          await load()
                        }}
                      >
                        Re-opt in
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
