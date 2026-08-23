import { describe, expect, it } from "vitest"

import { periodKey, renderDateToken, renderDocumentNumber, type DocumentKind } from "./numbering"
import { defaultsFor } from "./settings/registry"

const numbering = defaultsFor("numbering")
const date = new Date(2026, 7, 22)

describe("renderDateToken", () => {
  it("renders each supported token", () => {
    expect(renderDateToken("none", date)).toBe("")
    expect(renderDateToken("YY", date)).toBe("26")
    expect(renderDateToken("YYYY", date)).toBe("2026")
    expect(renderDateToken("YYYYMM", date)).toBe("202608")
    expect(renderDateToken("YYYYMMDD", date)).toBe("20260822")
  })

  it("zero-pads single-digit months and days", () => {
    expect(renderDateToken("YYYYMMDD", new Date(2026, 0, 5))).toBe("20260105")
  })
})

describe("periodKey", () => {
  it("is independent of the printed date token", () => {
    // Freight bookings print the year but never reset; conflating the two
    // would restart their sequence every January.
    expect(periodKey("never", date)).toBe("")
    expect(periodKey("yearly", date)).toBe("2026")
    expect(periodKey("monthly", date)).toBe("202608")
    expect(periodKey("daily", date)).toBe("20260822")
  })
})

describe("renderDocumentNumber reproduces every legacy generator", () => {
  /**
   * Each expectation is the literal output of the generator being replaced.
   * If one of these changes, documents that customers and suppliers already
   * hold stop matching what the system issues next.
   */
  const cases: Array<[DocumentKind, number, string]> = [
    ["salesOrder", 1001, "SO-2026-01001"],
    ["quote", 1001, "QT-2026-01001"],
    ["invoice", 1001, "INV-2026-01001"],
    ["purchaseOrder", 1001, "PO-2026-01001"],
    ["case", 1001, "CS-2026-01001"],
    ["pickList", 1, "PK-2026-00001"],
    ["delivery", 1, "DL-20260822-00001"],
    ["route", 1, "RT-20260822-001"],
    ["productionOrder", 1, "PRD-2026-0001"],
    ["freightBooking", 1, "FB-2026-0001"],
    ["creditNote", 1, "CN-2026-0001"],
    // Legacy is `RET-${1000 + count + 1}` — no date token at all.
    ["return", 1001, "RET-1001"],
    ["expense", 1, "EXP-2026-00001"],
  ]

  for (const [kind, sequence, expected] of cases) {
    it(`${kind} -> ${expected}`, () => {
      expect(renderDocumentNumber(numbering[kind], sequence, date)).toBe(expected)
    })
  }

  it("covers every kind in the registry", () => {
    // A new document kind must not slip in without a pinned expectation.
    expect(cases.map(([kind]) => kind).sort()).toEqual(Object.keys(numbering).sort())
  })
})

describe("renderDocumentNumber", () => {
  it("omits the date separator entirely when there is no token", () => {
    const format = { ...numbering.return }
    expect(renderDocumentNumber(format, 1001, date)).toBe("RET-1001")
    expect(renderDocumentNumber(format, 1001, date)).not.toContain("--")
  })

  it("pads to the configured width and does not truncate beyond it", () => {
    const format = { ...numbering.route }
    expect(renderDocumentNumber(format, 7, date)).toBe("RT-20260822-007")
    // Overflow must keep the digits rather than silently wrapping.
    expect(renderDocumentNumber(format, 1234, date)).toBe("RT-20260822-1234")
  })

  it("honours a custom separator and suffix", () => {
    const format = { ...numbering.invoice, separator: "/", suffix: "-AU" }
    expect(renderDocumentNumber(format, 42, date)).toBe("INV/2026/00042-AU")
  })

  it("keeps every kind with a legacy generator switched off by default", () => {
    for (const [kind, format] of Object.entries(numbering)) {
      // Expenses are the exception: there was no API and so no legacy
      // generator to preserve, so that kind starts on the counter.
      if (kind === "expense") {
        expect(format.useCounter, "expense has no legacy path to fall back to").toBe(true)
        continue
      }
      expect(format.useCounter, `${kind} must not switch on by default`).toBe(false)
    }
  })
})
