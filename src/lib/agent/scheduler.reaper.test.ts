import { describe, expect, it } from "vitest"

import { RUN_ABANDONED_AFTER_MS } from "@/lib/agent/scheduler"

/**
 * The window itself is the decision worth pinning. Too short and a slow but
 * healthy run is declared dead while it is still working, which is worse than
 * leaving it: the row then contradicts what actually happened.
 */
describe("RUN_ABANDONED_AFTER_MS", () => {
  it("is long enough for a slow legitimate turn", () => {
    // A large tool chain retrying through rate limits can run for minutes.
    expect(RUN_ABANDONED_AFTER_MS).toBeGreaterThanOrEqual(15 * 60 * 1000)
  })

  it("is short enough that a dead run is noticed the same shift", () => {
    expect(RUN_ABANDONED_AFTER_MS).toBeLessThanOrEqual(2 * 60 * 60 * 1000)
  })
})
