import {
  ToolLoopAgent,
  stepCountIs,
  type ModelMessage,
  type ToolApprovalResponse,
} from "ai"

import { db } from "@/lib/db"

import { buildPrincipalContext, type AgentPrincipal } from "./context"
import {
  applyToolAllowlist,
  defaultSlugFor,
  resolveDefinition,
  type ResolvedDefinition,
} from "./definitions"
import { formatMemories, recall } from "./memory"
import { resolveAgentModel } from "./model"
import { availableSkills, formatSkillCatalogue } from "./skills"
import { decide, getThresholds, type AgentThresholds } from "./policy"
import { buildTools, TOOL_POLICY } from "./tools"
import { describeSettingProposal } from "./tools/settings"
import { formatIdentity, getAgentIdentity } from "./identity"
import { budgetFor, dropOrphanedToolCalls, windowHistory } from "@/lib/agent/history-window"
import { describeGenericProposal } from "@/lib/agent/proposal-summary"
import { turnTimeoutMs, withDeadline } from "@/lib/agent/watchdog"

/**
 * The agent runtime.
 *
 * One loop serves every surface. A turn is: load the thread, brief the model on
 * who it is talking to, let it call tools, persist everything. Writes that clear
 * the policy thresholds happen inline; the rest pause the run and become an
 * AgentProposal that a human answers - in the app or from a Telegram button -
 * after which the same run resumes exactly where it stopped.
 */

/**
 * Personas are now definition slugs rather than a closed union. The two
 * built-ins keep their names so existing threads and runs stay valid.
 */
export type AgentPersona = string

export interface PendingApproval {
  proposalId: string
  toolName: string
  summary: string
  reason: string
  args: Record<string, unknown>
}

export interface AgentTurn {
  text: string
  threadId: string
  runId: string
  pendingApprovals: PendingApproval[]
}

export function personaFor(principal: AgentPrincipal): AgentPersona {
  return defaultSlugFor(principal)
}

/**
 * The one line a person reads before approving.
 *
 * Async because a settings change is only meaningful as a diff against what is
 * saved right now — "defaultRate: not set → 15%" is consent, a JSON blob is
 * not. Both call sites already build the proposal inside an await.
 */
export async function summarise(toolName: string, args: Record<string, unknown>): Promise<string> {
  switch (toolName) {
    case "proposeSettingChange":
      return describeSettingProposal(args)
    case "resetSetting":
      return `Reset ${args.namespace} settings to their defaults`
    case "createSalesOrder":
      return `Create an order for $${Number(args.estimatedTotal || 0).toFixed(2)}`
    case "recordPayment":
      return `Record a $${Number(args.amount || 0).toFixed(2)} payment`
    case "adjustInventory":
      return `Adjust stock by ${args.quantityDelta}`
    case "updateOrderStatus":
      return `Move order to "${args.status}"`
    case "setCreditStatus":
      return `Change credit status to "${args.status}"`
    default:
      // Was `Run ${toolName}`, which asked a person to approve something they
      // could not see: the arguments are the decision, not the tool name.
      return describeGenericProposal(toolName, args)
  }
}

export function valueFor(toolName: string, args: Record<string, unknown>) {
  const field = TOOL_POLICY[toolName]?.valueField
  if (!field) {
    return undefined
  }

  const raw = args[field]
  return typeof raw === "number" ? Math.abs(raw) : undefined
}

export async function buildAgent(
  principal: AgentPrincipal,
  channel: string,
  thresholds: AgentThresholds,
  definition?: ResolvedDefinition,
  /** The incoming message, so recall can surface facts relevant to it. */
  query?: string
) {
  const resolved = definition ?? (await resolveDefinition(defaultSlugFor(principal)))

  const tools = applyToolAllowlist(buildTools(principal, channel), resolved.tools)

  const [context, memories, skills, identity] = await Promise.all([
    buildPrincipalContext(principal),
    recall(principal, { query }),
    // Only procedures this agent can actually carry out with the tools it has.
    availableSkills(resolved.tools ?? Object.keys(tools)),
    getAgentIdentity(),
  ])

  const learned = formatMemories(memories)
  const procedures = formatSkillCatalogue(skills)

  // The definition's own thresholds win when it carries overrides; the caller's
  // are the global set the definition was already layered over.
  const effective = definition ? definition.thresholds : thresholds

  const agentModel = resolveAgentModel({
    model: resolved.model,
    purpose: channel === "telegram" ? "telegram" : resolved.slug,
    tier: "chat",
  })

  return new ToolLoopAgent({
    model: agentModel,
    instructions: [
      // First, so the agent knows who it is before it knows what it does.
      formatIdentity(identity),
      resolved.instructions,
      learned,
      procedures,
      `--- current context ---\n${context}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    tools,
    stopWhen: stepCountIs(resolved.maxSteps),
    toolApproval: ({ toolCall }) => {
      const args = (toolCall.input || {}) as Record<string, unknown>
      const decision = decide({
        toolName: toolCall.toolName,
        meta: TOOL_POLICY[toolCall.toolName],
        value: valueFor(toolCall.toolName, args),
        principal,
        thresholds: effective,
      })

      if (decision.type === "allow") {
        return undefined
      }

      if (decision.type === "deny") {
        return { type: "denied" as const, reason: decision.reason }
      }

      return "user-approval" as const
    },
  })
}

export async function loadThread(input: {
  channel: string
  threadKey: string
  principal: AgentPrincipal
  identityId?: string
  /** Definition slug, when running as something other than the default persona. */
  persona?: string
}) {
  const persona = input.persona || personaFor(input.principal)

  const thread = await db.agentThread.upsert({
    where: { channel_threadKey: { channel: input.channel, threadKey: input.threadKey } },
    create: {
      channel: input.channel,
      threadKey: input.threadKey,
      persona,
      identityId: input.identityId,
      userId: input.principal.kind === "staff" ? input.principal.userId : null,
      customerId: input.principal.kind === "customer" ? input.principal.customerId : null,
    },
    update: { lastMessageAt: new Date(), status: "open" },
    select: { id: true },
  })

  // Read wider than the window, then trim by conversation rather than by row
  // count. Eight rows on Telegram meant a thread with sixty-four messages
  // reached the model as three turns, because tool traffic filled the rest.
  const budget = budgetFor(input.channel)

  const stored = await db.agentMessage.findMany({
    where: { threadId: thread.id, rawJson: { not: null } },
    orderBy: { createdAt: "desc" },
    take: budget.maxMessages * 2,
    select: { rawJson: true },
  })

  // Reverse to chronological order
  stored.reverse()

  const messages = stored
    .map((row) => {
      try {
        return JSON.parse(row.rawJson as string) as ModelMessage
      } catch {
        return null
      }
    })
    .filter(Boolean) as ModelMessage[]

  return { threadId: thread.id, messages: windowHistory(messages, budget) }
}

export async function persistMessages(threadId: string, runId: string, messages: ModelMessage[]) {
  if (!messages.length) {
    return
  }

  await db.agentMessage.createMany({
    data: messages.map((message) => ({
      threadId,
      runId,
      role: String(message.role),
      content: typeof message.content === "string" ? message.content : null,
      rawJson: JSON.stringify(message),
    })),
  })
}

export function stripThinkingTrace(text: string): string {
  if (!text) return ""
  let cleaned = text
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "")
  if (/^(?:Here'?s a thinking process:|Thinking Process:)/i.test(cleaned.trim())) {
    const paragraphs = cleaned.split(/\n\s*\n/)
    const withoutThinking = paragraphs.filter((p) => {
      const trimmed = p.trim()
      return !/^(?:Here'?s a thinking process|Thinking Process|\d+\.\s+\*\*)/i.test(trimmed)
    })
    if (withoutThinking.length > 0) {
      cleaned = withoutThinking.join("\n\n")
    }
  }
  return cleaned.trim()
}

function textFrom(result: { text?: string; steps?: any[]; content?: any[] }) {
  if (result.text && result.text.trim()) {
    return stripThinkingTrace(result.text.trim())
  }

  if (Array.isArray(result.steps) && result.steps.length > 0) {
    for (let i = result.steps.length - 1; i >= 0; i--) {
      const step = result.steps[i]
      if (step.text && step.text.trim()) {
        return stripThinkingTrace(step.text.trim())
      }
    }
    for (let i = result.steps.length - 1; i >= 0; i--) {
      const step = result.steps[i]
      if (Array.isArray(step.toolResults)) {
        for (const tr of step.toolResults) {
          if (tr.result && typeof tr.result === "object") {
            const msg = (tr.result as any).message || (tr.result as any).summary || (tr.result as any).text
            if (msg) return String(msg)
          }
        }
      }
    }
  }

  return ""
}

export async function finishRun(runId: string, patch: Record<string, unknown>) {
  await db.agentRun.update({
    where: { id: runId },
    data: { finishedAt: new Date(), ...patch },
  })
}

export function repairToolMessages(messages: ModelMessage[]): ModelMessage[] {
  const availableResultIds = new Set<string>()
  for (const msg of messages) {
    if (msg.role === "tool" && Array.isArray(msg.content)) {
      for (const part of msg.content as any[]) {
        if (part && typeof part === "object" && (part.type === "tool-result" || part.type === "tool-approval-response") && part.toolCallId) {
          availableResultIds.add(part.toolCallId)
        }
      }
    }
  }

  const repaired: ModelMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const filteredParts: any[] = []
      for (const part of msg.content as any[]) {
        if (part && typeof part === "object" && part.type === "tool-call") {
          if (!availableResultIds.has(part.toolCallId)) {
            filteredParts.push({
              type: "text",
              text: `[Called ${part.toolName}]`,
            })
          } else {
            filteredParts.push(part)
          }
        } else if (part && typeof part === "object" && part.type === "tool-approval-request") {
          if (part.toolCallId && !availableResultIds.has(part.toolCallId)) {
            // Drop dangling approval request without response
          } else {
            filteredParts.push(part)
          }
        } else {
          filteredParts.push(part)
        }
      }
      if (filteredParts.length > 0) {
        repaired.push({ ...msg, content: filteredParts })
      }
    } else {
      repaired.push(msg)
    }
  }

  return repaired
}

export function sanitizeMessagesForModel(messages: ModelMessage[]): ModelMessage[] {
  const cleaned: ModelMessage[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === "user") {
      const text = typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
        ? (msg.content.find((p: any) => p.type === "text") as any)?.text || ""
        : ""
      if (text.trim()) {
        cleaned.push({ role: "user", content: text })
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string" && msg.content.trim()) {
        cleaned.push({ role: "assistant", content: msg.content })
      } else if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter((p: any) => p && typeof p === "object" && p.type === "text" && p.text?.trim())
          .map((p: any) => p.text)
          .join("\n")
        if (textParts.trim()) {
          cleaned.push({ role: "assistant", content: textParts })
        }
      }
    }
  }

  // Ensure last user message is present
  const lastMsg = messages[messages.length - 1]
  if (lastMsg && lastMsg.role === "user" && (cleaned.length === 0 || cleaned[cleaned.length - 1] !== lastMsg)) {
    const lastClean = cleaned[cleaned.length - 1]
    if (!lastClean || lastClean.role !== "user" || lastClean.content !== lastMsg.content) {
      cleaned.push(lastMsg)
    }
  }

  return cleaned
}

/** Runs one turn of conversation and returns the reply plus anything awaiting approval. */
export async function runAgentTurn(input: {
  principal: AgentPrincipal
  channel: string
  threadKey: string
  userMessage: string
  identityId?: string
  trigger?: string
  /** Definition slug to run as. Defaults to the principal's built-in persona. */
  agentSlug?: string
}): Promise<AgentTurn> {
  const slug = input.agentSlug || defaultSlugFor(input.principal)
  const definition = await resolveDefinition(slug)

  // A staff-facing definition must never be reachable by a customer principal,
  // whatever slug was asked for.
  if (input.principal.kind === "customer" && definition.audience !== "customer") {
    throw new Error("That agent is not available on this channel")
  }

  const persona = definition.slug
  const thresholds = definition.thresholds
  const { threadId, messages } = await loadThread({ ...input, persona })

  const run = await db.agentRun.create({
    data: {
      persona,
      trigger: input.trigger || "message",
      channel: input.channel,
      threadId,
      definitionId: definition.id,
      inputJson: JSON.stringify({ message: input.userMessage }),
    },
    select: { id: true },
  })

  const userMessage: ModelMessage = { role: "user", content: input.userMessage }
  let conversation = sanitizeMessagesForModel([...messages, userMessage])

  try {
    const agent = await buildAgent(
      input.principal,
      input.channel,
      thresholds,
      definition,
      input.userMessage
    )
    
    let result
    try {
      /**
       * A deadline, because nothing else here has one.
       *
       * Without it a provider that accepts the request and never answers
       * leaves this await pending forever. On the chat path someone closes the
       * tab; on the unattended paths — Telegram, the scheduler, the proactive
       * loop — nothing does, so the run stays `running`, the scheduler's claim
       * guard refuses to start the next one, and the routine quietly stops
       * happening with nobody told.
       */
      result = await withDeadline(agent.generate({ messages: conversation }), {
        ms: turnTimeoutMs(),
        label: `${persona} turn`,
      })
    } catch (generateError: any) {
      if (
        generateError?.name === "AI_MissingToolResultsError" ||
        String(generateError?.message || "").includes("missing tool result")
      ) {
        // Recover with simplified text-only message history
        const simplifiedMessages = messages
          .filter((m) => typeof m.content === "string")
          .map((m) => ({ role: m.role, content: m.content })) as ModelMessage[]
        result = await withDeadline(
          agent.generate({ messages: [...simplifiedMessages, userMessage] }),
          { ms: turnTimeoutMs(), label: `${persona} retry` }
        )
      } else {
        throw generateError
      }
    }

    await persistMessages(threadId, run.id, [userMessage, ...result.responseMessages])

    const pendingApprovals: PendingApproval[] = []

    for (const part of result.content) {
      if (part.type !== "tool-approval-request" || part.isAutomatic) {
        continue
      }

      const toolCall = part.toolCall as { toolName: string; input?: unknown }
      const args = (toolCall.input || {}) as Record<string, unknown>
      const decision = decide({
        toolName: toolCall.toolName,
        meta: TOOL_POLICY[toolCall.toolName],
        value: valueFor(toolCall.toolName, args),
        principal: input.principal,
        thresholds,
      })

      const proposal = await db.agentProposal.create({
        data: {
          toolName: toolCall.toolName,
          argsJson: JSON.stringify(args),
          summary: await summarise(toolCall.toolName, args),
          policyReason: decision.type === "approve" ? decision.reason : null,
          risk: TOOL_POLICY[toolCall.toolName]?.risk === "high" ? "high" : "medium",
          valueAmount: valueFor(toolCall.toolName, args) ?? null,
          requestedBy: persona,
          threadId,
          runId: run.id,
          approvalId: part.approvalId,
        },
        select: { id: true, summary: true },
      })

      pendingApprovals.push({
        proposalId: proposal.id,
        toolName: toolCall.toolName,
        summary: proposal.summary,
        reason: decision.type === "approve" ? decision.reason : "Needs approval",
        args,
      })
    }

    const text = textFrom(result)

    await finishRun(run.id, {
      status: "succeeded",
      outputJson: JSON.stringify({ text, pending: pendingApprovals.length }),
      steps: result.steps?.length ?? 1,
      promptTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    })

    await db.agentThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    })

    if (definition.id) {
      await db.agentDefinition.update({
        where: { id: definition.id },
        data: { lastRunAt: new Date(), runCount: { increment: 1 } },
      })
    }

    return { text, threadId, runId: run.id, pendingApprovals }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed"
    await finishRun(run.id, { status: "failed", errorText: message })
    throw error
  }
}

/** Answers a paused approval and resumes the run that was waiting on it. */
export async function resolveProposal(input: {
  proposalId: string
  approved: boolean
  principal: AgentPrincipal
  decidedByUserId?: string
  note?: string
}): Promise<AgentTurn> {
  const proposal = await db.agentProposal.findUnique({
    where: { id: input.proposalId },
  })

  if (!proposal) {
    throw new Error("Proposal not found")
  }

  if (proposal.status !== "pending") {
    throw new Error(`This request was already ${proposal.status}`)
  }

  if (!proposal.threadId || !proposal.approvalId) {
    throw new Error("Proposal cannot be resumed")
  }

  const thread = await db.agentThread.findUnique({
    where: { id: proposal.threadId },
    select: { id: true, channel: true, persona: true },
  })

  if (!thread) {
    throw new Error("Thread not found")
  }

  // Resume as whatever the thread was running as. Rebuilding with the default
  // persona would hand a deliberately narrow agent the full tool registry
  // halfway through its own run.
  const definition = await resolveDefinition(thread.persona)

  const stored = await db.agentMessage.findMany({
    where: { threadId: thread.id, rawJson: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { rawJson: true },
  })

  const messages = stored
    .map((row) => {
      try {
        return JSON.parse(row.rawJson as string) as ModelMessage
      } catch {
        return null
      }
    })
    .filter(Boolean) as ModelMessage[]

  // The resume path loaded the entire thread untouched, so a single orphaned
  // tool call from an interrupted run made every approval fail too.
  const repairedMessages = dropOrphanedToolCalls(messages)

  const approvalResponse: ToolApprovalResponse = {
    type: "tool-approval-response",
    approvalId: proposal.approvalId,
    approved: input.approved,
    reason: input.note,
  }

  const approvalMessage: ModelMessage = { role: "tool", content: [approvalResponse] }
  const thresholds = await getThresholds()

  const run = await db.agentRun.create({
    data: {
      persona: thread.persona,
      trigger: "approval",
      channel: thread.channel,
      threadId: thread.id,
      definitionId: definition.id,
      inputJson: JSON.stringify({ proposalId: proposal.id, approved: input.approved }),
    },
    select: { id: true },
  })

  try {
    const agent = await buildAgent(input.principal, thread.channel, thresholds, definition)
    const result = await withDeadline(
      agent.generate({ messages: [...repairedMessages, approvalMessage] }),
      { ms: turnTimeoutMs(), label: "approved action" }
    )

    await persistMessages(thread.id, run.id, [approvalMessage, ...result.responseMessages])

    await db.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: input.approved ? "executed" : "rejected",
        decidedByUserId: input.decidedByUserId,
        decidedAt: new Date(),
        decisionNote: input.note,
        executedAt: input.approved ? new Date() : null,
        resultJson: JSON.stringify({ text: textFrom(result) }),
      },
    })

    await finishRun(run.id, {
      status: "succeeded",
      outputJson: JSON.stringify({ text: textFrom(result) }),
      steps: result.steps?.length ?? 1,
    })

    return { text: textFrom(result), threadId: thread.id, runId: run.id, pendingApprovals: [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval resume failed"
    await finishRun(run.id, { status: "failed", errorText: message })
    throw error
  }
}
