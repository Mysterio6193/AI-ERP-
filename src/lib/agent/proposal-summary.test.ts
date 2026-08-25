import { describe, expect, it } from "vitest"

import { describeGenericProposal, describeStale, humaniseToolName } from "./proposal-summary"

/**
 * Seven tools had a written summary; everything else read "Run agentHandoff".
 * That asks someone to approve an action they cannot see — and one such
 * proposal sat pending for twenty-three hours here.
 */

describe("describeGenericProposal", () => {
  it("says what the action would actually do", () => {
    // The real proposal that stalled. "Hand off to sales" and "hand off to
    // accounts" are different requests; the tool name cannot tell them apart.
    const summary = describeGenericProposal("agentHandoff", {
      targetAgent: "sales",
      context: "Riccardo is asking me to message sales about the Q4 order",
    })

    expect(summary).toContain("Agent handoff")
    expect(summary).toContain("sales")
  })

  it("leaves out plumbing nobody decides on", () => {
    const summary = describeGenericProposal("doThing", { companyId: "c1", threadId: "t1", amount: 250 })

    expect(summary).not.toContain("c1")
    expect(summary).toContain("250")
  })

  it("truncates long free text rather than pasting a paragraph", () => {
    const summary = describeGenericProposal("doThing", { note: "x".repeat(300) })

    expect(summary.length).toBeLessThan(120)
    expect(summary).toContain("…")
  })

  it("summarises a list by its size", () => {
    expect(describeGenericProposal("createOrder", { items: [1, 2, 3] })).toContain("3 items")
  })

  it("renders booleans as words", () => {
    expect(describeGenericProposal("doThing", { urgent: true })).toContain("yes")
  })

  it("falls back to the action alone when nothing is worth showing", () => {
    expect(describeGenericProposal("syncEverything", { companyId: "c1" })).toBe("Sync everything")
  })

  it("skips empty values instead of printing blanks", () => {
    expect(describeGenericProposal("doThing", { note: "", other: "real" })).toContain("real")
    expect(describeGenericProposal("doThing", { note: "", other: "real" })).not.toContain("note")
  })
})

describe("humaniseToolName", () => {
  it("splits camelCase into words", () => {
    expect(humaniseToolName("agentHandoff")).toBe("Agent handoff")
    expect(humaniseToolName("recordSupplierPayment")).toBe("Record supplier payment")
  })
})

describe("describeStale", () => {
  it("says so when nothing is waiting", () => {
    expect(describeStale([])).toContain("Nothing is waiting")
  })

  it("reports how long a decision has been sitting", () => {
    // A proposal nobody answered is a stall, not a decision — it looks from
    // the outside like the agent ignoring the request it was given.
    const text = describeStale([
      { id: "p1", toolName: "agentHandoff", summary: "Agent handoff — target agent: sales", hoursWaiting: 23, requestedBy: "ops" },
    ])

    expect(text).toContain("23h")
    expect(text).toContain("sales")
    expect(text).toContain("ops")
  })
})
