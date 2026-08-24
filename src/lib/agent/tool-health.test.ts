import { describe, expect, it } from "vitest"

import { BROKEN_THRESHOLD, describeBroken, type BrokenTool } from "./tool-health"

/**
 * Several tools in this codebase were broken for a long time and looked fine:
 * a web search returning "no results" for every query, spreadsheet exports
 * querying columns that do not exist, a notification tool reading a void return
 * as a boolean. The point of this is to make that visible without guessing.
 */

const tool = (over: Partial<BrokenTool> = {}): BrokenTool => ({
  toolName: "searchWeb",
  consecutiveFailures: 5,
  failureCount: 5,
  successCount: 0,
  lastError: "Search engine rate-limited",
  lastFailedAt: new Date(),
  neverWorked: true,
  ...over,
})

describe("describeBroken", () => {
  it("says so plainly when nothing is broken", () => {
    expect(describeBroken([])).toContain("working")
  })

  it("distinguishes a tool that broke from one that never worked", () => {
    // They lead somewhere different: one is a regression, the other was
    // probably never wired up correctly.
    const regressed = describeBroken([tool({ neverWorked: false, successCount: 40, consecutiveFailures: 4 })])
    const neverWorked = describeBroken([tool()])

    expect(regressed).toContain("40 successful")
    expect(neverWorked).toContain("never succeeded")
  })

  it("includes the error, because the name alone does not help anyone", () => {
    expect(describeBroken([tool()])).toContain("Search engine rate-limited")
  })

  it("counts correctly for one and for many", () => {
    expect(describeBroken([tool()])).toContain("1 tool looks broken")
    expect(describeBroken([tool(), tool({ toolName: "exportReportToCsv" })])).toContain("2 tools look broken")
  })

  it("handles a missing error without printing undefined", () => {
    expect(describeBroken([tool({ lastError: null })])).toContain("unknown")
  })
})

describe("BROKEN_THRESHOLD", () => {
  it("needs more than one failure, so a flaky call is not a fault", () => {
    // A single upstream timeout should not declare a tool broken.
    expect(BROKEN_THRESHOLD).toBeGreaterThan(1)
  })
})
