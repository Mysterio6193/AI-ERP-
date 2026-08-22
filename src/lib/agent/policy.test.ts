import { describe, expect, it } from "vitest"

import {
  clampThresholds,
  decide,
  describeThresholds,
  DEFAULT_THRESHOLDS,
  THRESHOLD_LIMITS,
  type AgentThresholds,
} from "./policy"

const current: AgentThresholds = { ...DEFAULT_THRESHOLDS }

describe("clampThresholds", () => {
  it("leaves untouched fields alone", () => {
    expect(clampThresholds({ maxOrderValue: 5000 }, current)).toEqual({
      ...current,
      maxOrderValue: 5000,
    })
  })

  it("bounds a value at its ceiling rather than accepting it", () => {
    // An extra zero must not be the difference between a limit and none.
    expect(clampThresholds({ maxOrderValue: 999_999_999 }, current).maxOrderValue).toBe(
      THRESHOLD_LIMITS.maxOrderValue
    )
    expect(clampThresholds({ maxDiscountPercent: 500 }, current).maxDiscountPercent).toBe(100)
  })

  it("keeps the current value when given nonsense rather than falling to zero", () => {
    // Falling to 0 would read as "never act alone" and look like a broken agent.
    expect(clampThresholds({ maxOrderValue: "abc" }, current).maxOrderValue).toBe(
      current.maxOrderValue
    )
    expect(clampThresholds({ maxOrderValue: -100 }, current).maxOrderValue).toBe(
      current.maxOrderValue
    )
    expect(clampThresholds({ maxOrderValue: NaN }, current).maxOrderValue).toBe(
      current.maxOrderValue
    )
  })

  it("accepts an explicit zero, which means 'always ask'", () => {
    expect(clampThresholds({ maxOrderValue: 0 }, current).maxOrderValue).toBe(0)
  })

  it("coerces the booleans", () => {
    expect(clampThresholds({ readOnly: true }, current).readOnly).toBe(true)
    expect(clampThresholds({ allowOutboundMessages: 1 }, current).allowOutboundMessages).toBe(true)
    expect(clampThresholds({ allowOutboundMessages: 0 }, current).allowOutboundMessages).toBe(false)
  })

  it("ignores keys that are not thresholds", () => {
    const result = clampThresholds({ readOnly: false, somethingElse: "x" } as never, current)

    expect(result).toEqual({ ...current, readOnly: false })
    expect("somethingElse" in result).toBe(false)
  })
})

describe("describeThresholds", () => {
  it("says plainly what auto-acts and what waits", () => {
    const lines = describeThresholds(current).join(" ")

    expect(lines).toContain("$500")
    expect(lines).toContain("waits for you")
  })

  it("describes a zero limit as always asking, not as a dollar amount", () => {
    const lines = describeThresholds({ ...current, maxOrderValue: 0 })

    expect(lines[0]).toBe("Every sales order waits for your approval.")
    expect(lines[0]).not.toContain("$0")
  })

  it("collapses to two lines in read-only mode, since nothing else applies", () => {
    const lines = describeThresholds({ ...current, readOnly: true })

    expect(lines).toHaveLength(2)
    expect(lines.join(" ")).toContain("change nothing")
  })

  it("is explicit about whether the agent may message customers", () => {
    expect(describeThresholds(current).join(" ")).toContain("never sends them itself")
    expect(describeThresholds({ ...current, allowOutboundMessages: true }).join(" ")).toContain(
      "may message customers directly"
    )
  })
})

describe("the limits actually gate decide()", () => {
  const principal = { kind: "staff", role: "admin", userId: "u1" } as never
  const meta = { risk: "medium" as const, valueField: "total" }

  it("acts alone under the limit and pauses over it", () => {
    const under = decide({
      toolName: "createSalesOrder",
      meta,
      value: 499,
      principal,
      thresholds: current,
    })
    const over = decide({
      toolName: "createSalesOrder",
      meta,
      value: 501,
      principal,
      thresholds: current,
    })

    expect(under.type).toBe("allow")
    expect(over.type).toBe("approve")
  })

  it("honours a raised limit", () => {
    const raised = clampThresholds({ maxOrderValue: 50_000 }, current)

    expect(
      decide({ toolName: "createSalesOrder", meta, value: 20_000, principal, thresholds: raised })
        .type
    ).toBe("allow")
  })

  it("denies every write in read-only mode, whatever the value", () => {
    const readOnly = clampThresholds({ readOnly: true }, current)

    expect(
      decide({ toolName: "createSalesOrder", meta, value: 1, principal, thresholds: readOnly }).type
    ).toBe("deny")
  })

  it("still allows reads in read-only mode", () => {
    const readOnly = clampThresholds({ readOnly: true }, current)

    expect(
      decide({
        toolName: "searchProducts",
        meta: { risk: "read" },
        value: undefined,
        principal,
        thresholds: readOnly,
      }).type
    ).toBe("allow")
  })
})

describe("a patch must not erase saved values", () => {
  it("ignores explicitly undefined fields instead of overwriting", () => {
    // The shape that caused the real bug: a caller sends one field and leaves
    // the rest undefined. Spreading that would blank them, and JSON.stringify
    // would then drop the keys so they silently returned to defaults.
    const tuned: AgentThresholds = { ...current, maxOrderValue: 25_000 }
    const patch = { readOnly: true, maxOrderValue: undefined } as unknown as Record<string, unknown>

    const result = clampThresholds(patch, tuned)

    expect(result.maxOrderValue).toBe(25_000)
    expect(result.readOnly).toBe(true)
  })
})
