import { describe, expect, it } from "vitest"

import { describeSettingsDiff, diffSettings, formatSettingValue } from "./diff"

describe("diffSettings", () => {
  it("reports only the fields the patch actually changes", () => {
    const changes = diffSettings(
      { defaultRate: null, roundingDp: 2, roundingMode: "line" },
      { defaultRate: 15 }
    )

    expect(changes).toEqual([{ path: "defaultRate", before: null, after: 15 }])
  })

  it("reports nothing when the patch sets the same values", () => {
    // Approving a change that changes nothing is a wasted human decision.
    expect(diffSettings({ roundingDp: 2 }, { roundingDp: 2 })).toEqual([])
  })

  it("descends into nested objects with dotted paths", () => {
    const changes = diffSettings(
      { salesOrder: { prefix: "SO", pad: 5 }, quote: { prefix: "QT", pad: 5 } },
      { salesOrder: { pad: 6 } }
    )

    expect(changes).toEqual([{ path: "salesOrder.pad", before: 5, after: 6 }])
  })

  it("compares arrays whole rather than by index", () => {
    // Replacing a bucket list is one change, not five.
    const changes = diffSettings(
      { buckets: [{ label: "Current" }, { label: "1-30" }] },
      { buckets: [{ label: "Current" }] }
    )

    expect(changes).toHaveLength(1)
    expect(changes[0].path).toBe("buckets")
  })

  it("treats a field appearing for the first time as a change from unset", () => {
    expect(diffSettings({}, { defaultRate: 10 })).toEqual([
      { path: "defaultRate", before: undefined, after: 10 },
    ])
  })
})

describe("formatSettingValue", () => {
  it("renders values the way a person reads them", () => {
    expect(formatSettingValue(null)).toBe("not set")
    expect(formatSettingValue(undefined)).toBe("not set")
    expect(formatSettingValue(true)).toBe("on")
    expect(formatSettingValue(false)).toBe("off")
    expect(formatSettingValue([])).toBe("empty")
    expect(formatSettingValue(["a", "b"])).toBe("a, b")
    expect(formatSettingValue(15)).toBe("15")
  })
})

describe("describeSettingsDiff", () => {
  it("reads as a sentence someone can act on", () => {
    const summary = describeSettingsDiff("tax", [
      { path: "defaultRate", before: null, after: 15 },
    ])

    // The whole point: not "Run proposeSettingChange".
    expect(summary).toBe("Change tax settings: defaultRate: not set → 15%")
  })

  it("marks percentage fields as percentages on both sides", () => {
    const summary = describeSettingsDiff("tax", [
      { path: "defaultRate", before: 10, after: 15 },
    ])

    expect(summary).toContain("10% → 15%")
  })

  it("does not add a percent sign to fields that are not percentages", () => {
    const summary = describeSettingsDiff("invoicing", [
      { path: "fallbackDays", before: 30, after: 45 },
    ])

    expect(summary).toBe("Change invoicing settings: fallbackDays: 30 → 45")
  })

  it("truncates a long change with a count rather than filling the card", () => {
    const summary = describeSettingsDiff(
      "numbering",
      Array.from({ length: 7 }, (_, index) => ({
        path: `field${index}`,
        before: index,
        after: index + 1,
      }))
    )

    expect(summary).toContain("and 4 more")
    expect(summary.split("→")).toHaveLength(4)
  })

  it("says plainly when nothing would change", () => {
    expect(describeSettingsDiff("tax", [])).toBe(
      "Change tax settings (nothing would actually change)"
    )
  })
})
