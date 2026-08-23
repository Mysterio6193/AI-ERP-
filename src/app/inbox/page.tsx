"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  ExternalLink,
  Globe,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Send,
  StickyNote,
  User,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"

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

const CHANNEL_COLORS: Record<string, string> = {
  email: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  telegram: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  whatsapp: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  web: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  note: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
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
    <AppShell title="Inbox" breadcrumbs={[{ label: "Inbox" }]}>
      <div className="space-y-6 pb-6">
        {/* Page Header */}
        <PageHeader
          title="Unified Inbox"
          description="Every customer conversation, inquiry, and communication across all channels."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          }
        />

        {/* Channel Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={filter === null ? "default" : "outline"}
            className="h-8 text-xs font-medium"
            onClick={() => setFilter(null)}
          >
            <InboxIcon className="mr-1.5 h-3.5 w-3.5" />
            All Channels
            {conversations.length > 0 && filter === null && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                {conversations.length}
              </Badge>
            )}
          </Button>
          {channels.map((channel) => {
            const Icon = CHANNEL_ICON[channel] || MessageSquare
            const isActive = filter === channel

            return (
              <Button
                key={channel}
                size="sm"
                variant={isActive ? "default" : "outline"}
                className="h-8 text-xs font-medium capitalize"
                onClick={() => setFilter(channel)}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5" />
                {channel}
              </Button>
            )
          })}
        </div>

        {/* Split Screen Mailbox */}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* Conversation List */}
          <Card className="flex flex-col border-border shadow-sm max-h-[calc(100vh-16rem)]">
            <CardHeader className="p-4 pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">Conversations</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {conversations.length} {conversations.length === 1 ? "thread" : "threads"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {!conversations.length ? (
                loading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
                    <p className="text-sm">Loading conversations...</p>
                  </div>
                ) : (
                  <EmptyState
                    icon={InboxIcon}
                    title="No conversations"
                    description={
                      filter
                        ? `No ${filter} messages found in this view.`
                        : "No customer conversations recorded yet."
                    }
                    className="min-h-[260px] border-none bg-transparent"
                  />
                )
              ) : (
                conversations.map((conversation) => {
                  const Icon = CHANNEL_ICON[conversation.channel] || InboxIcon
                  const active = selected?.id === conversation.id

                  return (
                    <button
                      key={`${conversation.kind}-${conversation.id}`}
                      onClick={() => void open(conversation)}
                      className={`w-full text-left rounded-xl p-3.5 border transition-all ${
                        active
                          ? "bg-primary/10 border-primary/40 shadow-xs"
                          : "border-border/60 bg-card hover:bg-muted/40 hover:border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                              CHANNEL_COLORS[conversation.channel] || "bg-muted text-muted-foreground border-border"
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                          </span>
                          <span className="truncate text-sm font-semibold text-foreground">
                            {conversation.title}
                          </span>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-[10px] h-5 px-1.5 font-medium">
                          {conversation.messageCount}
                        </Badge>
                      </div>

                      {conversation.preview ? (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                          {conversation.preview}
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="capitalize font-medium">
                          {conversation.channel}
                          {conversation.subtitle ? ` • ${conversation.subtitle}` : ""}
                        </span>
                        <span>
                          {conversation.lastAt
                            ? new Date(conversation.lastAt).toLocaleDateString("en-AU", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* Conversation Detail Pane */}
          <Card className="flex flex-col border-border shadow-sm max-h-[calc(100vh-16rem)] min-h-[500px]">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <EmptyState
                  icon={MessageSquare}
                  title="Select a conversation"
                  description="Choose a thread from the list on the left to read messages and customer details."
                  className="border-none bg-transparent"
                />
              </div>
            ) : (
              <>
                <CardHeader className="p-4 border-b border-border">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                        {selected.title}
                      </CardTitle>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`capitalize text-[11px] ${
                            CHANNEL_COLORS[selected.channel] || "bg-muted text-muted-foreground border-border"
                          }`}
                        >
                          {selected.channel}
                        </Badge>
                        {selected.subtitle && (
                          <span className="text-xs text-muted-foreground">{selected.subtitle}</span>
                        )}
                        {detail?.customer && (
                          <Link
                            href={`/crm/accounts/${detail.customer.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <User className="h-3 w-3" />
                            Open {detail.customer.name}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-5 space-y-4">
                  {loadingDetail ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
                      <p className="text-sm">Loading message history...</p>
                    </div>
                  ) : !detail?.messages.length ? (
                    <div className="py-20 text-center text-sm text-muted-foreground">
                      No messages found in this conversation.
                    </div>
                  ) : (
                    detail.messages.map((message) => {
                      const isUser = message.role === "user"

                      return (
                        <div
                          key={message.id}
                          className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`max-w-[82%] rounded-2xl p-4 text-sm shadow-xs ${
                              isUser
                                ? "rounded-tr-xs bg-primary text-primary-foreground"
                                : "rounded-tl-xs bg-muted/60 text-foreground border border-border/70"
                            }`}
                          >
                            {message.subject && message.subject !== message.content && (
                              <p className={`mb-1.5 text-xs font-semibold ${isUser ? "text-primary-foreground/90" : "text-foreground"}`}>
                                {message.subject}
                              </p>
                            )}
                            <div className="whitespace-pre-wrap leading-relaxed">
                              {message.content}
                            </div>
                            <div
                              className={`mt-2 flex items-center justify-end gap-1 text-[10px] ${
                                isUser ? "text-primary-foreground/75" : "text-muted-foreground"
                              }`}
                            >
                              <span>{new Date(message.at).toLocaleString()}</span>
                              {message.status && <span>• {message.status}</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })
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
