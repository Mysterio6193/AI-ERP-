"use client"

/**
 * Subscribe to the operations calendar from any calendar app.
 *
 * The alternative to OAuth, and for a read-only schedule it is the better one:
 * no application to register with Google or Microsoft, no consent screen, no
 * token for us to hold, and it works identically in Google Calendar, Outlook,
 * Apple Calendar and anything else made this century.
 *
 * The URL is the credential, so the page says so plainly rather than treating
 * it as an ordinary link.
 */

import { useCallback, useEffect, useState } from "react"
import { CalendarPlus, Check, Copy, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

export function CalendarFeed() {
  const { toast } = useToast()
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetch("/api/calendar/subscribe").then((response) => response.json())
      if (result.success) setUrl(result.data.url)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const generate = useCallback(async () => {
    setBusy(true)
    try {
      const result = await fetch("/api/calendar/subscribe", { method: "POST" }).then((r) => r.json())
      if (result.success) {
        setUrl(result.data.url)
        toast({ title: url ? "New link generated" : "Calendar link ready", description: result.data.note })
      }
    } finally {
      setBusy(false)
    }
  }, [toast, url])

  const copy = useCallback(async () => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [url])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarPlus className="h-4 w-4" />
          Subscribe from any calendar
        </CardTitle>
        <CardDescription className="text-xs">
          Deliveries and your follow-ups, in Google Calendar, Outlook or Apple Calendar. Nothing to
          register and nothing to sign in to — paste this link into your calendar app.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking…
          </div>
        ) : url ? (
          <>
            <div className="flex gap-2">
              <code className="flex-1 truncate rounded border bg-muted/40 px-2 py-1.5 font-mono text-[11px]">
                {url}
              </code>
              <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => void copy()}>
                {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <p className="text-muted-foreground">
              Anyone with this link can see your schedule. Treat it like a password — generating a new
              one immediately stops the old link working.
            </p>

            <div>
              <p className="mb-1 font-medium">Where to paste it</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>· Google Calendar — Other calendars, then From URL</li>
                <li>· Outlook — Add calendar, then Subscribe from web</li>
                <li>· Apple Calendar — File, then New Calendar Subscription</li>
              </ul>
            </div>

            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={busy} onClick={() => void generate()}>
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              Generate a new link
            </Button>
          </>
        ) : (
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void generate()}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Create my calendar link
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
