"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Blocks,
  Copy,
  ExternalLink,
  Globe,
  Key,
  RefreshCcw,
  Smartphone,
  Webhook,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
}

async function fetchPayload<T>(path: string): Promise<T | null> {
  const response = await fetch(path)
  const payload = await response.json()
  if (!payload.success) return null
  return payload.data ?? null
}

export default function IntegrationsPage() {
  const [copied, setCopied] = useState(false)
  const [commerce, setCommerce] = useState<CommerceSettings | null>(null)
  const [company, setCompany] = useState<CompanySettings | null>(null)
  const [integrations, setIntegrations] = useState<AccountingIntegrationRow[]>([])
  const [documents, setDocuments] = useState<FinanceDocumentRow[]>([])
  const [savingProvider, setSavingProvider] = useState<string | null>(null)
  const [connectionRefs, setConnectionRefs] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
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

    void load()
  }, [])

  const apiBaseUrl = typeof window === "undefined" ? "/api" : `${window.location.origin}/api`

  const integrationEndpoints = useMemo(
    () => [
      { label: "Orders", path: "/orders", description: "Internal admin sales orders and customer-channel orders" },
      { label: "Customers", path: "/customers", description: "Customer master data, locations, and credit settings" },
      { label: "Invoices", path: "/invoices", description: "Invoice and payment collection data" },
      { label: "Accounting Integrations", path: "/accounting/integrations", description: "Xero, bank feed, and accounting connector state" },
      { label: "Bank Transactions", path: "/accounting/bank-transactions", description: "Imported or live bank lines for reconciliation" },
      { label: "Finance Documents", path: "/accounting/documents", description: "Statement imports, supplier bills, receipts, and export jobs" },
    ],
    [apiBaseUrl]
  )

  const webhookTopics = [
    "order.created",
    "order.updated",
    "invoice.paid",
    "customer.created",
    "bank.transaction.imported",
    "reconciliation.completed",
  ]

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiBaseUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function saveIntegration(provider: string, status: string) {
    try {
      setSavingProvider(provider)
      await fetch("/api/accounting/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          status,
          connectionRef: connectionRefs[provider] || null,
          lastSyncAt: status === "connected" ? new Date().toISOString() : null,
        }),
      })

      const nextIntegrations = await fetchPayload<AccountingIntegrationRow[]>("/api/accounting/integrations")
      setIntegrations(nextIntegrations || [])
    } finally {
      setSavingProvider(null)
    }
  }

  return (
    <AppShell title="API & Integrations" breadcrumbs={[{ label: "Integrations" }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API & Integrations</h1>
          <p className="text-muted-foreground">
            Commerce, accounting, bank feed, and deployment integration controls for SupplySure OS.
          </p>
        </div>

        <Tabs defaultValue="api" className="space-y-6">
          <TabsList className="grid w-full max-w-3xl grid-cols-4">
            <TabsTrigger value="api"><Key className="mr-2 h-4 w-4" /> API</TabsTrigger>
            <TabsTrigger value="accounting"><RefreshCcw className="mr-2 h-4 w-4" /> Accounting</TabsTrigger>
            <TabsTrigger value="webhooks"><Webhook className="mr-2 h-4 w-4" /> Webhooks</TabsTrigger>
            <TabsTrigger value="channels"><Blocks className="mr-2 h-4 w-4" /> Channels</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Tenant API base</CardTitle>
                  <CardDescription>Use this base URL for internal, commerce, and finance integrations.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-800">
                    {apiBaseUrl}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopy}>
                      <Copy className="mr-2 h-4 w-4" />
                      {copied ? "Copied" : "Copy Base URL"}
                    </Button>
                    <Button variant="link" size="sm" asChild>
                      <a href={apiBaseUrl} target="_blank" rel="noopener noreferrer">
                        Open API <ExternalLink className="ml-2 h-3 w-3" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 text-slate-100">
                <CardHeader>
                  <CardTitle className="text-slate-100">Deployment references</CardTitle>
                  <CardDescription className="text-slate-400">Live values from company and commerce settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="text-slate-400">Company</p>
                    <p className="font-medium text-slate-100">{company?.name || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Website URL</p>
                    <p className="font-medium text-slate-100">{commerce?.websiteUrl || company?.website || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Mobile distribution</p>
                    <p className="font-medium text-slate-100">{commerce?.playStoreUrl || commerce?.appStoreUrl || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Support contact</p>
                    <p className="font-medium text-slate-100">{company?.email || "Not set"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Supported endpoints</CardTitle>
                <CardDescription>Core admin, commerce, and finance routes already live in this OS build.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {integrationEndpoints.map((endpoint) => (
                  <div key={endpoint.path} className="rounded-xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">{endpoint.label}</p>
                    <p className="mt-1 font-mono text-sm text-cyan-700">{apiBaseUrl}{endpoint.path}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{endpoint.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accounting" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Accounting connectors</CardTitle>
                  <CardDescription>Track Xero-style accounting syncs, bank feeds, and fallback manual connector states.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {integrations.map((integration) => (
                    <div key={integration.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{integration.displayName || integration.provider}</p>
                          <p className="text-xs text-muted-foreground">{integration.category}</p>
                        </div>
                        <Badge variant={integration.status === "connected" ? "default" : "outline"}>
                          {integration.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                        <Input
                          placeholder="Connection reference"
                          value={connectionRefs[integration.provider] || ""}
                          onChange={(event) =>
                            setConnectionRefs((current) => ({
                              ...current,
                              [integration.provider]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          variant="outline"
                          disabled={savingProvider === integration.provider}
                          onClick={() => void saveIntegration(integration.provider, "connected")}
                        >
                          Connect
                        </Button>
                        <Button
                          variant="outline"
                          disabled={savingProvider === integration.provider}
                          onClick={() => void saveIntegration(integration.provider, "needs_attention")}
                        >
                          Flag
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last sync: {integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString() : "Never"}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Import/export register</CardTitle>
                  <CardDescription>Recent finance documents created from bank imports or accounting exports.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {documents.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      No import/export jobs recorded yet.
                    </div>
                  ) : (
                    documents.slice(0, 8).map((document) => (
                      <div key={document.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium">{document.title}</p>
                            <p className="text-xs text-muted-foreground">{document.documentType.replace(/_/g, " ")} · {document.source}</p>
                          </div>
                          <Badge variant="outline">{document.status}</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Supported webhook topics</CardTitle>
                <CardDescription>Operational events ready to hand off to middleware or notification workers.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {webhookTopics.map((topic) => (
                  <div key={topic} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-sm font-medium text-slate-900">{topic}</p>
                      <Badge className="bg-emerald-100 text-emerald-700">Available</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Route this event into your accounting sync, commerce notifications, or back-office automation layer.
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="channels" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Customer website
                  </CardTitle>
                  <CardDescription>Web storefront connection state from OS commerce controls.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge className={commerce?.websiteEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>
                    {commerce?.websiteEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{commerce?.websiteUrl || company?.website || "No production website URL saved yet."}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Customer mobile app
                  </CardTitle>
                  <CardDescription>Mobile channel readiness based on OS commerce settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge className={commerce?.mobileAppEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>
                    {commerce?.mobileAppEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {commerce?.playStoreUrl || commerce?.appStoreUrl || "No App Store / Play Store links saved yet."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
