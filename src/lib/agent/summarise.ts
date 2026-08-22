import { generateText } from "ai"

import { db } from "@/lib/db"

import { saveThreadSummary, threadsNeedingSummary } from "./history"
import { resolveAgentModel } from "./model"

/**
 * Conversation summarising.
 *
 * A search hit on one line out of a fifty-turn conversation is nearly useless
 * without knowing what the conversation was. A summary gives every hit a frame,
 * and lets an old thread be recalled compactly rather than replayed.
 *
 * Isolated from `history.ts` on purpose: search must keep working when there is
 * no model credential, which is exactly the state a half-configured deployment
 * is in.
 */

const INSTRUCTIONS = `Summarise this conversation between a staff member and an operations assistant at a food manufacturer.

Write for someone searching months later who needs to know whether this is the conversation they want.

Rules:
- Lead with what was decided or done. Not "the user asked about X" - say what the answer was.
- Keep specifics: names, numbers, order references, dates. They are what makes it findable.
- Two or three sentences. No preamble.
- If nothing was decided, say so plainly.`

/** A short title, derived rather than invented, for the conversation list. */
function deriveTitle(summary: string) {
  const firstSentence = summary.split(/[.!?]/)[0]?.trim() || summary
  return firstSentence.length > 70 ? `${firstSentence.slice(0, 67)}…` : firstSentence
}

export async function summariseThread(threadId: string) {
  const messages = await db.agentMessage.findMany({
    where: { threadId, content: { not: null }, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "asc" },
    take: 120,
    select: { role: true, content: true },
  })

  if (messages.length < 3) {
    return { ok: false as const, error: "Too short to be worth summarising" }
  }

  const transcript = messages
    .map((message) => `${message.role === "user" ? "Staff" : "Assistant"}: ${message.content}`)
    .join("\n")

  try {
    const result = await generateText({
      // Summarising is cheap, high-volume work; it does not need the chat model.
      model: resolveAgentModel("fast"),
      system: INSTRUCTIONS,
      prompt: transcript.slice(0, 24_000),
    })

    const summary = (result.text || "").trim()

    if (!summary) {
      return { ok: false as const, error: "Model returned nothing" }
    }

    const saved = await saveThreadSummary({
      threadId,
      summary,
      title: deriveTitle(summary),
      messageCount: messages.length,
    })

    return { ok: true as const, thread: saved }
  } catch (error) {
    // Stripped of ANSI because provider errors are coloured and the codes render
    // as garbage wherever this surfaces.
    const message = (error instanceof Error ? error.message : "Summarising failed").replace(
      /\[[0-9;]*m/g,
      ""
    )

    return { ok: false as const, error: message }
  }
}

/**
 * Summarises whatever is due. Called from the scheduler tick, so the archive
 * stays searchable without anyone remembering to do it.
 */
export async function summariseBacklog(limit = 3) {
  const pending = await threadsNeedingSummary(limit)

  const done: string[] = []
  const failed: Array<{ threadId: string; error: string }> = []

  for (const thread of pending) {
    const result = await summariseThread(thread.id)

    if (result.ok) {
      done.push(result.thread.title || thread.id)
    } else {
      failed.push({ threadId: thread.id, error: result.error })
      // A missing credential fails identically for every thread; stop rather
      // than burn the whole backlog discovering that once per thread.
      if (/api|key|credential|unauthenticated/i.test(result.error)) {
        break
      }
    }
  }

  return { summarised: done, failed, pending: pending.length }
}
