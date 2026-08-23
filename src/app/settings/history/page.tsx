"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, MessagesSquare, RefreshCw, Search, Sparkles } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { useToast } from "@/hooks/use-toast"

interface Hit {
  threadId: string
  channel: string
  persona: string
  title: string | null
  summary: string | null
  lastMessageAt: string | null
  messageCount?: number
  excerpts: Array<{ role: string; content: string; at: string }>
  score: number
}

interface Transcript {
  thread: { title: string | null; summary: string | null; createdAt: string }
  messages: Array<{ role: string; content: string; createdAt: string }>
}

export default function HistoryPage() {
  const { toast } = useToast()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)

  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)

  const run = useCallback(async (term: string) => {
    setLoading(true)

    try {
      const url = term.trim()
        ? `/api/agent/history?q=${encodeURIComponent(term.trim())}`
        : "/api/agent/history"

      const result = await fetch(url).then((response) => response.json())
      if (result.success) setHits(result.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void run("")
  }, [run])

  useEffect(() => {
    const timer = setTimeout(() => void run(query), 300)
    return () => clearTimeout(timer)
  }, [query, run])

  return (
    <AppShell title="Agent History" breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "History" }]}>
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Conversation History & Auditing"
          description="Search conversation transcripts across staff Telegram, in-app copilots, customer portals, and autonomous email runs."
          actions={
            <Button variant="outline" size="sm" onClick={() => void run(query)} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          }
        />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transcripts by keywords, customer name, SKU, or invoice number…"
            className="pl-9 text-xs"
          />
        </div>

        {!hits.length ? (
          <Card className="border border-border">
            <CardContent className="py-12 text-center">
              <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">
                {query ? "No matching conversations found" : "No conversation history recorded yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {query
                  ? "Try searching for a customer name, order number, or product item."
                  : "Conversations across Telegram and the copilot will automatically appear here."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {hits.map((hit) => (
              <Card key={hit.threadId} className="border border-border">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm font-semibold text-foreground">
                        {hit.title || "Untitled Conversation"}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {hit.summary || (
                          <span className="italic text-muted-foreground">Not summarised yet</span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {hit.channel}
                      </Badge>
                      {!hit.summary ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={working === hit.threadId}
                          onClick={async () => {
                            setWorking(hit.threadId)

                            try {
                              const result = await fetch("/api/agent/history", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ threadId: hit.threadId }),
                              }).then((response) => response.json())

                              if (!result.success) {
                                toast({
                                  variant: "destructive",
                                  title: "Summarisation failed",
                                  description: result.error || "Failed to summarise thread",
                                })
                              } else {
                                toast({
                                  title: "Thread summarised",
                                  description: "Summary generated successfully.",
                                })
                              }
                              await run(query)
                            } finally {
                              setWorking(null)
                            }
                          }}
                        >
                          <Sparkles className="mr-1 h-3 w-3 text-primary" />
                          Summarise
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={async () => {
                          if (open === hit.threadId) {
                            setOpen(null)
                            return
                          }

                          setOpen(hit.threadId)
                          const result = await fetch(
                            `/api/agent/history?threadId=${hit.threadId}`
                          ).then((response) => response.json())
                          if (result.success) setTranscript(result.data)
                        }}
                      >
                        {open === hit.threadId ? "Hide" : "View"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2.5">
                  {hit.excerpts.map((excerpt, index) => (
                    <p key={index} className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {excerpt.role === "user" ? "Operator" : "Assistant"}:
                      </span>{" "}
                      {excerpt.content}
                    </p>
                  ))}

                  {hit.lastMessageAt ? (
                    <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                      {new Date(hit.lastMessageAt).toLocaleString()}
                      {hit.messageCount ? ` · ${hit.messageCount} messages` : ""}
                    </p>
                  ) : null}

                  {open === hit.threadId && transcript ? (
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 mt-2">
                      {transcript.messages.map((message, index) => (
                        <div key={index} className="space-y-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {message.role === "user" ? "Operator" : "Assistant"}
                          </p>
                          <p className="whitespace-pre-wrap text-xs text-foreground bg-card p-2 rounded border border-border/60">{message.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

