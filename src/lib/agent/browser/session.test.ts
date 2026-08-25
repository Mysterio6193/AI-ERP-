import { describe, expect, it } from "vitest"
import { profilePathFor, profileRoot } from "@/lib/agent/browser/session"

describe("profilePathFor", () => {
  it("gives each agent its own directory", () => {
    // A bot restricted to freight must not inherit the accounting session.
    expect(profilePathFor("accounts")).not.toBe(profilePathFor("freight"))
  })

  it("is stable, so a login survives a restart", () => {
    expect(profilePathFor("accounts")).toBe(profilePathFor("accounts"))
  })

  it("cannot be talked out of the profile directory", () => {
    // The slug reaches a filesystem path; "../" would choose where to write.
    const escaped = profilePathFor("../../etc/passwd")
    expect(escaped).not.toContain("..")
    expect(escaped.startsWith(profileRoot())).toBe(true)
  })

  it("strips anything that is not a plain slug", () => {
    const messy = profilePathFor("Ops Agent/2024")
    expect(messy.startsWith(profileRoot())).toBe(true)
    expect(messy).toMatch(/ops-agent-2024$/)
  })

  it("falls back to a name rather than writing to the root", () => {
    expect(profilePathFor("///").endsWith("default")).toBe(true)
  })
})
