import { z } from "zod"

import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { forget, listMemories, recall, remember } from "../memory"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Memory tools.
 *
 * The agent decides what is worth keeping. The guidance in the descriptions
 * matters more than the schemas: the failure mode is not forgetting things, it
 * is remembering everything, which fills the prompt with restatements of what a
 * query could answer instead.
 *
 * Rule of thumb encoded below: store what you could not look up.
 */

export function buildMemoryTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    // Customers get memory *about* their account, written by staff-side runs,
    // but cannot write to it themselves.
    return {}
  }

  return {
    remember: defineTool({
      description:
        "Keep a fact worth knowing next time. Use it for things a query cannot answer: how this business does something, a standing preference, a constraint, a promise made. Do NOT store anything a tool can look up - stock levels, balances, order contents - that goes stale and crowds out what matters. One clear sentence per fact.",
      inputSchema: z.object({
        content: z.string().describe("The fact, as one short sentence"),
        scope: z
          .enum(["company", "user", "entity"])
          .describe(
            "company: how the business works, shared by all staff. user: a preference of the person you are talking to. entity: a fact about one customer or supplier."
          ),
        category: z
          .enum(["preference", "process", "constraint", "relationship", "fact"])
          .optional(),
        importance: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe("How central this is. 80+ for things that change how you work, 30 for trivia."),
        key: z
          .string()
          .optional()
          .describe(
            "A stable identifier if this fact will be revised later, e.g. 'delivery-policy-tas'. Reusing a key corrects the fact instead of duplicating it."
          ),
        entityType: z.enum(["customer", "supplier", "product"]).optional(),
        entityId: z.string().optional(),
      }),
      execute: async (input) => {
        const result = await remember({
          ...input,
          userId: input.scope === "user" ? principal.userId : undefined,
          source: "agent",
        })

        if (!result.ok) {
          return { ok: false as const, error: result.error }
        }

        return {
          ok: true as const,
          id: result.memory.id,
          stored: result.memory.content,
          corrected: result.replaced ?? null,
        }
      },
    }),

    recallMemories: defineTool({
      description:
        "Search what you have previously learned. Useful when you suspect you have been told something before but it is not in front of you.",
      inputSchema: z.object({
        query: z.string().optional(),
        entityType: z.enum(["customer", "supplier", "product"]).optional(),
        entityId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (input) => {
        const memories = await recall(principal, input)

        return {
          count: memories.length,
          memories: memories.map((memory) => ({
            id: memory.id,
            scope: memory.scope,
            content: memory.content,
            category: memory.category,
          })),
        }
      },
    }),

    forgetMemory: defineTool({
      description:
        "Retire a fact that is no longer true. Use this the moment something you remember is contradicted, rather than storing a second conflicting fact.",
      inputSchema: z.object({
        memoryId: z.string(),
        replacement: z
          .string()
          .optional()
          .describe("The corrected fact, if there is one. Stored in the same scope."),
      }),
      execute: async ({ memoryId, replacement }) => {
        const existing = await db.agentMemory.findUnique({
          where: { id: memoryId },
          select: { id: true, scope: true, userId: true, entityType: true, entityId: true, key: true },
        })

        if (!existing) {
          return { ok: false as const, error: "No such memory" }
        }

        // A staff member must not be able to retire another person's private
        // memory through a guessed id.
        if (existing.scope === "user" && existing.userId !== principal.userId) {
          return { ok: false as const, error: "That memory belongs to someone else" }
        }

        let replacementId: string | undefined

        if (replacement) {
          const created = await remember({
            scope: existing.scope as "company" | "user" | "entity",
            content: replacement,
            key: existing.key || undefined,
            userId: existing.userId || undefined,
            entityType: existing.entityType || undefined,
            entityId: existing.entityId || undefined,
            source: "agent",
          })

          if (created.ok) {
            replacementId = created.memory.id
          }
        }

        const result = await forget(memoryId, replacementId)
        return { ok: true as const, forgot: result.memory.content, replacedWith: replacement ?? null }
      },
    }),

    listWhatIKnow: defineTool({
      description:
        "Everything currently remembered, for when someone asks what you know or wants to correct you.",
      inputSchema: z.object({
        scope: z.enum(["company", "user", "entity"]).optional(),
      }),
      execute: async ({ scope }) => {
        const memories = await listMemories({
          scope,
          userId: scope === "user" ? principal.userId : undefined,
          limit: 100,
        })

        return {
          count: memories.length,
          memories: memories.map((memory) => ({
            id: memory.id,
            scope: memory.scope,
            content: memory.content,
            category: memory.category,
            importance: memory.importance,
          })),
        }
      },
    }),
  }
}
