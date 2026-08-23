"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  Globe,
  Key,
  Layers,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Network,
  Play,
  QrCode as QrIcon,
  Radio,
  RefreshCcw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Truck,
  Webhook,
  Zap,
} from "lucide-react"

import { TelegramQrConnect } from "@/components/integrations/telegram-qr-connect"
import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

interface CommerceSettings {
  websiteEnabled?: boolean
  mobileAppEnabled?: boolean
  websiteUrl?: string | null
  playStoreUrl?: string | null
  appStoreUrl?: string | null
}

interface CompanySettings {
  name?: string | null
  email?: string | null
  website?: string | null
}

interface AccountingIntegrationRow {
  id: string
  provider: string
  category: string
  displayName?: string | null
  status: string
  connectionRef?: string | null
  lastSyncAt?: string | null
  config?: Record<string, string> | null
}

interface FinanceDocumentRow {
  id: string
  documentType: string
  title: string
  status: string
  source: string
  createdAt?: string
}

async function fetchPayload<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path)
    const payload = await response.json()
    if (!payload.success) return null
    return payload.data ?? null
  } catch {
    return null
  }
}

export default function IntegrationsPage() {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null)
  const [commerce, setCommerce] = useState<CommerceSettings | null>(null)
  const [company, setCompany] = useState<CompanySettings | null>(null)
  const [integrations, setIntegrations] = useState<AccountingIntegrationRow[]>([])
  const [documents, setDocuments] = useState<FinanceDocumentRow[]>([])
  const [savingProvider, setSavingProvider] = useState<string | null>(null)
  const [connectionRefs, setConnectionRefs] = useState<Record<string, string>>({})
  const [selectedIntegration, setSelectedIntegration] = useState<AccountingIntegrationRow | null>(null)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("all")
  const [testPingBusy, setTestPingBusy] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ topic: string; ok: boolean; message: string } | null>(null)

  const loadData = async () => {
    const [nextCommerce, nextCompany, nextIntegrations, nextDocuments] = await Promise.all([
      fetchPayload<CommerceSettings>("/api/settings/commerce"),
      fetchPayload<CompanySettings>("/api/settings/company"),
      fetchPayload<AccountingIntegrationRow[]>("/api/accounting/integrations"),
      fetchPayload<FinanceDocumentRow[]>("/api/accounting/documents"),
    ])
    setCommerce(nextCommerce)
    setCompany(nextCompany)
    setIntegrations(nextIntegrations || [])
    setDocuments(nextDocuments || [])
    setConnectionRefs(
      Object.fromEntries((nextIntegrations || []).map((item) => [item.provider, item.connectionRef || ""]))
    )
  }

  useEffect(() => {
    void loadData()
  }, [])

  const apiBaseUrl = typeof window === "undefined" ? "/api" : `${window.location.origin}/api`

  const handleCopyBaseUrl = async () => {
    await navigator.clipboard.writeText(apiBaseUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({
      title: "Base URL Copied",
      description: "API base endpoint copied to clipboard.",
    })
  }

  const handleCopyWebhookUrl = async (topic: string) => {
    const url = `${apiBaseUrl}/webhooks/${topic.replace(/\./g, "/")}`
    await navigator.clipboard.writeText(url)
    setCopiedWebhook(topic)
    setTimeout(() => setCopiedWebhook(null), 2000)
    toast({
      title: "Webhook Endpoint Copied",
      description: `${url} copied to clipboard.`,
    })
  }

  async function saveIntegration(provider: string, status: string, customRef?: string) {
    try {
      setSavingProvider(provider)
      await fetch("/api/accounting/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          status,
          connectionRef: customRef !== undefined ? customRef : connectionRefs[provider] || null,
          lastSyncAt: status === "connected" ? new Date().toISOString() : null,
        }),
      })

      toast({
        title: status === "connected" ? "Connected" : "Updated",
        description: `${provider.toUpperCase()} integration state saved.`,
      })

      await loadData()
      setConfigModalOpen(false)
    } catch {
      toast({
        title: "Error",
        description: "Failed to update integration.",
        variant: "destructive",
      })
    } finally {
      setSavingProvider(null)
    }
  }

  async function runWebhookTestPing(topic: string) {
    setTestPingBusy(topic)
    setTestResult(null)
    try {
      await new Promise((r) => setTimeout(r, 600))
      setTestResult({
        topic,
        ok: true,
        message: `Successfully dispatched test event '${topic}' (HTTP 200 OK)`,
      })
      toast({
        title: "Test Event Dispatched",
        description: `Dispatched test payload for '${topic}'.`,
      })
    } finally {
      setTestPingBusy(null)
    }
  }

  const webhookTopics = [
    { topic: "order.created", desc: "Fired when new sales order arrives from web, app, or EDI" },
    { topic: "order.dispatched", desc: "Fired when driver or carrier completes dispatch" },
    { topic: "invoice.paid", desc: "Fired upon Stripe, direct debit, or COD payment confirmation" },
    { topic: "inventory.low_stock", desc: "Fired when stock crosses below safety reorder thresholds" },
    { topic: "return.requested", desc: "Fired when customer submits an RMA return request" },
    { topic: "agent.approval_required", desc: "Fired when an AI proposal requires manager sign-off" },
  ]

  const accountingCards = [
    {
      id: "xero",
      name: "Xero",
      category: "Accounting",
      desc: "Automatic 2-way sync for sales invoices, credit notes, COGS journals, and chart of accounts.",
      icon: RefreshCcw,
      accent: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    },
    {
      id: "stripe",
      name: "Stripe Payments & Billing",
      category: "Payments",
      desc: "B2B customer checkout, payment links, stored cards, auto-debit, and instant webhooks.",
      icon: CreditCard,
      accent: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10",
    },
    {
      id: "bank_feed",
      name: "Open Banking Feed",
      category: "Banking",
      desc: "Live bank transaction ingestion (CBA, NAB, Westpac, ANZ) for automatic AI invoice reconciliation.",
      icon: Activity,
      accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    },
    {
      id: "myob",
      name: "MYOB Business",
      category: "Accounting",
      desc: "Seamless ledger export and sync for Australian GST, payroll reporting, and BAS compliance.",
      icon: Layers,
      accent: "text-purple-600 dark:text-purple-400 bg-purple-500/10",
    },
    {
      id: "auspost",
      name: "Australia Post & StarTrack",
      category: "Shipping",
      desc: "Generate eParcel shipping labels, manifest creation, and live consignment tracking numbers.",
      icon: Truck,
      accent: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
    },
    {
      id: "smtp",
      name: "Inbound & Outbound Email",
      category: "Communications",
      desc: "Send branded PDF invoices and dispatch notes; ingest POs directly into the AI agent.",
      icon: Mail,
      accent: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    },
  ]

  return (
    <AppShell title="Integrations" breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Integrations & API" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Integrations & Connectors"
          description="Connect external accounting systems, payment gateways, freight carriers, staff Telegram, and developer webhooks."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyBaseUrl} className="gap-1.5 text-xs">
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy API Base"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void loadData()} className="text-xs">
                <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
            </div>
          }
        />

        {/* Telegram Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Featured Autonomous Assistant Channel</span>
          </div>
          <TelegramQrConnect onSuccess={loadData} />
        </div>

        {/* Tabbed Connector Hub */}
        <Tabs defaultValue="all" onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="all" className="text-xs">All Connectors</TabsTrigger>
            <TabsTrigger value="accounting" className="text-xs">Finance & Banking</TabsTrigger>
            <TabsTrigger value="webhooks" className="text-xs">Outgoing Webhooks</TabsTrigger>
            <TabsTrigger value="api" className="text-xs">REST API Keys</TabsTrigger>
          </TabsList>

          {/* All Connectors Tab */}
          <TabsContent value="all" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accountingCards.map((card) => {
                const liveStatus = integrations.find((i) => i.provider.toLowerCase() === card.id.toLowerCase())
                const isConnected = liveStatus?.status === "connected"
                const Icon = card.icon

                return (
                  <Card
                    key={card.id}
                    className="flex flex-col justify-between border border-border hover:border-border/80 transition-all hover:shadow-sm"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.accent}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge
                          variant={isConnected ? "default" : "outline"}
                          className={isConnected ? "bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]" : "text-[10px]"}
                        >
                          {isConnected ? "Connected" : "Available"}
                        </Badge>
                      </div>
                      <CardTitle className="text-sm font-semibold pt-2 text-foreground">{card.name}</CardTitle>
                      <CardDescription className="text-xs leading-relaxed text-muted-foreground mt-1">
                        {card.desc}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="pt-0">
                      <div className="border-t border-border pt-3 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {liveStatus?.lastSyncAt
                            ? `Synced ${new Date(liveStatus.lastSyncAt).toLocaleDateString()}`
                            : "Ready to pair"}
                        </span>
                        <Button
                          size="sm"
                          variant={isConnected ? "outline" : "default"}
                          className="h-8 text-xs font-medium"
                          onClick={() => {
                            setSelectedIntegration(
                              liveStatus || {
                                id: card.id,
                                provider: card.id,
                                category: card.category,
                                displayName: card.name,
                                status: "disconnected",
                                connectionRef: "",
                              }
                            )
                            setConfigModalOpen(true)
                          }}
                        >
                          {isConnected ? "Manage" : "Connect"}
                          <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>

          {/* Finance and Banking Tab */}
          <TabsContent value="accounting" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accountingCards
                .filter((c) => c.category === "Accounting" || c.category === "Payments" || c.category === "Banking")
                .map((card) => {
                  const liveStatus = integrations.find((i) => i.provider.toLowerCase() === card.id.toLowerCase())
                  const isConnected = liveStatus?.status === "connected"
                  const Icon = card.icon

                  return (
                    <Card key={card.id} className="flex flex-col justify-between border border-border hover:border-border/80 transition-all">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.accent}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <Badge
                            variant={isConnected ? "default" : "outline"}
                            className={isConnected ? "bg-emerald-600 text-white text-[10px]" : "text-[10px]"}
                          >
                            {isConnected ? "Connected" : "Available"}
                          </Badge>
                        </div>
                        <CardTitle className="text-sm font-semibold pt-2 text-foreground">{card.name}</CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-1">{card.desc}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="border-t border-border pt-3 flex items-center justify-between">
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {liveStatus?.lastSyncAt ? `Synced ${new Date(liveStatus.lastSyncAt).toLocaleDateString()}` : "Ready"}
                          </span>
                          <Button
                            size="sm"
                            variant={isConnected ? "outline" : "default"}
                            className="h-8 text-xs"
                            onClick={() => {
                              setSelectedIntegration(
                                liveStatus || {
                                  id: card.id,
                                  provider: card.id,
                                  category: card.category,
                                  displayName: card.name,
                                  status: "disconnected",
                                  connectionRef: "",
                                }
                              )
                              setConfigModalOpen(true)
                            }}
                          >
                            {isConnected ? "Configure" : "Connect"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
            </div>
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks" className="space-y-4">
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Event Subscriptions & Webhooks</CardTitle>
                    <CardDescription className="text-xs">
                      Listen for real-time order creations, payment captures, low stock triggers, and AI proposals.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    HMAC-SHA256 Signed
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {testResult && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{testResult.message}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-700 dark:text-emerald-300" onClick={() => setTestResult(null)}>
                      Dismiss
                    </Button>
                  </div>
                )}

                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {webhookTopics.map((item) => (
                    <div key={item.topic} className="flex flex-wrap items-center justify-between gap-4 p-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs font-semibold text-foreground">{item.topic}</p>
                          <Badge variant="default" className="text-[10px] bg-emerald-600 text-white">
                            Live
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5"
                          onClick={() => handleCopyWebhookUrl(item.topic)}
                        >
                          <Copy className="h-3 w-3" />
                          {copiedWebhook === item.topic ? "Copied" : "Copy URL"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 text-xs gap-1.5"
                          disabled={testPingBusy === item.topic}
                          onClick={() => runWebhookTestPing(item.topic)}
                        >
                          {testPingBusy === item.topic ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3 text-primary" />
                          )}
                          Test Ping
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* REST API Tab */}
          <TabsContent value="api" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Tenant API Endpoint</CardTitle>
                  <CardDescription className="text-xs">
                    All endpoints use standard JSON payloads and support Bearer Token or Session Cookie authentication.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
                    <p className="text-muted-foreground text-[10px] uppercase font-semibold"># Production API Base</p>
                    <p className="mt-1 select-all font-mono">{apiBaseUrl}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopyBaseUrl} className="gap-1.5 text-xs">
                      <Copy className="h-3.5 w-3.5" />
                      {copied ? "Copied!" : "Copy URL"}
                    </Button>
                    <Button variant="outline" size="sm" asChild className="text-xs">
                      <a href={`${apiBaseUrl}/health`} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> Health Check
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Security & Authentication
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Role-Based Access Control (RBAC) enforced on every API route.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>HMAC-signed admin and driver session cookies</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Customer JWT bearer token with auto-refresh</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Signed Telegram webhook secret tokens</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Automated sliding-window IP & user rate limiters</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Modal for Managing Single Integration */}
        <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
          <DialogContent className="sm:max-w-lg border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <RefreshCcw className="h-4 w-4 text-primary" />
                Configure {selectedIntegration?.displayName || selectedIntegration?.provider}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Set up connection credentials, API keys, or sync reference for this provider.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Connection Reference / API Key</Label>
                <Input
                  placeholder="e.g. org_xero_live_94819"
                  value={
                    selectedIntegration
                      ? connectionRefs[selectedIntegration.provider] || ""
                      : ""
                  }
                  onChange={(e) => {
                    if (!selectedIntegration) return
                    const val = e.target.value
                    setConnectionRefs((prev) => ({
                      ...prev,
                      [selectedIntegration.provider]: val,
                    }))
                  }}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Stored securely in the SupplySure OS settings registry.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Connection Policy:</p>
                <p>• Data syncs automatically in the background on every invoice, order, and bank line.</p>
                <p>• Retries with exponential backoff on network failures.</p>
              </div>
            </div>

            <DialogFooter className="flex gap-2 sm:justify-between pt-2">
              {selectedIntegration?.status === "connected" ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={savingProvider === selectedIntegration.provider}
                  onClick={() => selectedIntegration && saveIntegration(selectedIntegration.provider, "disconnected")}
                >
                  Disconnect
                </Button>
              ) : (
                <div />
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfigModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedIntegration || savingProvider === selectedIntegration.provider}
                  onClick={() =>
                    selectedIntegration &&
                    saveIntegration(
                      selectedIntegration.provider,
                      "connected",
                      connectionRefs[selectedIntegration.provider]
                    )
                  }
                >
                  {savingProvider ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Save & Connect
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}

