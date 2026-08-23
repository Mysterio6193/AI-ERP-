import { convertToModelMessages, type ModelMessage } from "ai"

import { db } from "@/lib/db"

import type { AgentPrincipal } from "./context"
import { defaultSlugFor, resolveDefinition } from "./definitions"
import { getThresholds } from "./policy"
import {
  buildAgent,
  finishRun,
  loadThread,
  personaFor,
  persistMessages,
  repairToolMessages,
  summarise,
  valueFor,
} from "./runtime"
import { TOOL_POLICY } from "./tools"

/**
 * Streaming turns for the in-app chat.
 *
 * Same agent, same tools, same policy as the Telegram path - the difference is
 * that the browser holds the live conversation and the SDK's own approval flow
 * resumes a paused run by re-posting the message list. We still write every
 * message and every proposal to the database, so the audit trail and the
 * approval inbox do not depend on a browser tab staying open.
 */

interface ApprovalResponsePart {
  type: string
  approvalId?: string
  approved?: boolean
  reason?: string
}

/** Marks proposals decided when the client sends approval responses back. */
async function recordApprovalDecisions(messages: ModelMessage[], decidedByUserId?: string) {
  for (const message of messages) {
    if (message.role !== "tool" || !Array.isArray(message.content)) {
      continue
    }

    for (const part of message.content as ApprovalResponsePart[]) {
      if (part.type !== "tool-approval-response" || !part.approvalId) {
        continue
      }

      await db.agentProposal.updateMany({
        where: { approvalId: part.approvalId, status: "pending" },
        data: {
          status: part.approved ? "executed" : "rejected",
          decidedByUserId,
          decidedAt: new Date(),
          decisionNote: part.reason,
          executedAt: part.approved ? new Date() : null,
        },
      })
    }
  }
}

async function recordProposals(input: {
  content: Array<Record<string, unknown>>
  principal: AgentPrincipal
  threadId: string
  runId: string
}) {
  for (const part of input.content) {
    if (part.type !== "tool-approval-request" || part.isAutomatic) {
      continue
    }

    const toolCall = part.toolCall as { toolName: string; input?: unknown } | undefined
    if (!toolCall) {
      continue
    }

    const args = (toolCall.input || {}) as Record<string, unknown>

    await db.agentProposal.create({
      data: {
        toolName: toolCall.toolName,
        argsJson: JSON.stringify(args),
        summary: await summarise(toolCall.toolName, args),
        risk: TOOL_POLICY[toolCall.toolName]?.risk === "high" ? "high" : "medium",
        valueAmount: valueFor(toolCall.toolName, args) ?? null,
        requestedBy: personaFor(input.principal),
        threadId: input.threadId,
        runId: input.runId,
        approvalId: String(part.approvalId || ""),
      },
    })
  }
}

export async function streamAgentResponse(input: {
  principal: AgentPrincipal
  channel: string
  threadKey: string
  uiMessages: unknown[]
  decidedByUserId?: string
  /** Definition slug to run as. Defaults to the principal's built-in persona. */
  agentSlug?: string
  /** Optional custom model override selected on the fly in the UI. */
  modelOverride?: string
}) {
  const thresholds = await getThresholds()
  const definition = await resolveDefinition(input.agentSlug || defaultSlugFor(input.principal))

  if (input.modelOverride) {
    definition.model = input.modelOverride
  }

  if (input.principal.kind === "customer" && definition.audience !== "customer") {
    throw new Error("That agent is not available on this channel")
  }

  const { threadId } = await loadThread({
    channel: input.channel,
    threadKey: input.threadKey,
    principal: input.principal,
    persona: definition.slug,
  })

  const rawModelMessages = await convertToModelMessages(input.uiMessages as never)
  const modelMessages = repairToolMessages(rawModelMessages)
  await recordApprovalDecisions(modelMessages, input.decidedByUserId)

  const run = await db.agentRun.create({
    data: {
      persona: definition.slug,
      trigger: "message",
      channel: input.channel,
      threadId,
      definitionId: definition.id,
      inputJson: JSON.stringify({ messageCount: modelMessages.length }),
    },
    select: { id: true },
  })

  // The latest user turn drives which memories are surfaced.
  const latest = [...modelMessages].reverse().find((message) => message.role === "user")
  const query = typeof latest?.content === "string" ? latest.content : undefined

  const agent = await buildAgent(input.principal, input.channel, thresholds, definition, query)

  const result = await agent.stream({
    messages: modelMessages,
    onFinish: async (event) => {
      try {
        // Only the newest turn is persisted; earlier messages are already stored.
        const incoming = modelMessages.slice(-1)
        await persistMessages(threadId, run.id, [...incoming, ...event.response.messages])

        await recordProposals({
          content: (event.content || []) as Array<Record<string, unknown>>,
          principal: input.principal,
          threadId,
          runId: run.id,
        })

        await finishRun(run.id, {
          status: "succeeded",
          outputJson: JSON.stringify({ text: event.text || "" }),
          steps: event.steps?.length ?? 1,
          promptTokens: event.usage?.inputTokens ?? 0,
          outputTokens: event.usage?.outputTokens ?? 0,
        })

        await db.agentThread.update({
          where: { id: threadId },
          data: { lastMessageAt: new Date() },
        })
      } catch (error) {
        console.error("Failed to persist agent stream:", error)
      }
    },
  })

  return result.toUIMessageStreamResponse({
    // The SDK masks errors as "An error occurred." by default. This is an
    // internal operations tool, and the message is usually the fix itself
    // (a missing model key, a provider outage), so surface it.
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      void finishRun(run.id, { status: "failed", errorText: message }).catch(() => undefined)
      return message
    },
  })
}
