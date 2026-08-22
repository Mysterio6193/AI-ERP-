import { describe, expect, it } from "vitest"

import { DEFAULT_IDENTITY, formatIdentity, NAME_SUGGESTIONS } from "./identity-shared"

const named = { ...DEFAULT_IDENTITY, name: "Friday", signature: "Friday", phone: "+61400000000" }

describe("formatIdentity", () => {
  it("tells the agent its name so it stops introducing itself differently each time", () => {
    const prompt = formatIdentity(named)

    expect(prompt).toContain("Your name is Friday")
    expect(prompt).toContain("answer to it")
  })

  it("states that passing as a person is not allowed", () => {
    // This is a legal exposure, not a style preference, so it is a rule in the
    // prompt rather than a signature the agent might forget to append.
    const prompt = formatIdentity(named)

    expect(prompt).toContain("not a person")
    expect(prompt).toContain("Never claim or imply otherwise")
    expect(prompt).toContain("say plainly that you are not")
  })

  it("carries the signature and disclosure for outbound customer copy", () => {
    const prompt = formatIdentity(named)

    expect(prompt).toContain('sign as "Friday"')
    expect(prompt).toContain(DEFAULT_IDENTITY.disclosure)
  })

  it("omits contact details it does not have rather than printing null", () => {
    const withoutPhone = formatIdentity({ ...named, phone: null })

    expect(withoutPhone).not.toContain("null")
    expect(withoutPhone).not.toContain("phone number")
    expect(formatIdentity(named)).toContain("+61400000000")
  })

  it("keeps a neutral default rather than a persona nobody chose", () => {
    expect(DEFAULT_IDENTITY.name).toBe("SupplySure Assistant")
    expect(NAME_SUGGESTIONS).not.toContain(DEFAULT_IDENTITY.name)
    expect(NAME_SUGGESTIONS.length).toBeGreaterThan(2)
  })
})
