import { db } from "@/lib/db"

import type { AgentPrincipal } from "./context"

/**
 * Search over past conversations.
 *
 * Memory holds facts the agent chose to keep and skills hold procedures; this
 * is the raw record underneath both — what was actually said, when, and by
 * whom. It answers the question neither of the others can: "what did we decide
 * about Bidfood pricing in July", where nobody thought at the time that it was
 * worth remembering.
 *
 * Implemented with term matching and scoring rather than SQLite FTS5. FTS5
 * would rank better, but it needs a virtual table and triggers maintained
 * outside the Prisma schema, which `prisma db push` does not track — a
 * migration hazard that is not worth it at this volume. `searchHistory` is the
 * seam: swap the body when the archive outgrows this.
 */

export interface HistoryHit {
  threadId: string
  channel: string
  persona: string
  title: string | null
  summary: string | null
  lastMessageAt: Date | null
  /** The matching lines, with the strongest first. */
  excerpts: Array<{ role: string; content: string; at: Date }>
  score: number
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "to", "of", "in", "on", "at", "for", "with", "from", "by", "that", "this",
  "it", "as", "we", "our", "us", "they", "them", "their", "i", "me", "my",
  "you", "your", "do", "does", "did", "can", "will", "would", "should", "what",
  "when", "how", "who", "why", "get", "got", "has", "have", "had", "about",
  "said", "say", "tell", "told", "discussed", "decide", "decided",
])

function terms(text: string) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    ),
  ]
}

/** Trims a long message down to the part that actually matched. */
function excerpt(content: string, queryTerms: string[], width = 240) {
  if (content.length <= width) {
    return content
  }

  const lower = content.toLowerCase()
  const firstHit = queryTerms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]

  if (firstHit === undefined) {
    return `${content.slice(0, width)}…`
  }

  const start = Math.max(firstHit - width / 3, 0)
  const slice = content.slice(start, start + width)

  return `${start > 0 ? "…" : ""}${slice}${start + width < content.length ? "…" : ""}`
}

export interface SearchOptions {
  query: string
  /** Only conversations after this date. */
  after?: Date
  before?: Date
  channel?: string
  limit?: number
}

/**
 * Finds past conversations matching a query.
 *
 * Scoping is enforced here, not by callers: a customer can only ever search
 * their own threads, and staff never see a customer's private thread with the
 * customer-facing agent unless it is their own account context.
 */
export async function searchHistory(
  principal: AgentPrincipal,
  options: SearchOptions
): Promise<HistoryHit[]> {
  const queryTerms = terms(options.query)

  if (!queryTerms.length) {
    return []
  }

  const threadScope =
    principal.kind === "customer"
      ? { customerId: principal.customerId }
      : // Staff see staff conversations. A customer's own thread with the
        // customer agent is their private channel, not internal history.
        { persona: { not: "customer" } }

  const messages = await db.agentMessage.findMany({
    where: {
      content: { not: null },
      role: { in: ["user", "assistant"] },
      ...(options.after || options.before
        ? {
            createdAt: {
              ...(options.after ? { gte: options.after } : {}),
              ...(options.before ? { lte: options.before } : {}),
            },
          }
        : {}),
      thread: {
        ...threadScope,
        ...(options.channel ? { channel: options.channel } : {}),
      },
      // Cheap prefilter so scoring runs over a plausible set rather than the
      // whole archive. Any single term is enough to be worth looking at.
      OR: queryTerms.map((term) => ({ content: { contains: term } })),
    },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      threadId: true,
      thread: {
        select: {
          id: true,
          channel: true,
          persona: true,
          title: true,
          summary: true,
          lastMessageAt: true,
        },
      },
    },
  })

  const byThread = new Map<string, { hit: HistoryHit; scored: Array<{ score: number; role: string; content: string; at: Date }> }>()

  for (const message of messages) {
    const content = message.content as string
    const lower = content.toLowerCase()

    const hits = queryTerms.filter((term) => lower.includes(term))
    if (!hits.length) {
      continue
    }

    // Matching more distinct terms beats matching one term repeatedly.
    let score = hits.length * 10

    // A phrase match is a much stronger signal than scattered words.
    if (queryTerms.length > 1 && lower.includes(options.query.toLowerCase().trim())) {
      score += 40
    }

    const existing = byThread.get(message.threadId)

    if (existing) {
      existing.scored.push({ score, role: message.role, content, at: message.createdAt })
      existing.hit.score += score
    } else {
      byThread.set(message.threadId, {
        hit: {
          threadId: message.threadId,
          channel: message.thread.channel,
          persona: message.thread.persona,
          title: message.thread.title,
          summary: message.thread.summary,
          lastMessageAt: message.thread.lastMessageAt,
          excerpts: [],
          score,
        },
        scored: [{ score, role: message.role, content, at: message.createdAt }],
      })
    }
  }

  return [...byThread.values()]
    .map(({ hit, scored }) => ({
      ...hit,
      excerpts: scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((row) => ({
          role: row.role,
          content: excerpt(row.content, queryTerms),
          at: row.at,
        })),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 8)
}

/** The full transcript of one conversation, for when an excerpt is not enough. */
export async function readThread(principal: AgentPrincipal, threadId: string, limit = 100) {
  const thread = await db.agentThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      channel: true,
      persona: true,
      title: true,
      summary: true,
      userId: true,
      customerId: true,
      createdAt: true,
      lastMessageAt: true,
    },
  })

  if (!thread) {
    return { ok: false as const, error: "Conversation not found" }
  }

  const permitted =
    principal.kind === "customer"
      ? thread.customerId === principal.customerId
      : thread.persona !== "customer"

  if (!permitted) {
    return { ok: false as const, error: "Not available" }
  }

  const messages = await db.agentMessage.findMany({
    where: { threadId, content: { not: null }, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { role: true, content: true, createdAt: true },
  })

  return { ok: true as const, thread, messages }
}

/**
 * Threads worth summarising: closed or quiet, long enough to be worth it, and
 * changed since the last summary.
 */
export async function threadsNeedingSummary(limit = 5) {
  const quietBefore = new Date(Date.now() - 6 * 3600_000)

  const threads = await db.agentThread.findMany({
    where: {
      OR: [{ status: "closed" }, { lastMessageAt: { lt: quietBefore } }],
    },
    orderBy: { lastMessageAt: "desc" },
    take: 40,
    select: {
      id: true,
      title: true,
      summarisedUpTo: true,
      _count: { select: { messages: true } },
    },
  })

  return threads
    .filter((thread) => thread._count.messages >= 4)
    .filter((thread) => thread._count.messages > thread.summarisedUpTo)
    .slice(0, limit)
}

/** Stores a summary written elsewhere. Keeps the LLM call out of this module. */
export async function saveThreadSummary(input: {
  threadId: string
  summary: string
  title?: string
  messageCount: number
}) {
  return db.agentThread.update({
    where: { id: input.threadId },
    data: {
      summary: input.summary.trim(),
      title: input.title?.trim() || undefined,
      summarisedAt: new Date(),
      summarisedUpTo: input.messageCount,
    },
    select: { id: true, title: true, summary: true },
  })
}
