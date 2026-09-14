import { describe, expect, it } from "vitest"

import { MAX_MESSAGES, normaliseUiMessages } from "./ui-messages"

describe("normaliseUiMessages", () => {
  it("accepts the shape the AI SDK actually wants", () => {
    const result = normaliseUiMessages([
      { role: "user", parts: [{ type: "text", text: "hello" }] },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.messages[0].parts[0]).toEqual({ type: "text", text: "hello" })
  })

  it("accepts the shape everyone sends first", () => {
    // `{ role, content }` is what a script or curl reaches for. It used to
    // reach convertToModelMessages, which dereferences `parts` without
    // checking, and came back as a 500 TypeError.
    const result = normaliseUiMessages([{ role: "user", content: "how many work centres?" }])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.messages[0].parts).toEqual([{ type: "text", text: "how many work centres?" }])
  })

  it("keeps any other fields on the message", () => {
    const result = normaliseUiMessages([{ id: "m1", role: "user", content: "hi", extra: 1 }])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.messages[0].id).toBe("m1")
    expect(result.messages[0].extra).toBe(1)
  })

  it("names which message was wrong, not just that something was", () => {
    const result = normaliseUiMessages([
      { role: "user", content: "fine" },
      { role: "user" },
    ])

    expect(result.ok).toBe(false)
    if (result.ok) return
    // The index is the whole point: "invalid request" sends someone hunting.
    expect(result.error).toContain("messages[1]")
    expect(result.error).toContain("parts")
  })

  it("refuses a role the model cannot take", () => {
    const result = normaliseUiMessages([{ role: "tool", content: "x" }])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("messages[0].role")
  })

  it("refuses parts that would be dereferenced and explode", () => {
    for (const parts of [[null], ["text"], [{ text: "no type" }]]) {
      const result = normaliseUiMessages([{ role: "user", parts }])
      expect(result.ok, JSON.stringify(parts)).toBe(false)
    }
  })

  it("refuses an empty or non-array body rather than passing it on", () => {
    expect(normaliseUiMessages([])).toMatchObject({ ok: false })
    expect(normaliseUiMessages(null)).toMatchObject({ ok: false })
    expect(normaliseUiMessages("hello")).toMatchObject({ ok: false })
    expect(normaliseUiMessages({ role: "user" })).toMatchObject({ ok: false })
  })

  it("refuses empty content instead of sending a blank turn to the model", () => {
    expect(normaliseUiMessages([{ role: "user", content: "   " }])).toMatchObject({ ok: false })
  })

  it("caps how much one request can push into the context", () => {
    const many = Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: "user", content: "x" }))
    const result = normaliseUiMessages(many)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain(String(MAX_MESSAGES))
  })

  it("allows a conversation right up to the cap", () => {
    const many = Array.from({ length: MAX_MESSAGES }, () => ({ role: "user", content: "x" }))
    expect(normaliseUiMessages(many).ok).toBe(true)
  })
})
