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
  mode: "gateway" | "local"
  model: string
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
          <CardContent className="space-y-2">
            {runtime ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={runtime.configured ? "secondary" : "destructive"}>
                  {runtime.configured ? "Ready" : "Not configured"}
                </Badge>
                <span className="font-mono text-xs">{runtime.model}</span>
                <span className="text-xs text-muted-foreground">
                  {runtime.mode === "local" ? "running locally" : "via cloud gateway"}
                </span>
              </div>
            ) : null}
            {runtime && !runtime.configured ? (
              <p className="text-xs text-muted-foreground">
                Set <code className="font-mono">AI_GATEWAY_API_KEY</code> in <code>.env</code>, or run
                Ollama and set <code className="font-mono">AGENT_PROVIDER=local</code> to keep every
                request on this machine.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" />
              Telegram
            </CardTitle>
            <CardDescription>
              The bot is how staff talk to the agent away from a desk, and how approvals get answered.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!status?.configured ? (
              <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="space-y-2">
                  <p className="font-medium">No bot token yet</p>
                  <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                    <li>
                      Message <span className="font-mono">@BotFather</span> on Telegram and send{" "}
                      <span className="font-mono">/newbot</span>.
                    </li>
                    <li>
                      Put the token in <code className="font-mono">.env</code> as{" "}
                      <code className="font-mono">TELEGRAM_BOT_TOKEN</code>.
                    </li>
                    <li>
                      Add a <code className="font-mono">TELEGRAM_WEBHOOK_SECRET</code> of your choosing,
                      then restart the server.
                    </li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">Bot connected</Badge>
                  {status.hasWebhookSecret ? (
                    <Badge variant="outline" className="text-[10px]">
                      webhook secret set
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      no webhook secret
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Webhook</p>
                  {status.webhook?.url ? (
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {status.webhook.url}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Not registered. Telegram needs a public HTTPS URL — your deployed domain, or an
                      ngrok tunnel while developing.
                    </p>
                  )}
                  {status.webhook?.lastErrorMessage ? (
                    <p className="text-xs text-destructive">
                      Telegram reported: {status.webhook.lastErrorMessage}
                    </p>
                  ) : null}

                  <div className="flex gap-2">
                    <Input
                      value={webhookUrl}
                      onChange={(event) => setWebhookUrl(event.target.value)}
                      placeholder="https://your-domain.com"
                      className="font-mono text-xs"
                    />
                    <Button onClick={() => void registerWebhook()} disabled={busy || !webhookUrl}>
                      Register
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 border-t pt-5">
              <div>
                <p className="text-sm font-medium">Link your Telegram account</p>
                <p className="text-xs text-muted-foreground">
                  Generate a code, then send <span className="font-mono">/link YOURCODE</span> to the
                  bot. The code expires in 15 minutes.
                </p>
              </div>

              {code ? (
                <div className="flex items-center gap-2">
                  <code className="rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-widest">
                    {code}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      void navigator.clipboard.writeText(`/link ${code}`)
                      setCopied(true)
                    }}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              ) : null}

              <Button onClick={() => void generateCode()} disabled={busy} variant={code ? "outline" : "default"}>
                <Link2 className="mr-2 h-3.5 w-3.5" />
                {code ? "New code" : "Generate link code"}
              </Button>
            </div>

            {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>

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
