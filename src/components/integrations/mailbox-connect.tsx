"use client"

/**
 * Connect the mailbox invoices and statements are sent from.
 *
 * SMTP rather than OAuth, because it needs nothing registered with anyone: an
 * app password takes a minute to create and every mail provider still speaks
 * it. The settings are proven against the real server before they are saved, so
 * "connected" here means mail actually sends — not that a form was filled in.
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Check, Loader2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

interface StoredConfig {
  host: string
  port: number
  user: string
  secure: boolean
  fromName?: string
  fromEmail?: string
}

/** The settings people actually need, so nobody has to look them up. */
const PRESETS = [
  { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 587 },
  { label: "Outlook / Microsoft 365", host: "smtp.office365.com", port: 587 },
  { label: "Fastmail", host: "smtp.fastmail.com", port: 465 },
]

export function MailboxConnect() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [config, setConfig] = useState<StoredConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [host, setHost] = useState("")
  const [port, setPort] = useState("587")
  const [user, setUser] = useState("")
  const [password, setPassword] = useState("")
  const [fromName, setFromName] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetch("/api/integrations/smtp").then((response) => response.json())
      if (result.success) {
        setConnected(result.data.connected)
        setConfig(result.data.config)
        if (result.data.config) {
          setHost(result.data.config.host)
          setPort(String(result.data.config.port))
          setUser(result.data.config.user)
          setFromName(result.data.config.fromName ?? "")
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(async () => {
    setBusy(true)
    setError(null)

    try {
      const result = await fetch("/api/integrations/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: Number(port), user, password, fromName }),
      }).then((response) => response.json())

      if (result.success) {
        toast({ title: "Mailbox connected", description: `Verified against the server as ${result.data.account}.` })
        setPassword("")
        await load()
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }, [host, port, user, password, fromName, load, toast])

  const disconnect = useCallback(async () => {
    setBusy(true)
    try {
      const result = await fetch("/api/integrations/smtp", { method: "DELETE" }).then((r) => r.json())
      if (result.success) {
        toast({ title: "Mailbox disconnected", description: result.data.note })
        setConnected(false)
        setConfig(null)
      }
    } finally {
      setBusy(false)
    }
  }, [load, toast])

  return (
    <Card className={connected ? "border-emerald-300 dark:border-emerald-800" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Mail className="h-4 w-4" />
          Sending mailbox
          {connected ? (
            <span className="flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              <Check className="h-3 w-3" />
              Verified
            </span>
          ) : null}
        </CardTitle>
        <CardDescription className="text-xs">
          Where invoices, statements and order confirmations are sent from. Nothing to register — most
          providers need an app password rather than your normal one.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking…
          </div>
        ) : (
          <>
            {connected && config ? (
              <p className="text-muted-foreground">
                Sending as <span className="font-medium text-foreground">{config.fromEmail ?? config.user}</span> via{" "}
                {config.host}
              </p>
            ) : null}

            {error ? (
              <p className="flex items-start gap-1.5 rounded border border-rose-300 bg-rose-50 p-2 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.host}
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    setHost(preset.host)
                    setPort(String(preset.port))
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-[11px]">Mail server</Label>
                <Input className="h-8 text-xs" placeholder="smtp.gmail.com" value={host} onChange={(e) => setHost(e.target.value)} />
              </div>
              <div>
                <Label className="text-[11px]">Port</Label>
                <Input className="h-8 text-xs" placeholder="587" value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
              <div>
                <Label className="text-[11px]">Username</Label>
                <Input className="h-8 text-xs" placeholder="orders@yourcompany.com.au" value={user} onChange={(e) => setUser(e.target.value)} />
              </div>
              <div>
                <Label className="text-[11px]">App password</Label>
                <Input
                  className="h-8 text-xs"
                  type="password"
                  placeholder={connected ? "Enter again to change" : "app password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-[11px]">Sender name (optional)</Label>
                <Input className="h-8 text-xs" placeholder="RDM Pizza" value={fromName} onChange={(e) => setFromName(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" disabled={busy || !host || !user || !password} onClick={() => void save()}>
                {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                {connected ? "Test and update" : "Test and connect"}
              </Button>
              {connected ? (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={busy} onClick={() => void disconnect()}>
                  Disconnect
                </Button>
              ) : null}
            </div>

            <p className="text-muted-foreground">
              Nothing is saved until it connects and signs in successfully — so if this says connected,
              mail sends.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
