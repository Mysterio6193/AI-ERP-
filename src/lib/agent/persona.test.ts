import { describe, expect, it } from "vitest"

import { formatPersona, type PersonaSettings } from "./persona"

const BASE: PersonaSettings = {
  tone: "professional",
  autoConfirmLowRiskActions: true,
  customSystemInstructions: "",
}

describe("formatPersona", () => {
  it("turns a tone into guidance the model can act on", () => {
    // Naming the tone tells a model nothing. Saying what to do with it does.
    const concise = formatPersona({ ...BASE, tone: "concise" })

    expect(concise).toContain("Lead with the answer")
  })

  it("gives each tone different guidance", () => {
    const seen = new Set(
      (["professional", "concise", "friendly", "technical"] as const).map((tone) =>
        formatPersona({ ...BASE, tone })
      )
    )

    expect(seen.size).toBe(4)
  })

  it("includes the operator's own instructions verbatim and attributed", () => {
    const formatted = formatPersona({
      ...BASE,
      customSystemInstructions: "Never promise a delivery date without checking the route.",
    })

    expect(formatted).toContain("Never promise a delivery date without checking the route.")
    // Attributed to the business, so the model treats it as a standing
    // instruction rather than part of the platform's own prompt.
    expect(formatted).toContain("Standing instructions from this business")
  })

  it("says nothing when there is nothing to say", () => {
    // An empty section is tokens spent telling the model nothing.
    expect(formatPersona(null)).toBe("")
    expect(formatPersona(undefined)).toBe("")
    expect(formatPersona({ ...BASE, customSystemInstructions: "   \n " })).not.toContain(
      "Standing instructions"
    )
  })

  it("does not claim a persona name, which belongs to the identity record", () => {
    // A second copy of the name would let Settings disagree with the name the
    // agent signs emails with.
    expect(formatPersona(BASE)).not.toContain("name is")
  })
})
