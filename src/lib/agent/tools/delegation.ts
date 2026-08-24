import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Hermes Multi-Agent Delegation.
 * Allows the orchestrator to delegate sub-tasks to specialized domain subagents.
 */

export function buildDelegationTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    delegateToAgent: defineTool({
      description:
        "Delegate a complex sub-task to a specialized domain subagent (e.g. 'sales', 'warehouse', 'accounts', 'purchasing') and receive their detailed analysis.",
      inputSchema: z.object({
        persona: z
          .enum(["sales", "warehouse", "accounts", "ops", "purchasing", "compliance", "executive", "marketing", "hr"])
          .describe("The domain agent to delegate to: sales (CRM & quoting), warehouse (stock & logistics), accounts (receivables & payments), ops (general operations), purchasing (suppliers & procurement), compliance (food safety & regulations), executive (strategy & KPIs), marketing (campaigns & engagement), hr (people & scheduling)"),
        taskPrompt: z
          .string()
          .describe("Detailed instructions and context for the subagent to analyze"),
      }),
      execute: async ({ persona, taskPrompt }) => {
        try {
          // Dynamically import runAgentTurn to avoid circular dependency
          const { runAgentTurn } = await import("../runtime")

          const subturn = await runAgentTurn({
            principal,
            channel: "internal_delegation",
            threadKey: `delegation:${persona}:${Date.now()}`,
            userMessage: taskPrompt,
            agentSlug: persona,
          })

          return {
            ok: true as const,
            delegatedTo: persona,
            response: subturn.text,
            pendingApprovalsCount: subturn.pendingApprovals.length,
            message: `Specialist agent (${persona}) completed the delegated task.`,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Delegation to ${persona} failed: ${error instanceof Error ? error.message : "subagent error"}`,
          }
        }
      },
    }),
  }
}
