import { describe, expect, it } from "vitest"
import { looksSmall, reviewTiers } from "@/lib/agent/model-tiers"

describe("looksSmall", () => {
  it("recognises the small model in each family", () => {
    expect(looksSmall("gemini-3.1-flash-lite")).toBe(true)
    expect(looksSmall("anthropic/claude-haiku-4.5")).toBe(true)
    expect(looksSmall("gpt-5-mini")).toBe(true)
    expect(looksSmall("some-nano-model")).toBe(true)
  })

  it("does not mistake a large model for a small one", () => {
    expect(looksSmall("gemini-3.1-flash")).toBe(false)
    expect(looksSmall("anthropic/claude-sonnet-5")).toBe(false)
    expect(looksSmall("nvidia/nemotron-3-super-120b-a12b")).toBe(false)
  })

  it("does not fire on a size that happens to appear mid-word", () => {
    // "limited" contains "lite"; the marker is anchored to a word boundary.
    expect(looksSmall("model-limited-preview")).toBe(false)
  })
})

describe("reviewTiers", () => {
  it("warns when the reasoning purposes run on a small model", () => {
    const findings = reviewTiers({ chat: "gemini-3.1-flash-lite", fast: "gemini-3.1-flash-lite" })
    expect(findings.some((f) => f.level === "warn" && /chat/.test(f.message))).toBe(true)
  })

  it("names the fix rather than just the problem", () => {
    const findings = reviewTiers({ chat: "gemini-3.1-flash-lite", fast: "gemini-3.1-flash-lite" })
    expect(findings.some((f) => f.message.includes("AGENT_MODEL"))).toBe(true)
  })

  it("warns when every purpose collapses onto one model", () => {
    const findings = reviewTiers({ chat: "m", fast: "m", triage: "m" })
    expect(findings.some((f) => /tiering does nothing/.test(f.message))).toBe(true)
  })

  it("is satisfied by a real split", () => {
    const findings = reviewTiers({
      chat: "gemini-3.1-pro",
      finance: "gemini-3.1-pro",
      fast: "gemini-3.1-flash-lite",
      triage: "gemini-3.1-flash-lite",
    })
    expect(findings.every((f) => f.level === "ok")).toBe(true)
  })

  it("does not complain about a small model on the cheap purposes", () => {
    // Small on summarise and triage is the design, not a mistake.
    const findings = reviewTiers({ chat: "gemini-3.1-pro", fast: "gemini-3.1-flash-lite" })
    expect(findings.every((f) => f.level === "ok")).toBe(true)
  })

  it("says nothing about an empty map", () => {
    expect(reviewTiers({})).toEqual([])
  })
})
