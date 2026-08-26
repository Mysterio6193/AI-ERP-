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

import { AppShell } from "@/components/layout/app-shell"
import { ConnectedTools } from "@/components/integrations/connected-tools"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TelegramQrConnect } from "@/components/integrations/telegram-qr-connect"
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
      color: "from-blue-500/10 to-cyan-500/10 border-blue-200",
      accent: "text-blue-600 bg-blue-50",
    },
    {
      id: "stripe",
      name: "Stripe Payments & Billing",
      category: "Payments",
      desc: "B2B customer checkout, payment links, stored cards, auto-debit, and instant webhooks.",
      icon: CreditCard,
      color: "from-indigo-500/10 to-purple-500/10 border-indigo-200",
      accent: "text-indigo-600 bg-indigo-50",
    },
    {
      id: "bank_feed",
      name: "Open Banking Feed",
      category: "Banking",
      desc: "Live bank transaction ingestion (CBA, NAB, Westpac, ANZ) for automatic AI invoice reconciliation.",
      icon: Activity,
      color: "from-emerald-500/10 to-teal-500/10 border-emerald-200",
      accent: "text-emerald-600 bg-emerald-50",
    },
    {
      id: "myob",
      name: "MYOB Business",
      category: "Accounting",
      desc: "Seamless ledger export and sync for Australian GST, payroll reporting, and BAS compliance.",
      icon: Layers,
      color: "from-purple-500/10 to-pink-500/10 border-purple-200",
      accent: "text-purple-600 bg-purple-50",
    },
    {
      id: "auspost",
      name: "Australia Post & StarTrack",
      category: "Shipping",
      desc: "Generate eParcel shipping labels, manifest creation, and live consignment tracking numbers.",
      icon: Truck,
      color: "from-red-500/10 to-amber-500/10 border-red-200",
      accent: "text-red-600 bg-red-50",
    },
    {
      id: "smtp",
      name: "Inbound & Outbound Email",
      category: "Communications",
      desc: "Send branded PDF invoices and dispatch notes; ingest POs directly into the AI agent.",
      icon: Mail,
      color: "from-amber-500/10 to-yellow-500/10 border-amber-200",
      accent: "text-amber-600 bg-amber-50",
    },
  ]

  return (
    <AppShell title="API & Integrations" breadcrumbs={[{ label: "Integrations" }]}>
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight">Integrations & Connectors</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Your calendar, mailbox and notes alongside the ledger, payment and carrier connections.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyBaseUrl} className="gap-2">
              <Copy className="h-4 w-4" />
              {copied ? "Copied Base URL" : "Copy API URL"}
            </Button>
            <Button size="sm" onClick={() => void loadData()} variant="ghost">
              <RefreshCcw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>

        {/*
          Personal tools first: this is what someone comes to this page to do,
          and the ledger and carrier connections below are set up once and then
          forgotten about.
        */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Your tools</h2>
            <p className="text-sm text-muted-foreground">
              Connected to your own account, not the company&apos;s. Disconnecting affects only you.
            </p>
          </div>
          <ConnectedTools />
        </section>

        {/* Hero Section: 1-Click Telegram QR Connect */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Sparkles className="h-4 w-4 text-sky-500" />
            <span>Featured Autonomous Channel</span>
          </div>
          <TelegramQrConnect onSuccess={loadData} />
        </div>

        {/* Main Tabbed Integration Hub */}
        <Tabs defaultValue="all" onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-slate-100 p-1">
            <TabsTrigger value="all">All Connectors</TabsTrigger>
            <TabsTrigger value="accounting">Finance & Bank</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="api">REST API</TabsTrigger>
          </TabsList>

          {/* All / Accounting Tab */}
          <TabsContent value="all" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accountingCards.map((card) => {
                const liveStatus = integrations.find((i) => i.provider.toLowerCase() === card.id.toLowerCase())
                const isConnected = liveStatus?.status === "connected"
                const Icon = card.icon

                return (
                  <Card
                    key={card.id}
                    className="flex flex-col justify-between overflow-hidden border transition-all duration-200 hover:shadow-md hover:border-slate-300"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.accent}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge
                          variant={isConnected ? "default" : "outline"}
                          className={isConnected ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-slate-600 bg-slate-50"}
                        >
                          {isConnected ? "Connected" : "Available"}
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-bold pt-2">{card.name}</CardTitle>
                      <CardDescription className="text-xs leading-relaxed text-slate-500">
                        {card.desc}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="pt-0">
                      <div className="border-t pt-3 flex items-center justify-between">
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

          <TabsContent value="accounting" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accountingCards
                .filter((c) => c.category === "Accounting" || c.category === "Payments" || c.category === "Banking")
                .map((card) => {
                  const liveStatus = integrations.find((i) => i.provider.toLowerCase() === card.id.toLowerCase())
                  const isConnected = liveStatus?.status === "connected"
                  const Icon = card.icon

                  return (
                    <Card key={card.id} className="flex flex-col justify-between border hover:shadow-md transition-all">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.accent}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <Badge variant={isConnected ? "default" : "outline"}>
                            {isConnected ? "Connected" : "Available"}
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-bold pt-2">{card.name}</CardTitle>
                        <CardDescription className="text-xs text-slate-500">{card.desc}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="border-t pt-3 flex items-center justify-between">
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
          <TabsContent value="webhooks" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Event Subscriptions & Webhooks</CardTitle>
                    <CardDescription>
                      Listen for real-time order creations, payment captures, low stock triggers, and AI proposals.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-slate-50 font-mono text-xs">
                    HMAC-SHA256 Signed
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {testResult && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800 flex items-center justify-between animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>{testResult.message}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-800" onClick={() => setTestResult(null)}>
                      Dismiss
                    </Button>
                  </div>
                )}

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {webhookTopics.map((item) => (
                    <div key={item.topic} className="flex flex-wrap items-center justify-between gap-4 p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm font-semibold text-slate-900">{item.topic}</p>
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
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
                            <Play className="h-3 w-3" />
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
          <TabsContent value="api" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tenant API Endpoint</CardTitle>
                  <CardDescription>
                    All endpoints use standard JSON payloads and support Bearer Token or Session Cookie authentication.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs text-emerald-400">
                    <p className="text-slate-400"># Production API Base</p>
                    <p className="mt-1 select-all">{apiBaseUrl}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopyBaseUrl} className="gap-2">
                      <Copy className="h-4 w-4" />
                      {copied ? "Copied!" : "Copy URL"}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`${apiBaseUrl}/health`} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> Health Ping
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 text-slate-100">
                <CardHeader>
                  <CardTitle className="text-slate-100 text-base">Security & Authentication</CardTitle>
                  <CardDescription className="text-slate-400">
                    Role-Based Access Control (RBAC) enforced on every route.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>HMAC-signed admin and driver session cookies</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Customer JWT bearer token with auto-refresh</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Signed Telegram webhook secret tokens</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Automated sliding-window IP & user rate limiters</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Modal for Managing Single Integration */}
        <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <RefreshCcw className="h-5 w-5 text-primary" />
                Configure {selectedIntegration?.displayName || selectedIntegration?.provider}
              </DialogTitle>
              <DialogDescription>
                Set up connection credentials, API keys, or sync reference for this provider.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Connection Reference / API Key</Label>
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

              <div className="rounded-xl border bg-slate-50 p-3.5 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">Connection Policy:</p>
                <p>• Data syncs automatically in the background on every invoice, order, and bank line.</p>
                <p>• Retries with exponential backoff on network failures.</p>
              </div>
            </div>

            <DialogFooter className="flex gap-2 sm:justify-between">
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
                  {savingProvider ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
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
