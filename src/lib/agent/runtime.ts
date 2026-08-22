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
      return `Run ${toolName}`
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

  return new ToolLoopAgent({
    model: resolveAgentModel("chat"),
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

  const stored = await db.agentMessage.findMany({
    where: { threadId: thread.id, rawJson: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 60,
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

  return { threadId: thread.id, messages }
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

function textFrom(result: { text?: string }) {
  return (result.text || "").trim()
}

export async function finishRun(runId: string, patch: Record<string, unknown>) {
  await db.agentRun.update({
    where: { id: runId },
    data: { finishedAt: new Date(), ...patch },
  })
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
  const conversation = [...messages, userMessage]

  try {
    const agent = await buildAgent(
      input.principal,
      input.channel,
      thresholds,
      definition,
      input.userMessage
    )
    const result = await agent.generate({ messages: conversation })

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
    const result = await agent.generate({ messages: [...messages, approvalMessage] })

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
