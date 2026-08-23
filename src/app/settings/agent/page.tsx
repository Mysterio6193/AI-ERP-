"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Check,
  Copy,
  Cpu,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
  // Who the next link code is for. Defaults to the signed-in user; an admin
  // can issue one for anyone on the team.
  const [linkTarget, setLinkTarget] = useState("")
  const [staff, setStaff] = useState<Array<{ id: string; name: string; email: string; role: string }>>([])
  const [codeFor, setCodeFor] = useState<string | null>(null)
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

      // Admin-only; a non-admin simply gets no picker and links themselves.
      const staffResponse = await fetch("/api/users")
        .then((response) => response.json())
        .catch(() => ({ success: false }))

      if (staffResponse.success) {
        const list = (staffResponse.data ?? staffResponse.users ?? []) as Array<{
          id: string
          name: string
          email: string
          role: string
          status?: string
        }>
        setStaff(list.filter((entry) => (entry.status ?? "active") === "active"))
      }

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
        body: JSON.stringify({
          channel: "telegram",
          ...(linkTarget ? { userId: linkTarget } : {}),
        }),
      })

      const payload = await response.json()

      if (payload.success) {
        setCode(payload.data.code)
        setCodeFor(payload.data.forSelf ? null : (payload.data.forUser?.name ?? null))
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
    <AppShell title="Agent">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agent</h1>
            <p className="text-sm text-muted-foreground">
              Connect Telegram so staff can run the business from their phone.
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
            <CardDescription>
              How the agent presents itself. It never poses as a person - every outbound message
              carries this disclosure.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {identityDraft ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Name</label>
                    <Input
                      value={identityDraft.name}
                      onChange={(event) =>
                        setIdentityDraft((current) => current && { ...current, name: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Email</label>
                    <Input
                      value={identityDraft.email}
                      onChange={(event) =>
                        setIdentityDraft((current) => current && { ...current, email: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Phone (optional)</label>
                    <Input
                      value={identityDraft.phone || ""}
                      onChange={(event) =>
                        setIdentityDraft(
                          (current) => current && { ...current, phone: event.target.value || null }
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Signature</label>
                    <Input
                      value={identityDraft.signature}
                      onChange={(event) =>
                        setIdentityDraft(
                          (current) => current && { ...current, signature: event.target.value }
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Disclosure line</label>
                  <Textarea
                    value={identityDraft.disclosure}
                    onChange={(event) =>
                      setIdentityDraft(
                        (current) => current && { ...current, disclosure: event.target.value }
                      )
                    }
                    className="min-h-[50px] text-sm"
                  />
                </div>
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
                  Save
                </Button>
                <p className="text-xs text-muted-foreground">
                  Point an inbound-parsing provider (Postmark, Mailgun Routes, SendGrid Inbound Parse) at{" "}
                  <code className="font-mono">/api/agent/email</code> so mail sent to this address reaches
                  the agent.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4" />
              Model
            </CardTitle>
            <CardDescription>Which model the agent runs on, and where it runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {runtime ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={runtime.configured ? "secondary" : "destructive"}>
                      {runtime.configured ? "Ready" : "Not configured"}
                    </Badge>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Provider: {runtime.mode}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {runtime.baseUrl}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">💬 Operations / Chat Copilot</p>
                    <p className="mt-1 font-mono text-xs font-semibold">{runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground">AGENT_MODEL / AGENT_MODEL_CHAT</p>
                  </div>

                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">📱 Telegram Staff Bot</p>
                    <p className="mt-1 font-mono text-xs font-semibold">{runtime.telegramModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground">AGENT_MODEL_TELEGRAM</p>
                  </div>

                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">📦 Autonomous Replenishment</p>
                    <p className="mt-1 font-mono text-xs font-semibold">{runtime.replenishmentModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground">AGENT_MODEL_REPLENISHMENT</p>
                  </div>

                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">⚡ Fast Triage / Summaries</p>
                    <p className="mt-1 font-mono text-xs font-semibold">{runtime.fastModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground">AGENT_MODEL_FAST / AGENT_FAST_MODEL</p>
                  </div>

                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">✉️ Inbound Email & Leads</p>
                    <p className="mt-1 font-mono text-xs font-semibold">{runtime.emailModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground">AGENT_MODEL_EMAIL</p>
                  </div>

                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">📊 Finance & Ledger Analysis</p>
                    <p className="mt-1 font-mono text-xs font-semibold">{runtime.financeModel || runtime.model}</p>
                    <p className="text-[10px] text-muted-foreground">AGENT_MODEL_FINANCE</p>
                  </div>

                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">👁️ Vision OCR & Document Scanner</p>
                    <p className="mt-1 font-mono text-xs font-semibold">{runtime.ocrModel || "google/gemini-2.0-flash-001"}</p>
                    <p className="text-[10px] text-muted-foreground">AGENT_MODEL_OCR / AGENT_OCR_MODEL</p>
                  </div>

                  <div className="rounded-lg border p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">🎙️ Speech-to-Text & Voice Notes</p>
                    <p className="mt-1 font-mono text-xs font-semibold">{runtime.voiceModel || "openai/whisper-large-v3"}</p>
                    <p className="text-[10px] text-muted-foreground">AGENT_MODEL_VOICE / AGENT_VOICE_MODEL</p>
                  </div>
                </div>
              </>
            ) : null}
            {runtime && !runtime.configured ? (
              <p className="text-xs text-muted-foreground">
                Set <code className="font-mono">OPENROUTER_API_KEY</code> or <code className="font-mono">AI_GATEWAY_API_KEY</code> in <code>.env</code>.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <TelegramQrConnect onSuccess={load} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Try it</CardTitle>
            <CardDescription>
              The same ops persona, tools, thresholds and approval flow the bot uses — replies come
              back here instead of to Telegram, so you can see it work before a token exists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg bg-[#e7ebf0] p-3 dark:bg-muted">
              {!demoLog.length ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Try &ldquo;how are we tracking today?&rdquo; or &ldquo;who&apos;s overdue?&rdquo;
                </p>
              ) : (
                demoLog.map((entry, index) => (
                  <div key={index} className="space-y-1.5">
                    <div
                      className={
                        entry.from === "you"
                          ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#effdde] px-3 py-2 text-sm text-black dark:bg-emerald-900 dark:text-white"
                          : "w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-black dark:bg-background dark:text-foreground"
                      }
                    >
                      {entry.text}
                    </div>

                    {entry.approvals?.map((approval) => (
                      <div
                        key={approval.proposalId}
                        className="w-fit max-w-[85%] space-y-2 rounded-2xl bg-white p-3 dark:bg-background"
                      >
                        <p className="text-xs font-medium">{approval.summary}</p>
                        <p className="text-[11px] text-muted-foreground">{approval.reason}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-[11px]"
                            disabled={demoBusy}
                            onClick={() => void decideDemo(approval.proposalId, true)}
                          >
                            ✅ Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            disabled={demoBusy}
                            onClick={() => void decideDemo(approval.proposalId, false)}
                          >
                            ❌ Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
              {demoBusy ? (
                <p className="text-xs text-muted-foreground">typing…</p>
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
                placeholder="Message the bot…"
                className="max-h-24 min-h-[40px] resize-none text-sm"
              />
              <Button
                disabled={demoBusy || !demoInput.trim()}
                onClick={() => void sendDemo(demoInput)}
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connected accounts</CardTitle>
            <CardDescription>
              Who can talk to the agent on Telegram. Each inherits their own role and limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {/*
              There was no way to generate a link code anywhere in the app.
              `generateCode` existed and nothing called it, so the only people
              on Telegram were whoever had been linked before the UI lost the
              button — you could disconnect someone but never add anyone.
            */}
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              {staff.length > 1 ? (
                <div className="space-y-1.5">
                  <label htmlFor="link-target" className="text-xs font-medium text-muted-foreground">
                    Create a code for
                  </label>
                  <select
                    id="link-target"
                    value={linkTarget}
                    onChange={(event) => setLinkTarget(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Myself</option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <Button onClick={() => void generateCode()} disabled={busy} className="w-full">
                {busy ? "Creating…" : "Create link code"}
              </Button>

              {code ? (
                <div className="rounded-md bg-muted p-3 text-center">
                  <p className="font-mono text-xl font-semibold tracking-[0.2em]">{code}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {codeFor ? `${codeFor} sends ` : "Send "}
                    <span className="font-mono">/link {code}</span>
                    {codeFor ? " to the bot" : " to the bot"} within 15 minutes.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1"
                    onClick={() => {
                      void navigator.clipboard.writeText(`/link ${code}`)
                      setCopied(true)
                    }}
                  >
                    {copied ? "Copied" : "Copy command"}
                  </Button>
                </div>
              ) : null}
            </div>

            {!status?.connections.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "Nobody has linked their account yet."}
              </p>
            ) : (
              status.connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {connection.user?.name || connection.displayName || connection.chatId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {connection.user
                        ? `${connection.user.email} · ${connection.user.role}`
                        : connection.isCustomer
                          ? "customer"
                          : "unlinked"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void disconnect(connection.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
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
