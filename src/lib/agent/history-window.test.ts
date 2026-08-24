import { describe, expect, it } from "vitest"
import type { ModelMessage } from "ai"

import { budgetFor, countConversationTurns, windowHistory } from "./history-window"

/**
 * The window was a flat row count, and rows are not turns. A thread with 64
 * messages reached the model as three conversational turns, because five of the
 * eight slots held tool traffic — which is why the agent could not remember
 * what it had been asked two questions earlier.
 */

const user = (text: string): ModelMessage => ({ role: "user", content: text })
const assistant = (text: string): ModelMessage => ({ role: "assistant", content: text })

const toolCall = (): ModelMessage => ({
  role: "assistant",
  content: [{ type: "tool-call", toolCallId: "1", toolName: "findCustomers", input: {} }],
} as ModelMessage)

const toolResult = (): ModelMessage => ({
  role: "tool",
  content: [{ type: "tool-result", toolCallId: "1", toolName: "findCustomers", output: { type: "json", value: {} } }],
} as ModelMessage)

/** One question that used a tool: four rows, two conversational turns. */
function exchange(n: number): ModelMessage[] {
  return [user(`question ${n}`), toolCall(), toolResult(), assistant(`answer ${n}`)]
}

describe("countConversationTurns", () => {
  it("does not count tool traffic as conversation", () => {
    expect(countConversationTurns(exchange(1))).toBe(2)
  })
})

describe("windowHistory", () => {
  it("returns a short history untouched", () => {
    const messages = exchange(1)
    expect(windowHistory(messages, { maxMessages: 30, minConversationTurns: 8 })).toEqual(messages)
  })

  it("keeps far more conversation than a flat row count did", () => {
    // Ten tool-using exchanges: 40 rows, 20 conversational turns.
    const messages = Array.from({ length: 10 }, (_, i) => exchange(i)).flat()

    const kept = windowHistory(messages, { maxMessages: 30, minConversationTurns: 8 })

    expect(countConversationTurns(kept)).toBeGreaterThanOrEqual(8)
    // The old behaviour was slice(-8), which held three.
    expect(countConversationTurns(kept)).toBeGreaterThan(3)
  })

  it("never exceeds the ceiling", () => {
    const messages = Array.from({ length: 40 }, (_, i) => exchange(i)).flat()
    expect(windowHistory(messages, { maxMessages: 30, minConversationTurns: 8 }).length).toBeLessThanOrEqual(30)
  })

  it("always starts on a user message, so a tool call is never orphaned", () => {
    // An assistant tool-call whose matching result was cut is rejected by the
    // model API — a long thread would fail outright rather than remember less.
    const messages = Array.from({ length: 20 }, (_, i) => exchange(i)).flat()

    const kept = windowHistory(messages, { maxMessages: 30, minConversationTurns: 8 })

    expect(kept[0].role).toBe("user")
  })

  it("keeps every tool result paired with its call", () => {
    const messages = Array.from({ length: 20 }, (_, i) => exchange(i)).flat()
    const kept = windowHistory(messages, { maxMessages: 30, minConversationTurns: 8 })

    let openCalls = 0
    for (const message of kept) {
      if (message.role === "tool") openCalls--
      else if (Array.isArray(message.content) && message.content.some((c) => (c as { type?: string }).type === "tool-call")) openCalls++
    }

    expect(openCalls).toBe(0)
  })

  it("keeps the most recent exchange, not an old one", () => {
    const messages = Array.from({ length: 20 }, (_, i) => exchange(i)).flat()
    const kept = windowHistory(messages, { maxMessages: 30, minConversationTurns: 8 })

    expect(JSON.stringify(kept.at(-1))).toContain("answer 19")
  })

  it("falls back safely when there is no user message to cut on", () => {
    // Keeping the newest slice could orphan a tool result; the oldest cannot.
    const messages = Array.from({ length: 40 }, () => assistant("x"))
    const kept = windowHistory(messages, { maxMessages: 10, minConversationTurns: 4 })

    expect(kept).toHaveLength(10)
    expect(kept[0]).toEqual(messages[0])
  })
})

describe("budgetFor", () => {
  it("gives Telegram a tighter budget than the web, but not amnesia", () => {
    expect(budgetFor("telegram").maxMessages).toBeLessThan(budgetFor("web").maxMessages)
    // Eight rows was the bug, not the policy.
    expect(budgetFor("telegram").maxMessages).toBeGreaterThan(8)
  })

  it("falls back to the default for an unknown channel", () => {
    expect(budgetFor(undefined)).toEqual(budgetFor("anything-else"))
  })
})

describe("dropOrphanedToolCalls", () => {
  const orphanCall = (): ModelMessage => ({
    role: "assistant",
    content: [
      { type: "text", text: "Let me check that." },
      { type: "tool-call", toolCallId: "dead", toolName: "findCustomers", input: {} },
    ],
  } as ModelMessage)

  it("removes a tool call whose result was never stored", async () => {
    // A run that dies between calling a tool and saving its result leaves this
    // in the thread forever, and the model API then refuses every later turn
    // with "Tool result is missing for tool call ...".
    const { dropOrphanedToolCalls } = await import("./history-window")

    const repaired = dropOrphanedToolCalls([user("hi"), orphanCall()])
    // Widened deliberately: the union of content part types differs per role,
    // and this assertion only cares about the discriminator.
    const parts = repaired.flatMap((m) =>
      Array.isArray(m.content) ? (m.content as Array<{ type?: string }>) : []
    )

    expect(parts.some((part) => part.type === "tool-call")).toBe(false)
  })

  it("keeps the text the assistant said alongside the broken call", async () => {
    // Dropping the whole message would lose what the agent actually replied.
    const { dropOrphanedToolCalls } = await import("./history-window")

    const repaired = dropOrphanedToolCalls([user("hi"), orphanCall()])
    expect(JSON.stringify(repaired)).toContain("Let me check that.")
  })

  it("leaves an intact call and result alone", async () => {
    const { dropOrphanedToolCalls } = await import("./history-window")
    const messages = exchange(1)

    expect(dropOrphanedToolCalls(messages)).toEqual(messages)
  })

  it("removes a result whose call is missing", async () => {
    const { dropOrphanedToolCalls } = await import("./history-window")

    const repaired = dropOrphanedToolCalls([user("hi"), toolResult()])
    expect(repaired.some((m) => m.role === "tool")).toBe(false)
  })

  it("drops a message left with nothing in it", async () => {
    const { dropOrphanedToolCalls } = await import("./history-window")

    const bare: ModelMessage = {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "dead", toolName: "x", input: {} }],
    } as ModelMessage

    expect(dropOrphanedToolCalls([user("hi"), bare])).toHaveLength(1)
  })

  it("is applied by windowHistory, so every caller is protected", async () => {
    const { windowHistory } = await import("./history-window")

    const messages = [user("hi"), orphanCall()]
    const kept = windowHistory(messages, { maxMessages: 60, minConversationTurns: 10 })

    expect(JSON.stringify(kept)).not.toContain("tool-call")
  })
})
