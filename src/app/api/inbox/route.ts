import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { sendCommunicationMessage } from "@/lib/communications"

/**
 * The inbox.
 *
 * Conversations arrive through several doors - the in-app chat, Telegram,
 * WhatsApp, email - and previously each was only visible in its own table.
 * This merges them into one list so nobody has to remember which channel a
 * customer used, and so a reply can go back out the way it came in.
 *
 * Two sources: AgentThread (anything the agent held a conversation on) and
 * CommunicationLog (one-way traffic like sent invoices and inbound email).
 */

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
  direction: string | null
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts"])
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const channel = searchParams.get("channel")
  const conversationId = searchParams.get("id")
  const kind = searchParams.get("kind")

  // ---- Detail ------------------------------------------------------------
  if (conversationId && kind === "thread") {
    const thread = await db.agentThread.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        channel: true,
        threadKey: true,
        persona: true,
        customerId: true,
        userId: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
          select: {
            id: true,
            role: true,
            content: true,
            toolName: true,
            createdAt: true,
          },
        },
      },
    })

    if (!thread) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
    }

    const customer = thread.customerId
      ? await db.customer.findUnique({
          where: { id: thread.customerId },
          select: { id: true, name: true },
        })
      : null

    return NextResponse.json({
      success: true,
      data: {
        id: thread.id,
        kind: "thread",
        channel: thread.channel,
        threadKey: thread.threadKey,
        persona: thread.persona,
        customer,
        // Tool traffic is noise in a transcript; the run log keeps the detail.
        messages: thread.messages
          .filter((message) => message.content && ["user", "assistant"].includes(message.role))
          .map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            at: message.createdAt,
          })),
      },
    })
  }

  if (conversationId && kind === "comms") {
    const [customerId, method] = conversationId.split("::")

    const entries = await db.communicationLog.findMany({
      where: {
        method,
        ...(customerId === "none" ? { customerId: null } : { customerId }),
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        direction: true,
        subject: true,
        message: true,
        recipient: true,
        status: true,
        createdAt: true,
      },
    })

    const customer =
      customerId !== "none"
        ? await db.customer.findUnique({
            where: { id: customerId },
            select: { id: true, name: true },
          })
        : null

    return NextResponse.json({
      success: true,
      data: {
        id: conversationId,
        kind: "comms",
        channel: method,
        customer,
        messages: entries.map((entry) => ({
          id: entry.id,
          role: entry.direction === "inbound" ? "user" : "assistant",
          content: entry.message || entry.subject,
          subject: entry.subject,
          status: entry.status,
          at: entry.createdAt,
        })),
      },
    })
  }

  // ---- List --------------------------------------------------------------
  const [threads, comms] = await Promise.all([
    db.agentThread.findMany({
      where: channel ? { channel } : {},
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 60,
      select: {
        id: true,
        channel: true,
        threadKey: true,
        persona: true,
        customerId: true,
        userId: true,
        lastMessageAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
        messages: {
          where: { content: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    }),
    db.communicationLog.findMany({
      where: channel ? { method: channel } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        customerId: true,
        method: true,
        direction: true,
        subject: true,
        message: true,
        recipient: true,
        createdAt: true,
      },
    }),
  ])

  const customerIds = [
    ...threads.map((thread) => thread.customerId),
    ...comms.map((entry) => entry.customerId),
  ].filter(Boolean) as string[]

  const userIds = threads.map((thread) => thread.userId).filter(Boolean) as string[]

  const [customers, users] = await Promise.all([
    customerIds.length
      ? db.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : [],
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [],
  ])

  const customerById = new Map(customers.map((entry) => [entry.id, entry.name] as const))
  const userById = new Map(users.map((entry) => [entry.id, entry.name] as const))

  const conversations: Conversation[] = threads.map((thread) => ({
    id: thread.id,
    kind: "thread",
    channel: thread.channel,
    title:
      (thread.customerId ? customerById.get(thread.customerId) : null) ||
      (thread.userId ? userById.get(thread.userId) : null) ||
      thread.threadKey,
    subtitle: thread.persona === "customer" ? "customer" : "staff",
    preview: thread.messages[0]?.content?.slice(0, 120) ?? null,
    lastAt: (thread.lastMessageAt ?? thread.updatedAt)?.toISOString() ?? null,
    messageCount: thread._count.messages,
    customerId: thread.customerId,
    persona: thread.persona,
    direction: null,
  }))

  // Group one-way traffic per customer and channel so the list stays readable.
  const grouped = new Map<string, Conversation>()

  for (const entry of comms) {
    const key = `${entry.customerId ?? "none"}::${entry.method}`
    const existing = grouped.get(key)

    if (existing) {
      existing.messageCount += 1
      continue
    }

    grouped.set(key, {
      id: key,
      kind: "comms",
      channel: entry.method,
      title:
        (entry.customerId ? customerById.get(entry.customerId) : null) ||
        entry.recipient ||
        "Unknown",
      subtitle: entry.method,
      preview: (entry.message || entry.subject || "").slice(0, 120),
      lastAt: entry.createdAt.toISOString(),
      messageCount: 1,
      customerId: entry.customerId,
      persona: null,
      direction: entry.direction,
    })
  }

  const all = [...conversations, ...grouped.values()].sort((a, b) =>
    (b.lastAt || "").localeCompare(a.lastAt || "")
  )

  const channels = [...new Set(all.map((conversation) => conversation.channel))]

  return NextResponse.json({
    success: true,
    data: {
      conversations: all,
      channels,
      counts: {
        total: all.length,
        byChannel: channels.map((name) => ({
          channel: name,
          count: all.filter((conversation) => conversation.channel === name).length,
        })),
      },
    },
  })
}

/**
 * Reply to a customer conversation.
 *
 * The inbox could read a conversation and not answer it, which makes it a log
 * rather than an inbox — staff had to find the customer elsewhere and start a
 * separate thread, losing the context they were just reading.
 *
 * Replies go out through the same `sendCommunicationMessage` every other
 * outbound message uses, so they are logged, attributed and subject to the
 * same transport rules. A channel with no transport now fails loudly rather
 * than sitting in "queued" forever.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))

  const message = String(body.message || "").trim()
  const conversationId = String(body.conversationId || "")
  const kind = String(body.kind || "thread")

  if (!message) {
    return NextResponse.json({ success: false, error: "A reply needs a message." }, { status: 400 })
  }

  if (!conversationId) {
    return NextResponse.json(
      { success: false, error: "A conversation is required." },
      { status: 400 }
    )
  }

  // Resolve who this is to, and on which channel, from the conversation itself
  // rather than trusting the caller — replying to the wrong customer is the
  // one mistake an inbox must not make possible.
  let recipient: string | null = null
  let channel = "email"
  let customerId: string | null = null
  let companyId: string | null = null

  if (kind === "thread") {
    const thread = await db.agentThread.findUnique({
      where: { id: conversationId },
      select: { id: true, channel: true, threadKey: true, customerId: true },
    })

    if (!thread) {
      return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 })
    }

    channel = thread.channel || "email"
    customerId = thread.customerId
    // For a messaging channel the thread key is the address; for email the
    // customer's own address is the only safe target.
    recipient = channel === "email" ? null : thread.threadKey
  } else {
    const log = await db.communicationLog.findUnique({
      where: { id: conversationId },
      select: { id: true, method: true, recipient: true, customerId: true },
    })

    if (!log) {
      return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 })
    }

    channel = log.method || "email"
    customerId = log.customerId
    recipient = log.recipient
  }

  if (!recipient && customerId) {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { email: true, companyId: true },
    })
    recipient = customer?.email ?? null
    companyId = customer?.companyId ?? null
  }

  if (!recipient) {
    return NextResponse.json(
      { success: false, error: "That conversation has no address to reply to." },
      { status: 400 }
    )
  }

  const sent = await sendCommunicationMessage({
    to: recipient,
    method: channel,
    subject: body.subject ? String(body.subject) : null,
    message,
    customerId,
    companyId,
    metadata: { repliedBy: auth.user?.id, conversationId, kind },
  })

  return NextResponse.json({
    success: sent.success,
    data: {
      status: sent.status,
      channel,
      to: recipient,
      logId: sent.id,
    },
    // Surfaced rather than swallowed: a channel with no transport reports why.
    ...(sent.success ? {} : { error: `Could not send on ${channel}.` }),
  }, { status: sent.success ? 200 : 502 })
}
