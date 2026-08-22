"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, MessagesSquare, Search, Sparkles } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

  // Debounced so typing does not fire a query per character.
  useEffect(() => {
    const timer = setTimeout(() => void run(query), 300)
    return () => clearTimeout(timer)
  }, [query, run])

  return (
    <AppShell title="History">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">
            Everything the agent has discussed. Search it the way you would search your messages.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What did we decide about Bidfood pricing?"
              className="h-9 pl-8 text-sm"
            />
          </div>
          {loading ? <Loader2 className="mt-2 h-4 w-4 animate-spin" /> : null}
        </div>

        {!hits.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                {query ? "Nothing found" : "No conversations yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {query
                  ? "Try a distinctive word — a customer name, a product, an order number."
                  : "Conversations appear here once the agent has been used."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {hits.map((hit) => (
              <Card key={hit.threadId}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-sm">
                        {hit.title || "Untitled conversation"}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {hit.summary || (
                          <span className="italic">Not summarised yet</span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {hit.channel}
                      </Badge>
                      {!hit.summary ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
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
                          <Sparkles className="mr-1 h-3 w-3" />
                          Summarise
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
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
                        {open === hit.threadId ? "Hide" : "Open"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2">
                  {hit.excerpts.map((excerpt, index) => (
                    <p key={index} className="text-xs text-muted-foreground">
                      <span className="font-medium">
                        {excerpt.role === "user" ? "You" : "Agent"}:
                      </span>{" "}
                      {excerpt.content}
                    </p>
                  ))}

                  {hit.lastMessageAt ? (
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(hit.lastMessageAt).toLocaleString()}
                      {hit.messageCount ? ` · ${hit.messageCount} messages` : ""}
                    </p>
                  ) : null}

                  {open === hit.threadId && transcript ? (
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border p-3">
                      {transcript.messages.map((message, index) => (
                        <div key={index}>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {message.role === "user" ? "You" : "Agent"}
                          </p>
                          <p className="whitespace-pre-wrap text-xs">{message.content}</p>
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
