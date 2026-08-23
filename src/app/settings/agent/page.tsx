"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Textarea } from "@/components/ui/textarea"
import { TelegramQrConnect } from "@/components/integrations/telegram-qr-connect"

interface Connection {
  id: string
  chatId: string
  displayName: string | null
  verifiedAt: string | null
  user: { name: string; email: string; role: string } | null
  isCustomer: boolean
}

interface TelegramStatus {
  configured: boolean
  hasWebhookSecret: boolean
  webhook: {
    url: string | null
    pendingUpdateCount: number
    lastErrorMessage: string | null
  } | null
  pendingLinks: number
  connections: Connection[]
}

interface AgentIdentity {
  name: string
  email: string
  phone: string | null
  signature: string
  disclosure: string
}

interface RuntimeInfo {
  mode: "gateway" | "local" | "openrouter"
  model: string
  fastModel?: string
  telegramModel?: string
  ocrModel?: string
  voiceModel?: string
  replenishmentModel?: string
  emailModel?: string
  financeModel?: string
  baseUrl: string
  configured: boolean
}

export default function AgentSettingsPage() {
  const [identity, setIdentity] = useState<AgentIdentity | null>(null)
  const [identityDraft, setIdentityDraft] = useState<AgentIdentity | null>(null)
  const [savingIdentity, setSavingIdentity] = useState(false)
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Demo chat: the real Telegram path, without Telegram.
  const [demoInput, setDemoInput] = useState("")
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoLog, setDemoLog] = useState<
    Array<{
      from: "you" | "bot"
      text: string
      approvals?: Array<{ proposalId: string; summary: string; reason: string }>
    }>
  >([])

  async function sendDemo(text: string) {
    const trimmed = text.trim()
    if (!trimmed || demoBusy) {
      return
    }

    setDemoInput("")
    setDemoLog((current) => [...current, { from: "you", text: trimmed }])
    setDemoBusy(true)

    try {
      const response = await fetch("/api/agent/telegram/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })

      const payload = await response.json()

      setDemoLog((current) => [
        ...current,
        payload.success
          ? {
              from: "bot",
              text: payload.data.text || "Done.",
              approvals: payload.data.pendingApprovals,
            }
          : { from: "bot", text: payload.error },
      ])
    } finally {
      setDemoBusy(false)
    }
  }

  async function decideDemo(proposalId: string, approved: boolean) {
    setDemoBusy(true)

    try {
      const response = await fetch("/api/agent/telegram/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: { proposalId, approved } }),
      })

      const payload = await response.json()

      setDemoLog((current) => [
        ...current,
        {
          from: "bot",
          text: payload.success
            ? payload.data.text || (approved ? "Done." : "Cancelled.")
            : payload.error,
        },
      ])
    } finally {
      setDemoBusy(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const [statusResponse, runtimeResponse, identityResponse] = await Promise.all([
        fetch("/api/agent/telegram/setup").then((response) => response.json()),
        fetch("/api/agent/chat").then((response) => response.json()),
        fetch("/api/agent/identity").then((response) => response.json()),
      ])

      if (statusResponse.success) {
        setStatus(statusResponse.data)
      }
      if (runtimeResponse.success) {
        setRuntime(runtimeResponse.data.runtime)
      }
      if (identityResponse.success) {
        setIdentity(identityResponse.data.identity)
        setIdentityDraft(identityResponse.data.identity)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    if (typeof window !== "undefined") {
      setWebhookUrl(window.location.origin.startsWith("https") ? window.location.origin : "")
    }
  }, [load])

  async function generateCode() {
    setBusy(true)
    setMessage(null)

    try {
      const response = await fetch("/api/agent/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "telegram" }),
      })

      const payload = await response.json()

      if (payload.success) {
        setCode(payload.data.code)
        setCopied(false)
      } else {
        setMessage(payload.error)
      }
    } finally {
      setBusy(false)
    }
  }

  async function registerWebhook() {
    setBusy(true)
    setMessage(null)

    try {
      const response = await fetch("/api/agent/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      })

      const payload = await response.json()
      setMessage(payload.success ? "Webhook registered." : payload.error)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function disconnect(id: string) {
    await fetch(`/api/agent/link?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    await load()
  }

  return (
    <AppShell title="Agent" breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Agent Identity & Channels" }]}>
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Agent Identity & Mobile Channels"
          description="Configure the outbound assistant persona, multi-model runtime, and mobile Telegram integration."
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

        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Identity & Disclosures</CardTitle>
            <CardDescription className="text-xs">
              How the assistant identifies itself across email, customer portals, and Telegram. Outbound messages always append this disclosure.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {identityDraft ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Assistant Name</label>
                    <Input
                      value={identityDraft.name}
                      onChange={(event) =>
                        setIdentityDraft((current) => current && { ...current, name: event.target.value })
                      }
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Inbound / Outbound Email</label>
                    <Input
                      value={identityDraft.email}
                      onChange={(event) =>
                        setIdentityDraft((current) => current && { ...current, email: event.target.value })
                      }
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Phone Number (Optional)</label>
                    <Input
                      value={identityDraft.phone || ""}
                      onChange={(event) =>
                        setIdentityDraft(
                          (current) => current && { ...current, phone: event.target.value || null }
                        )
                      }
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Email Signature</label>
                    <Input
                      value={identityDraft.signature}
                      onChange={(event) =>
                        setIdentityDraft(
                          (current) => current && { ...current, signature: event.target.value }
                        )
                      }
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Mandatory AI Disclosure Line</label>
                  <Textarea
                    value={identityDraft.disclosure}
                    onChange={(event) =>
                      setIdentityDraft(
                        (current) => current && { ...current, disclosure: event.target.value }
                      )
                    }
                    className="min-h-[50px] text-xs"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Button
                    size="sm"
                    disabled={savingIdentity || JSON.stringify(identity) === JSON.stringify(identityDraft)}
                    onClick={async () => {
                      setSavingIdentity(true)
                      try {
                        const response = await fetch("/api/agent/identity", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(identityDraft),
                        })
                        const payload = await response.json()
                        if (payload.success) {
                          setIdentity(payload.data)
                          setIdentityDraft(payload.data)
                        }
                      } finally {
                        setSavingIdentity(false)
                      }
                    }}
                  >
                    {savingIdentity ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Save Identity
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Direct inbound parsing webhooks to <code className="font-mono bg-muted px-1.5 py-0.5 rounded">/api/agent/email</code>.
                  </p>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Model Runtime Card */}
        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cpu className="h-4 w-4 text-primary" />
                  Model Runtime Architecture
                </CardTitle>
                <CardDescription className="text-xs">
                  Domain-specialized model routing across chat, vision, voice, replenishment, and finance.
                </CardDescription>
              </div>
              {runtime ? (
                <Badge variant={runtime.configured ? "default" : "destructive"} className="text-xs">
                  {runtime.configured ? "Configured & Ready" : "Missing API Key"}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {runtime ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Provider:</span>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {runtime.mode}
                    </Badge>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {runtime.baseUrl}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      💬 Operations / Chat Copilot
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-primary">{runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">AGENT_MODEL / AGENT_MODEL_CHAT</p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      📱 Telegram Staff Bot
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-primary">{runtime.telegramModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">AGENT_MODEL_TELEGRAM</p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      📦 Autonomous Replenishment
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-primary">{runtime.replenishmentModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">AGENT_MODEL_REPLENISHMENT</p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      ⚡ Fast Triage / Summaries
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-primary">{runtime.fastModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">AGENT_MODEL_FAST / AGENT_FAST_MODEL</p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      ✉️ Inbound Email & Leads
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-primary">{runtime.emailModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">AGENT_MODEL_EMAIL</p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      📊 Finance & Ledger Analysis
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-primary">{runtime.financeModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">AGENT_MODEL_FINANCE</p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      👁️ Vision OCR & Document Scanner
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-primary">{runtime.ocrModel || "google/gemini-2.0-flash-001"}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">AGENT_MODEL_OCR / AGENT_OCR_MODEL</p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      🎙️ Speech-to-Text & Voice Notes
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-primary">{runtime.voiceModel || "openai/whisper-large-v3"}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">AGENT_MODEL_VOICE / AGENT_VOICE_MODEL</p>
                  </div>
                </div>
              </>
            ) : null}
            {runtime && !runtime.configured ? (
              <p className="text-xs text-muted-foreground">
                Set <code className="font-mono bg-muted px-1.5 py-0.5 rounded">OPENROUTER_API_KEY</code> or <code className="font-mono bg-muted px-1.5 py-0.5 rounded">AI_GATEWAY_API_KEY</code> in <code>.env</code>.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Telegram QR Connect */}
        <TelegramQrConnect onSuccess={load} />

        {/* Interactive Simulator Card */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Interactive Bot Simulator</CardTitle>
            <CardDescription className="text-xs">
              Live testing sandbox using the exact ops persona, tools, thresholds, and proposal approval loop as mobile Telegram.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-80 space-y-2.5 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4">
              {!demoLog.length ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Try asking &ldquo;What orders need dispatch today?&rdquo; or &ldquo;Check stock on sourdough bases&rdquo;
                </p>
              ) : (
                demoLog.map((entry, index) => (
                  <div key={index} className="space-y-2">
                    <div
                      className={
                        entry.from === "you"
                          ? "ml-auto w-fit max-w-[80%] rounded-xl bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow-sm"
                          : "w-fit max-w-[85%] whitespace-pre-wrap rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs text-foreground shadow-sm"
                      }
                    >
                      {entry.text}
                    </div>

                    {entry.approvals?.map((approval) => (
                      <div
                        key={approval.proposalId}
                        className="w-fit max-w-[85%] space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm"
                      >
                        <p className="text-xs font-semibold text-foreground">{approval.summary}</p>
                        <p className="text-[11px] text-muted-foreground">{approval.reason}</p>
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={demoBusy}
                            onClick={() => void decideDemo(approval.proposalId, true)}
                          >
                            <Check className="mr-1 h-3 w-3" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={demoBusy}
                            onClick={() => void decideDemo(approval.proposalId, false)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
              {demoBusy ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Assistant is thinking…</span>
                </div>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Textarea
                value={demoInput}
                onChange={(event) => setDemoInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void sendDemo(demoInput)
                  }
                }}
                rows={1}
                placeholder="Message the assistant…"
                className="max-h-24 min-h-[40px] resize-none text-xs"
              />
              <Button
                disabled={demoBusy || !demoInput.trim()}
                onClick={() => void sendDemo(demoInput)}
                size="sm"
                className="h-10 px-3"
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 text-xs"
                onClick={async () => {
                  await fetch("/api/agent/telegram/demo", { method: "DELETE" })
                  setDemoLog([])
                }}
              >
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Connected Accounts Card */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base">Linked Telegram Staff Accounts</CardTitle>
            <CardDescription className="text-xs">
              Staff members authenticated via Telegram QR pairing. Each user inherits their ERP role permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!status?.connections.length ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {loading ? "Loading connections…" : "No Telegram accounts linked yet. Use QR connect above."}
              </p>
            ) : (
              status.connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-emerald-500" />
                      <p className="text-xs font-semibold text-foreground">
                        {connection.user?.name || connection.displayName || connection.chatId}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {connection.user
                        ? `${connection.user.email} · Role: ${connection.user.role}`
                        : connection.isCustomer
                          ? "Customer portal account"
                          : "Unlinked staff connection"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => void disconnect(connection.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

