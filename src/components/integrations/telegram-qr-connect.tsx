"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  QrCode as QrIcon,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QrCode } from "@/components/ui/qr-code"
import { useToast } from "@/hooks/use-toast"

interface Identity {
  id: string
  channel: string
  displayName: string | null
  verifiedAt: string | null
}

interface TelegramSetupData {
  configured: boolean
  bot: {
    id: number
    username: string | null
    firstName: string
  } | null
  webhook: {
    url: string | null
    pendingUpdateCount: number
    lastErrorMessage: string | null
  } | null
  connections: Array<{
    id: string
    chatId: string
    displayName: string | null
    verifiedAt: string | null
    user: { name: string; email: string; role: string } | null
  }>
}

interface TelegramQrConnectProps {
  onSuccess?: () => void
  compact?: boolean
}

export function TelegramQrConnect({ onSuccess, compact = false }: TelegramQrConnectProps) {
  const { toast } = useToast()
  const [setup, setSetup] = useState<TelegramSetupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCode, setActiveCode] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const [copied, setCopied] = useState(false)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/telegram/setup")
      const payload = await response.json()
      if (payload.success) {
        setSetup(payload.data)
      }
    } catch (err) {
      console.error("Failed to load Telegram status:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  const generateNewLinkCode = useCallback(async () => {
    try {
      setGenerating(true)
      const response = await fetch("/api/agent/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "telegram" }),
      })
      const payload = await response.json()
      if (payload.success && payload.data?.code) {
        setActiveCode(payload.data.code)
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to generate pairing code",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }, [toast])

  // Initial load
  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  // Start pairing session when modal opens
  useEffect(() => {
    if (modalOpen && !activeCode) {
      void generateNewLinkCode()
    }
  }, [modalOpen, activeCode, generateNewLinkCode])

  // Active polling when waiting for QR scan
  useEffect(() => {
    if (!modalOpen || !activeCode) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      return
    }

    const checkLinkStatus = async () => {
      try {
        const response = await fetch("/api/agent/link")
        const payload = await response.json()
        if (payload.success && payload.data?.identities?.length) {
          const matched = payload.data.identities.some(
            (i: Identity) => i.channel === "telegram"
          )
          if (matched) {
            setJustConnected(true)
            toast({
              title: "🎉 Telegram Connected!",
              description: "Your account is now linked. You can start chatting with SupplySure OS on Telegram.",
            })
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            await loadStatus()
            if (onSuccess) onSuccess()
            setTimeout(() => {
              setModalOpen(false)
              setJustConnected(false)
              setActiveCode(null)
            }, 2500)
          }
        }
      } catch {
        // silent polling catch
      }
    }

    pollTimerRef.current = setInterval(checkLinkStatus, 2000)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [modalOpen, activeCode, loadStatus, onSuccess, toast])

  const botUsername = setup?.bot?.username || "SupplySureOSBot"
  const qrDeepLink = activeCode
    ? `https://t.me/${botUsername}?start=connect_${activeCode}`
    : `https://t.me/${botUsername}`

  const handleCopyLink = async () => {
    if (!qrDeepLink) return
    await navigator.clipboard.writeText(qrDeepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({
      title: "Copied Link",
      description: "Direct Telegram pairing link copied to clipboard.",
    })
  }

  const handleDisconnect = async (identityId: string) => {
    try {
      setDisconnectingId(identityId)
      const res = await fetch(`/api/agent/link?id=${encodeURIComponent(identityId)}`, {
        method: "DELETE",
      })
      const payload = await res.json()
      if (payload.success) {
        toast({
          title: "Disconnected",
          description: "Telegram account unlinked successfully.",
        })
        await loadStatus()
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to disconnect Telegram identity.",
        variant: "destructive",
      })
    } finally {
      setDisconnectingId(null)
    }
  }

  const isConnected = (setup?.connections?.length || 0) > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading Telegram connection...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-sky-100 bg-gradient-to-br from-sky-50/50 via-white to-indigo-50/30">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-md shadow-sky-500/20">
                <Send className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-bold">Telegram Autonomous Agent</CardTitle>
                  <Badge
                    className={
                      isConnected
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                        : setup?.configured
                        ? "bg-sky-500 hover:bg-sky-600 text-white"
                        : "bg-slate-200 text-slate-700"
                    }
                  >
                    {isConnected ? "Connected & Active" : setup?.configured ? "Bot Online" : "Configuration Needed"}
                  </Badge>
                </div>
                <CardDescription className="text-sm text-slate-600">
                  Manage inventory, query stock, approve purchase orders, and receive real-time business briefs directly on Telegram.
                </CardDescription>
              </div>
            </div>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
              <DialogTrigger asChild>
                <Button className="bg-sky-600 hover:bg-sky-700 text-white shadow-sm gap-2">
                  <QrIcon className="h-4 w-4" />
                  {isConnected ? "Connect Another Device" : "Scan QR to Connect"}
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                    <Send className="h-5 w-5 text-sky-500" />
                    Instant Telegram Connect
                  </DialogTitle>
                  <DialogDescription>
                    Scan this QR code with your phone camera or tap the button to connect in one tap.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-4 space-y-4 text-center">
                  {justConnected ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-3 animate-in zoom-in-95">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="h-10 w-10" />
                      </div>
                      <p className="text-xl font-bold text-slate-900">Connected Successfully!</p>
                      <p className="text-sm text-slate-500 max-w-xs">
                        Your Telegram is now paired with SupplySure OS. You can now chat with the bot anytime.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="relative group">
                        <QrCode
                          value={qrDeepLink}
                          size={220}
                          alt="Telegram Pairing QR Code"
                          className="transition-transform group-hover:scale-[1.02]"
                        />
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono bg-slate-100 px-3 py-1.5 rounded-full">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                        </span>
                        Waiting for QR scan ({activeCode || "..."})
                      </div>

                      <div className="w-full space-y-2 pt-2">
                        <Button
                          className="w-full bg-sky-500 hover:bg-sky-600 text-white font-medium gap-2 shadow-sm"
                          asChild
                        >
                          <a href={qrDeepLink} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" /> Open Directly in Telegram
                          </a>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-slate-600 gap-2"
                          onClick={handleCopyLink}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copied ? "Copied Link!" : "Copy Direct Link"}
                        </Button>
                      </div>

                      <div className="pt-2 text-xs text-slate-400">
                        Bot handle: <span className="font-semibold text-slate-700">@{botUsername}</span> · Code expires in 15 mins
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {setup?.bot && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/80 p-3.5 border border-slate-200/70 text-sm">
              <div className="flex items-center gap-2.5">
                <Bot className="h-4 w-4 text-sky-500" />
                <span className="text-slate-600">Active Bot:</span>
                <span className="font-semibold text-slate-900">@{setup.bot.username || setup.bot.firstName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-slate-50 font-mono">
                  ID: {setup.bot.id}
                </Badge>
                {setup.webhook?.url && (
                  <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50">
                    Webhook Live
                  </Badge>
                )}
              </div>
            </div>
          )}

          {isConnected ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Connected Telegram Accounts ({setup?.connections.length})
              </p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {setup?.connections.map((conn) => (
                  <div key={conn.id} className="flex items-center justify-between p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-600 font-semibold text-sm">
                        {conn.displayName ? conn.displayName.slice(0, 2).toUpperCase() : "TG"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900 text-sm">{conn.displayName || "Telegram User"}</p>
                          <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                            {conn.user?.role || "Staff"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {conn.user?.email ? `${conn.user.name} (${conn.user.email})` : `Chat ID: ${conn.chatId}`}
                          {conn.verifiedAt && ` · Linked ${new Date(conn.verifiedAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                      disabled={disconnectingId === conn.id}
                      onClick={() => handleDisconnect(conn.id)}
                    >
                      {disconnectingId === conn.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-dashed border-sky-200 bg-sky-50/40 p-4">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-sky-500" />
                <div className="text-sm">
                  <p className="font-medium text-slate-900">No devices connected yet</p>
                  <p className="text-xs text-slate-500">Scan the QR code to pair your Telegram in under 3 seconds.</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-sky-300 text-sky-700 hover:bg-sky-100" onClick={() => setModalOpen(true)}>
                <QrIcon className="h-3.5 w-3.5 mr-1.5" /> Scan QR
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
