import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { acknowledgeTool, brokenTools, describeBroken, healthSummary } from "@/lib/agent/tool-health"
import { db } from "@/lib/db"
import { describeStale, STALE_AFTER_HOURS } from "@/lib/agent/proposal-summary"

/**
 * General digital problem solving & Hermes Reasoning tools.
 * Gives the agent calculation, plan tracking, scratchpad memory, and web lookups.
 */

// In-memory session scratchpad for multi-turn execution tracking
const sessionScratchpads = new Map<string, Array<{ key: string; value: any; timestamp: string }>>()

export function buildGeneralTools(principal: AgentPrincipal) {
  const principalKey = principal.kind === "staff" ? principal.userId : principal.customerId

  return {
    pendingDecisions: defineTool({
      description:
        "Actions the agent has proposed that are still waiting for a person to approve or reject, oldest first. Use this when asked what needs attention, and before telling someone a request was not actioned — it may be waiting on them.",
      inputSchema: z.object({
        staleAfterHours: z.number().int().min(0).max(168).optional().default(0)
          .describe("Only show proposals waiting longer than this. 0 shows all."),
      }),
      skipHealthTracking: true,
      execute: async ({ staleAfterHours = 0 }) => {
        const cutoff = new Date(Date.now() - staleAfterHours * 3600000)

        const rows = await db.agentProposal.findMany({
          where: { status: "pending", createdAt: { lte: cutoff } },
          orderBy: { createdAt: "asc" },
          select: { id: true, toolName: true, summary: true, createdAt: true, requestedBy: true, risk: true },
        })

        const proposals = rows.map((r) => ({
          id: r.id,
          toolName: r.toolName,
          summary: r.summary,
          risk: r.risk,
          requestedBy: r.requestedBy,
          hoursWaiting: Math.floor((Date.now() - r.createdAt.getTime()) / 3600000),
        }))

        return {
          ok: true as const,
          count: proposals.length,
          proposals,
          report: describeStale(proposals),
          note:
            "A proposal nobody answers is a stall, not a decision — the work never happens and it looks like the request was ignored.",
        }
      },
    }),

    checkToolHealth: defineTool({
      description:
        "Which of the agent's own tools are failing, with the last error for each. Use this when a tool behaves oddly, when asked whether anything is broken, or before reporting that something cannot be done.",
      inputSchema: z.object({
        includeWorking: z.boolean().optional().default(false).describe("Also list tools that are working"),
      }),
      // Watching the watcher would record a failure of the health check as a
      // failure to report health, which is circular and unhelpful.
      skipHealthTracking: true,
      execute: async ({ includeWorking }) => {
        const [broken, summary] = await Promise.all([brokenTools(), healthSummary()])

        return {
          ok: true as const,
          summary,
          broken,
          report: describeBroken(broken),
          ...(includeWorking
            ? {
                working: await db.toolHealth.findMany({
                  where: { consecutiveFailures: 0, successCount: { gt: 0 } },
                  select: { toolName: true, successCount: true, lastSucceededAt: true },
                  orderBy: { successCount: "desc" },
                  take: 25,
                }),
              }
            : {}),
        }
      },
    }),

    acknowledgeToolFault: defineTool({
      description:
        "Mark a known tool fault as seen, so it stops being reported every morning. Use only when a person has decided what to do about it.",
      inputSchema: z.object({
        toolName: z.string().describe("The tool to acknowledge, e.g. searchWeb"),
      }),
      skipHealthTracking: true,
      execute: async ({ toolName }) => {
        await acknowledgeTool(toolName)
        return { ok: true as const, message: `${toolName} acknowledged. It will be reported again if it fails after its next success.` }
      },
    }),


    planTask: defineTool({
      description:
        "Hermes Multi-Step Planner: Use when solving a complex multi-action request. Break down the user's goal into explicit sequential sub-steps before executing tools.",
      inputSchema: z.object({
        goal: z.string().describe("Overall objective to accomplish"),
        steps: z.array(
          z.object({
            stepNumber: z.number().int().positive(),
            action: z.string().describe("Action to perform in this step"),
            toolNeeded: z.string().optional().describe("Tool name to execute"),
          })
        ).describe("Ordered list of sub-steps to complete the goal"),
        estimatedRisk: z.enum(["low", "medium", "high"]).optional().default("low"),
      }),
      execute: async ({ goal, steps, estimatedRisk = "low" }) => {
        return {
          ok: true as const,
          goal,
          totalSteps: steps.length,
          plan: steps,
          status: "in_progress",
          message: `Created execution plan with ${steps.length} step(s). Proceeding with Step 1.`,
        }
      },
    }),

    scratchpadNote: defineTool({
      description:
        "Hermes Working Memory Scratchpad: Save or retrieve temporary working notes, intermediate IDs, running calculations, or execution state during a multi-step workflow.",
      inputSchema: z.object({
        action: z.enum(["set", "get", "list", "clear"]).describe("Scratchpad action"),
        key: z.string().optional().describe("Key name for the note"),
        value: z.string().optional().describe("Value or note content to save"),
      }),
      execute: async ({ action, key, value }) => {
        let entries = sessionScratchpads.get(principalKey) || []

        if (action === "set" && key && value !== undefined) {
          entries = entries.filter((e) => e.key !== key)
          entries.push({ key, value, timestamp: new Date().toISOString() })
          sessionScratchpads.set(principalKey, entries)
          return { ok: true as const, key, message: `Saved scratchpad note for "${key}".` }
        }

        if (action === "get" && key) {
          const entry = entries.find((e) => e.key === key)
          return { ok: true as const, key, value: entry?.value || null }
        }

        if (action === "clear") {
          sessionScratchpads.delete(principalKey)
          return { ok: true as const, message: "Scratchpad cleared." }
        }

        return {
          ok: true as const,
          count: entries.length,
          notes: entries,
        }
      },
    }),

    executeCalculation: defineTool({
      description:
        "Evaluate a mathematical formula, financial computation, margin calculation, or array rollup. Examples: '828 * 0.10', '(12.50 - 7.00) / 12.50 * 100', 'sum([120, 340, 50, 95])'.",
      inputSchema: z.object({
        expression: z.string().describe("Mathematical or algorithmic expression to compute"),
      }),
      execute: async ({ expression }) => {
        try {
          // Clean and sanitize expression for safe arithmetic evaluation
          const sanitized = expression
            .replace(/sum\(\[([^\]]+)\]\)/g, "($1).split(',').map(Number).reduce((a,b)=>a+b,0)")
            .replace(/avg\(\[([^\]]+)\]\)/g, "(($1).split(',').map(Number).reduce((a,b)=>a+b,0)/($1).split(',').length)")
            .replace(/[^0-9+\-*/().,%^ \t\n]/g, "")

          if (!sanitized.trim()) {
            return { ok: false as const, error: "Invalid calculation expression" }
          }

          // Evaluate safely in isolated math scope
          const result = Function(`"use strict"; return (${sanitized});`)()
          const formatted = typeof result === "number" ? Number(result.toFixed(4)) : result

          return {
            ok: true as const,
            expression,
            result: formatted,
            message: `Result: ${formatted}`,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Calculation error: ${error instanceof Error ? error.message : "failed to evaluate"}`,
          }
        }
      },
    }),

    fetchWebPage: defineTool({
      description:
        "Fetch and read public web content, API endpoints, or online supplier price lists (returns cleaned text).",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to fetch"),
      }),
      execute: async ({ url }) => {
        try {
          const response = await fetch(url, {
            headers: { "User-Agent": "SupplySure-Agent/1.0 (B2B ERP Assistant)" },
            signal: AbortSignal.timeout(10000),
          })

          if (!response.ok) {
            return { ok: false as const, error: `HTTP ${response.status}: ${response.statusText}` }
          }

          const text = await response.text()
          const cleaned = text
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 4000)

          return {
            ok: true as const,
            url,
            content: cleaned,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Failed to fetch URL: ${error instanceof Error ? error.message : "network error"}`,
          }
        }
      },
    }),
  }
}
