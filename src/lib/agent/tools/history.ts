import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { readThread, searchHistory } from "../history"
import { defineTool } from "./define"

/**
 * Searching the archive.
 *
 * Available to customers as well as staff, scoped inside `searchHistory` — a
 * customer asking "what did I order last time we spoke" is the same question,
 * against their own conversations only.
 */

export function buildHistoryTools(principal: AgentPrincipal) {
  return {
    searchHistory: defineTool({
      description:
        "Search past conversations for something that was said or decided before. Use this when asked what was agreed, when someone refers to an earlier discussion, or when you suspect a question has come up before. Search for distinctive words - a customer name, a product, an order number - not whole sentences.",
      inputSchema: z.object({
        query: z.string().describe("Distinctive terms, e.g. 'Bidfood pricing' or 'RDM-SO-2026-3001'"),
        afterDays: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Only look at the last N days"),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, afterDays, limit }) => {
        const hits = await searchHistory(principal, {
          query,
          after: afterDays ? new Date(Date.now() - afterDays * 86400_000) : undefined,
          limit,
        })

        if (!hits.length) {
          return {
            found: false as const,
            message: `Nothing in past conversations about "${query}".`,
          }
        }

        return {
          found: true as const,
          count: hits.length,
          conversations: hits.map((hit) => ({
            threadId: hit.threadId,
            title: hit.title,
            // The summary is what makes a hit interpretable; without it a
            // single matching line is usually ambiguous.
            summary: hit.summary,
            channel: hit.channel,
            lastMessageAt: hit.lastMessageAt,
            excerpts: hit.excerpts.map((row) => `${row.role}: ${row.content}`),
          })),
        }
      },
    }),

    readConversation: defineTool({
      description:
        "Read a past conversation in full, when the excerpts from searchHistory are not enough to answer confidently.",
      inputSchema: z.object({
        threadId: z.string(),
        limit: z.number().int().min(5).max(150).optional(),
      }),
      execute: async ({ threadId, limit }) => {
        const result = await readThread(principal, threadId, limit)

        if (!result.ok) {
          return { found: false as const, error: result.error }
        }

        return {
          found: true as const,
          title: result.thread.title,
          summary: result.thread.summary,
          startedAt: result.thread.createdAt,
          messages: result.messages.map((message) => ({
            role: message.role,
            content: message.content,
            at: message.createdAt,
          })),
        }
      },
    }),
  }
}
