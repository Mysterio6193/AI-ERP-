import type { ModelMessage } from "ai"

/**
 * How much of a conversation the model gets to see.
 *
 * The window was a flat row count — 8 on Telegram — and rows are not turns. A
 * single question that calls three tools spends four of those slots on tool
 * traffic, so a thread with 64 messages arrived at the model as three
 * conversational turns and the agent genuinely could not remember what it had
 * been asked two questions earlier.
 *
 * Two rules matter here, and the second is the one that breaks things quietly.
 */

/** A tool call and its result must travel together. */
function isToolTraffic(message: ModelMessage): boolean {
  if (message.role === "tool") return true

  return (
    Array.isArray(message.content) &&
    message.content.some(
      (part) =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        (part.type === "tool-call" || part.type === "tool-result")
    )
  )
}

export function countConversationTurns(messages: ModelMessage[]): number {
  return messages.filter((message) => !isToolTraffic(message)).length
}


/**
 * Remove tool calls whose result was never stored, and results with no call.
 *
 * A run that dies between making a tool call and persisting its result leaves
 * the assistant's call in the thread forever. Every later turn then replays it,
 * and the model API refuses the whole request with "Tool result is missing for
 * tool call ..." — so one interrupted turn bricks the conversation permanently,
 * and no amount of windowing fixes it because the damage is in the stored rows.
 *
 * Dropping only the broken part rather than the whole message matters: an
 * assistant turn often carries text alongside its tool call, and throwing that
 * away loses what the agent actually said.
 */
export function dropOrphanedToolCalls(messages: ModelMessage[]): ModelMessage[] {
  const calls = new Set<string>()
  const results = new Set<string>()

  const collect = (message: ModelMessage) => {
    if (!Array.isArray(message.content)) return
    for (const part of message.content as Array<{ type?: string; toolCallId?: string }>) {
      if (part?.type === "tool-call" && part.toolCallId) calls.add(part.toolCallId)
      if (part?.type === "tool-result" && part.toolCallId) results.add(part.toolCallId)
    }
  }

  messages.forEach(collect)

  const orphanedCalls = new Set([...calls].filter((id) => !results.has(id)))
  const orphanedResults = new Set([...results].filter((id) => !calls.has(id)))

  if (orphanedCalls.size === 0 && orphanedResults.size === 0) {
    return messages
  }

  const repaired: ModelMessage[] = []

  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      repaired.push(message)
      continue
    }

    const kept = (message.content as Array<{ type?: string; toolCallId?: string }>).filter((part) => {
      if (part?.type === "tool-call" && part.toolCallId) return !orphanedCalls.has(part.toolCallId)
      if (part?.type === "tool-result" && part.toolCallId) return !orphanedResults.has(part.toolCallId)
      return true
    })

    // A message left with nothing in it is dropped; one that still has text or
    // an intact pair is kept with the broken part removed.
    if (kept.length > 0) {
      repaired.push({ ...message, content: kept } as ModelMessage)
    }
  }

  return repaired
}

export interface WindowOptions {
  /** Hard ceiling on messages handed to the model. */
  maxMessages: number
  /** Conversation turns to keep even when tool traffic is heavy. */
  minConversationTurns: number
}

/**
 * Trim history to a window that still contains a conversation.
 *
 * Trimming starts from the oldest end and stops at a user message. An assistant
 * message carrying a tool call whose matching tool result has been cut is
 * rejected by the model API, so slicing at an arbitrary offset turns a long
 * thread into a hard error rather than a shorter memory — cutting on a user
 * boundary cannot orphan a pair, because a user message never sits between a
 * call and its result.
 */
export function windowHistory(
  rawMessages: ModelMessage[],
  options: WindowOptions
): ModelMessage[] {
  const { maxMessages, minConversationTurns } = options

  // Repair before trimming: a stored orphan breaks the request regardless of
  // how much of the thread is kept.
  const messages = dropOrphanedToolCalls(rawMessages)

  if (messages.length <= maxMessages) {
    return messages
  }

  // Every point the history can safely be cut at, newest first.
  const userBoundaries: number[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") userBoundaries.push(i)
  }

  if (userBoundaries.length === 0) {
    // No user turn to cut on. Keeping the newest slice risks orphaning a tool
    // result, so keep the oldest instead, which cannot.
    return messages.slice(0, maxMessages)
  }

  let chosen = userBoundaries[0]

  for (const boundary of userBoundaries) {
    const candidate = messages.slice(boundary)

    if (candidate.length > maxMessages) break

    chosen = boundary

    // Far enough back to hold a real conversation: stop widening.
    if (countConversationTurns(candidate) >= minConversationTurns) break
  }

  return messages.slice(chosen)
}

/**
 * Per-channel budgets.
 *
 * Telegram is tighter than the web because a phone conversation is shorter and
 * every token is paid on each message, but eight rows was not tight, it was
 * amnesia.
 *
 * These are sized against what history actually costs. On a real thread, tool
 * traffic is 87% of the rows and the largest single result is 2KB — sixty rows
 * is roughly 27KB, which is small beside the hundred-odd tool definitions
 * already in every prompt. The count was the problem, not the size.
 */
export const HISTORY_BUDGETS: Record<string, WindowOptions> = {
  telegram: { maxMessages: 60, minConversationTurns: 10 },
  default: { maxMessages: 100, minConversationTurns: 16 },
}

export function budgetFor(channel: string | undefined): WindowOptions {
  return HISTORY_BUDGETS[channel ?? ""] ?? HISTORY_BUDGETS.default
}
