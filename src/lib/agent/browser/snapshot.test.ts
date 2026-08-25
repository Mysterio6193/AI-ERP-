import { describe, expect, it } from "vitest"
import { MAX_ELEMENTS, renderSnapshot, type PageSnapshot } from "@/lib/agent/browser/snapshot"

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: "https://portal.example.com/orders",
    title: "Open orders",
    elements: [],
    text: "",
    truncated: false,
    ...overrides,
  }
}

describe("renderSnapshot", () => {
  it("names the page and where it is", () => {
    const rendered = renderSnapshot(snapshot())
    expect(rendered).toContain("Open orders")
    expect(rendered).toContain("https://portal.example.com/orders")
  })

  it("lists each element with its ref, so the model can act on it", () => {
    const rendered = renderSnapshot(
      snapshot({ elements: [{ ref: "e1", role: "button", name: "Sign in" }] })
    )
    expect(rendered).toMatch(/e1\s+button\s+"Sign in"/)
  })

  it("shows what is already filled in", () => {
    // Otherwise the model retypes a field that was already correct.
    const rendered = renderSnapshot(
      snapshot({ elements: [{ ref: "e1", role: "textbox", name: "Email", value: "a@b.com" }] })
    )
    expect(rendered).toContain("value: a@b.com")
  })

  it("marks disabled and checked, which change what is worth trying", () => {
    const rendered = renderSnapshot(
      snapshot({
        elements: [
          { ref: "e1", role: "button", name: "Submit", disabled: true },
          { ref: "e2", role: "checkbox", name: "Remember me", checked: true },
        ],
      })
    )
    expect(rendered).toContain("disabled")
    expect(rendered).toContain("checked")
  })

  it("says so plainly when there is nothing to act on", () => {
    expect(renderSnapshot(snapshot())).toContain("No interactive elements")
  })

  it("tells the model to narrow the page rather than read past the limit", () => {
    const rendered = renderSnapshot(snapshot({ truncated: true, elements: [{ ref: "e1", role: "link", name: "x" }] }))
    expect(rendered).toContain(String(MAX_ELEMENTS))
    expect(rendered).toMatch(/narrow the page/i)
  })

  it("includes the page prose, since the model still has to read it", () => {
    const rendered = renderSnapshot(snapshot({ text: "PO-1001 Napoli Rustica 12 pallets" }))
    expect(rendered).toContain("PO-1001")
  })

  it("handles an untitled page without printing an empty label", () => {
    expect(renderSnapshot(snapshot({ title: "" }))).toContain("(untitled)")
  })

  it("truncates a long value rather than pasting a field's whole contents", () => {
    const rendered = renderSnapshot(
      snapshot({ elements: [{ ref: "e1", role: "textbox", name: "Notes", value: "x".repeat(500) }] })
    )
    expect(rendered.length).toBeLessThan(400)
  })
})
