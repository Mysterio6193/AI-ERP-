import { describe, expect, it } from "vitest"

import { isWorthSending, NOTHING_TO_REPORT } from "./delivery"

/**
 * A proactive agent earns its place by staying silent on a normal day.
 *
 * If a briefing arrives every morning saying "all fine", people stop reading
 * it — and then the one that matters is missed too. This decides whether a run
 * is worth interrupting someone for, so a false positive is a habit-forming
 * nuisance and a false negative loses a real alert.
 */

describe("isWorthSending", () => {
  it("sends a real finding", () => {
    expect(isWorthSending("3 invoices went overdue overnight. Drakes is $4,200 past 30 days.")).toBe(true)
  })

  it("stays quiet on the agreed all-clear phrase", () => {
    expect(isWorthSending("Nothing needs attention.")).toBe(false)
  })

  it("stays quiet regardless of case or punctuation", () => {
    // The model will not reproduce the phrase byte-for-byte every time.
    for (const variant of [
      "Nothing needs attention",
      "nothing needs attention.",
      "NOTHING NEEDS ATTENTION!",
      "  Nothing needs attention.  ",
      "Nothing needs attention. ✅",
    ]) {
      expect(isWorthSending(variant), variant).toBe(false)
    }
  })

  it("treats empty output as nothing to say", () => {
    // A run that produced no text is not an alert.
    expect(isWorthSending("")).toBe(false)
    expect(isWorthSending("   ")).toBe(false)
    expect(isWorthSending(null)).toBe(false)
    expect(isWorthSending(undefined)).toBe(false)
  })

  it("still sends when the all-clear is only part of a longer report", () => {
    // "Nothing needs attention in the warehouse, but two invoices are overdue"
    // is a report, not silence. Matching loosely here would swallow it.
    expect(
      isWorthSending("Nothing needs attention in the warehouse, but two invoices are overdue.")
    ).toBe(true)
  })

  it("sends a message that merely contains the words in another sense", () => {
    expect(isWorthSending("Stock levels are fine. Nothing needs attention except the Drakes order.")).toBe(true)
  })

  it("exports the phrase the run prompt asks for, so the two cannot drift", () => {
    // The prompt tells the agent to reply with this exact sentence; if the
    // constant changed and the prompt did not, every quiet day would alert.
    expect(NOTHING_TO_REPORT).toBe("nothing needs attention")
  })
})

describe("pending approvals change what counts as quiet", () => {
  it("a proposal is never a quiet day", async () => {
    // A scheduled agent that proposes a purchase order and says nothing else
    // must still reach someone — the action is waiting on them.
    const { deliverAgentOutput } = await import("./delivery")

    const result = await deliverAgentOutput({
      userId: null,
      text: "Nothing needs attention.",
      approvals: [{ proposalId: "p1", summary: "Raise PO for 40 bases" }],
    })

    // No user to deliver to, but crucially not skipped as "nothing to report".
    expect(result.reason).not.toBe("Nothing worth reporting")
  })

  it("still stays quiet when there is neither text nor a proposal", async () => {
    const { deliverAgentOutput } = await import("./delivery")

    const result = await deliverAgentOutput({
      userId: null,
      text: "Nothing needs attention.",
      approvals: [],
    })

    expect(result.reason).toBe("Nothing worth reporting")
  })
})
