import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Multi-Agent Coordination & Swarm Intelligence.
 *
 * These tools let the orchestrator agent spawn, delegate to, and coordinate
 * across multiple specialized domain agents simultaneously — true Hermes-grade
 * multi-agent reasoning.
 */

const AGENT_PERSONAS = [
  "ops", "sales", "warehouse", "accounts",
  "purchasing", "compliance", "executive", "marketing", "hr",
] as const

type AgentPersona = (typeof AGENT_PERSONAS)[number]

const AGENT_DESCRIPTIONS: Record<AgentPersona, string> = {
  ops: "🧑‍🍳 Operations — The all-rounder. Full access to stock, orders, customers, finance, manufacturing, and logistics.",
  sales: "💼 Sales — CRM, quoting, lead management, customer relationships, and pipeline tracking.",
  warehouse: "📦 Warehouse — Stock control, pick lists, batch tracing, allergens, deliveries, and food safety.",
  accounts: "💰 Accounts — Invoices, receivables, payments, credit status, and financial reporting.",
  purchasing: "🛒 Purchasing — Supplier management, purchase orders, cost optimization, and reorder suggestions.",
  compliance: "🛡️ Compliance — Food safety, allergen audits, batch tracing, quarantine, and regulatory compliance.",
  executive: "📊 Executive — Strategic intelligence, KPI dashboards, trend analysis, and decision support.",
  marketing: "📣 Marketing — Campaigns, audience segmentation, customer engagement, and growth initiatives.",
  hr: "👥 HR — Team management, scheduling, communications, training, and staff coordination.",
}

export function buildMultiAgentTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listAvailableAgents: defineTool({
      description:
        "List all available specialized AI agent personas with their capabilities and domain expertise.",
      inputSchema: z.object({}),
      execute: async () => {
        // Also fetch any custom agents from the database
        const customAgents = await db.agentDefinition.findMany({
          where: { enabled: true },
          select: { slug: true, name: true, description: true, avatar: true },
        })

        return {
          builtInAgents: Object.entries(AGENT_DESCRIPTIONS).map(([slug, desc]) => ({
            slug,
            description: desc,
            type: "built-in",
          })),
          customAgents: customAgents
            .filter((a) => !AGENT_PERSONAS.includes(a.slug as AgentPersona))
            .map((a) => ({
              slug: a.slug,
              description: `${a.avatar || "🤖"} ${a.name} — ${a.description || "Custom agent"}`,
              type: "custom",
            })),
          totalAgents: AGENT_PERSONAS.length + customAgents.length,
        }
      },
    }),

    spawnAgentTask: defineTool({
      description:
        "Spawn an autonomous background task for a specialized agent persona. The agent will work on the objective independently and return its analysis or completed work.",
      inputSchema: z.object({
        persona: z.enum(AGENT_PERSONAS).describe("The specialist agent to assign the task to"),
        objective: z.string().describe("Detailed description of what the agent should accomplish"),
        priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        context: z.string().optional().describe("Additional context or data the agent needs"),
      }),
      execute: async ({ persona, objective, priority, context }) => {
        try {
          const { runAgentTurn } = await import("../runtime")

          const taskPrompt = [
            `[Priority: ${priority.toUpperCase()}]`,
            objective,
            context ? `\nAdditional context:\n${context}` : "",
          ].filter(Boolean).join("\n")

          const subturn = await runAgentTurn({
            principal,
            channel: "internal_task",
            threadKey: `task:${persona}:${Date.now()}`,
            userMessage: taskPrompt,
            agentSlug: persona,
          })

          return {
            ok: true as const,
            agent: persona,
            priority,
            response: subturn.text,
            pendingApprovals: subturn.pendingApprovals.length,
            message: `Agent [${persona}] completed the task.`,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Task execution by ${persona} failed: ${error instanceof Error ? error.message : "agent error"}`,
          }
        }
      },
    }),

    agentSwarm: defineTool({
      description:
        "Deploy a swarm of multiple specialized agents to analyze a complex problem from different domain perspectives simultaneously. Each agent provides their expertise, and results are combined.",
      inputSchema: z.object({
        objective: z.string().describe("The complex question or problem to analyze"),
        agents: z.array(z.enum(AGENT_PERSONAS)).min(2).max(5).describe("Which specialist agents to involve (2-5)"),
        mergeStrategy: z.enum(["combine", "compare", "consensus"]).default("combine")
          .describe("How to merge responses: combine (all perspectives), compare (side-by-side), consensus (find agreement)"),
      }),
      execute: async ({ objective, agents, mergeStrategy }) => {
        const { runAgentTurn } = await import("../runtime")

        const results: Array<{ agent: string; response: string | null; error?: string }> = []

        // Run agents sequentially to avoid overwhelming the model API
        for (const persona of agents) {
          try {
            const subturn = await runAgentTurn({
              principal,
              channel: "internal_swarm",
              threadKey: `swarm:${persona}:${Date.now()}`,
              userMessage: `[Multi-Agent Swarm Analysis Request]\n\nObjective: ${objective}\n\nProvide your domain-specific analysis and recommendations from the perspective of the ${persona} team. Be thorough but concise.`,
              agentSlug: persona,
            })
            results.push({ agent: persona, response: subturn.text })
          } catch (error) {
            results.push({
              agent: persona,
              response: null,
              error: error instanceof Error ? error.message : "agent error",
            })
          }
        }

        return {
          ok: true as const,
          objective,
          mergeStrategy,
          agentCount: agents.length,
          responses: results.map((r) => ({
            agent: r.agent,
            agentLabel: AGENT_DESCRIPTIONS[r.agent as AgentPersona] || r.agent,
            analysis: r.response || `[Error: ${r.error}]`,
          })),
          message: `Swarm analysis complete. ${results.filter((r) => r.response).length}/${agents.length} agents responded successfully.`,
        }
      },
    }),

    agentHandoff: defineTool({
      description:
        "Hand off the current conversation to a different specialized agent when the question falls outside your domain expertise. Provides context about what's been discussed so the receiving agent can continue seamlessly.",
      inputSchema: z.object({
        targetAgent: z.enum(AGENT_PERSONAS).describe("The specialist agent to hand off to"),
        context: z.string().describe("Summary of the conversation so far and what the user needs"),
        question: z.string().describe("The specific question or task for the target agent"),
      }),
      execute: async ({ targetAgent, context, question }) => {
        try {
          const { runAgentTurn } = await import("../runtime")

          const handoffPrompt = [
            `[Handoff from another agent]`,
            ``,
            `Context from the previous conversation:`,
            context,
            ``,
            `The user's question for you:`,
            question,
          ].join("\n")

          const subturn = await runAgentTurn({
            principal,
            channel: "internal_handoff",
            threadKey: `handoff:${targetAgent}:${Date.now()}`,
            userMessage: handoffPrompt,
            agentSlug: targetAgent,
          })

          return {
            ok: true as const,
            handedOffTo: targetAgent,
            agentLabel: AGENT_DESCRIPTIONS[targetAgent],
            response: subturn.text,
            pendingApprovals: subturn.pendingApprovals.length,
            message: `Conversation handed off to ${targetAgent} agent.`,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Handoff to ${targetAgent} failed: ${error instanceof Error ? error.message : "agent error"}`,
          }
        }
      },
    }),

    broadcastToAgents: defineTool({
      description:
        "Broadcast a question or directive to ALL available agent personas and collect each domain's perspective. Useful for comprehensive impact analysis or getting a 360° view of a business decision.",
      inputSchema: z.object({
        directive: z.string().describe("The question or directive to broadcast to all agents"),
        responseFormat: z.enum(["brief", "detailed"]).default("brief"),
      }),
      execute: async ({ directive, responseFormat }) => {
        const { runAgentTurn } = await import("../runtime")

        const formatInstruction = responseFormat === "brief"
          ? "Respond in 2-3 sentences with your key insight from your domain perspective."
          : "Provide a thorough analysis from your domain perspective."

        const results: Array<{ agent: string; response: string | null }> = []

        for (const persona of AGENT_PERSONAS) {
          try {
            const subturn = await runAgentTurn({
              principal,
              channel: "internal_broadcast",
              threadKey: `broadcast:${persona}:${Date.now()}`,
              userMessage: `[All-Hands Broadcast]\n\n${directive}\n\n${formatInstruction}`,
              agentSlug: persona,
            })
            results.push({ agent: persona, response: subturn.text })
          } catch {
            results.push({ agent: persona, response: "[Agent unavailable]" })
          }
        }

        return {
          ok: true as const,
          directive,
          agentResponses: results.map((r) => ({
            agent: r.agent,
            label: AGENT_DESCRIPTIONS[r.agent as AgentPersona] || r.agent,
            perspective: r.response,
          })),
          respondedCount: results.filter((r) => r.response && r.response !== "[Agent unavailable]").length,
          totalAgents: AGENT_PERSONAS.length,
        }
      },
    }),
  }
}
