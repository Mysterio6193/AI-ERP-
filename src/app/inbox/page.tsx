"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Globe,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Send,
  StickyNote,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface Conversation {
  id: string
  kind: "thread" | "comms"
  channel: string
  title: string
  subtitle: string | null
  preview: string | null
  lastAt: string | null
  messageCount: number
  customerId: string | null
  persona: string | null
}

interface Detail {
  id: string
  kind: string
  channel: string
  customer: { id: string; name: string } | null
  messages: Array<{
    id: string
    role: string
    content: string | null
    subject?: string | null
    status?: string
    at: string
  }>
}

const CHANNEL_ICON: Record<string, typeof Mail> = {
  email: Mail,
  telegram: Send,
  whatsapp: MessageCircle,
  web: Globe,
  note: StickyNote,
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [channels, setChannels] = useState<string[]>([])
  const [filter, setFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetch(`/api/inbox${filter ? `?channel=${filter}` : ""}`)
      const payload = await response.json()

      if (payload.success) {
        setConversations(payload.data.conversations)
        setChannels(payload.data.channels)
      }
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const open = useCallback(async (conversation: Conversation) => {
    setSelected(conversation)
    setLoadingDetail(true)
    setDetail(null)

    try {
      const response = await fetch(
        `/api/inbox?id=${encodeURIComponent(conversation.id)}&kind=${conversation.kind}`
      )
      const payload = await response.json()

      if (payload.success) {
        setDetail(payload.data)
      }
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  return (
    <AppShell title="Inbox">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
            <p className="text-sm text-muted-foreground">
              Every conversation, whichever door it came through.
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

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filter === null ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setFilter(null)}
          >
            All
          </Button>
          {channels.map((channel) => (
            <Button
              key={channel}
              size="sm"
              variant={filter === channel ? "default" : "outline"}
              className="h-7 text-xs capitalize"
              onClick={() => setFilter(channel)}
            >
              {channel}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="max-h-[70vh] overflow-y-auto">
            <CardContent className="space-y-1 p-2">
              {!conversations.length ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {loading ? "Loading…" : "No conversations yet."}
                </p>
              ) : (
                conversations.map((conversation) => {
                  const Icon = CHANNEL_ICON[conversation.channel] || InboxIcon
                  const active = selected?.id === conversation.id

                  return (
                    <button
                      key={`${conversation.kind}-${conversation.id}`}
                      onClick={() => void open(conversation)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        active ? "border-primary bg-accent" : "hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {conversation.title}
                        </span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {conversation.messageCount}
                        </Badge>
                      </div>
                      {conversation.preview ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {conversation.preview}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {conversation.channel}
                        {conversation.subtitle ? ` · ${conversation.subtitle}` : ""}
                        {conversation.lastAt
                          ? ` · ${new Date(conversation.lastAt).toLocaleString()}`
                          : ""}
                      </p>
                    </button>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card className="flex max-h-[70vh] flex-col">
            {!selected ? (
              <CardContent className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
                Pick a conversation to read it.
              </CardContent>
            ) : (
              <>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{selected.title}</CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {selected.channel}
                    </Badge>
                    {detail?.customer ? (
                      <Link
                        href={`/crm/accounts/${detail.customer.id}`}
                        className="text-xs underline underline-offset-2"
                      >
                        Open account
                      </Link>
                    ) : null}
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                  {loadingDetail ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : !detail?.messages.length ? (
                    <p className="text-sm text-muted-foreground">Nothing in this conversation.</p>
                  ) : (
                    detail.messages.map((message) => (
                      <div
                        key={message.id}
                        className={
                          message.role === "user"
                            ? "ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                            : "w-fit max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm"
                        }
                      >
                        {message.subject && message.subject !== message.content ? (
                          <p className="mb-1 text-xs font-medium opacity-80">{message.subject}</p>
                        ) : null}
                        {message.content}
                        <p className="mt-1 text-[10px] opacity-60">
                          {new Date(message.at).toLocaleString()}
                          {message.status ? ` · ${message.status}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
