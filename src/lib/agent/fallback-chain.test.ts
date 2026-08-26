import { describe, expect, it } from "vitest"

import { buildFallbackChain } from "@/lib/agent/model"

/**
 * Every rule here comes from a failure that actually happened in this project.
 */
describe("buildFallbackChain", () => {
  it("tries the configured fallback first", () => {
    expect(buildFallbackChain("primary", "configured", "last")).toEqual(["configured", "last"])
  })

  it("skips a fallback that is the primary again", () => {
    // Every model variable was set to one id at once. The safety net sat in the
    // config doing nothing and the agent failed outright on a retired model.
    expect(buildFallbackChain("same", "same", "last")).toEqual(["last"])
  })

  it("still ends somewhere known-good when nothing is configured", () => {
    expect(buildFallbackChain("primary", undefined, "last")).toEqual(["last"])
  })

  it("never retries the primary, even as the last resort", () => {
    // Retrying the model that just failed wastes the one chance left.
    expect(buildFallbackChain("primary", undefined, "primary")).toEqual([])
  })

  it("does not try the same id twice", () => {
    expect(buildFallbackChain("primary", "shared", "shared")).toEqual(["shared"])
  })

  it("ignores an empty configured value", () => {
    expect(buildFallbackChain("primary", "", "last")).toEqual(["last"])
  })

  it("keeps a retired configured id in the chain rather than guessing", () => {
    // It is tried and fails fast; dropping it would need us to know which ids
    // are retired, which we cannot know without asking.
    const chain = buildFallbackChain("gemma", "stealth/ox-alpha", "minimax")
    expect(chain).toEqual(["stealth/ox-alpha", "minimax"])
  })
})
