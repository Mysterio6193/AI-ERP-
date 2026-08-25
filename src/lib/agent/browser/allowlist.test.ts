import { describe, expect, it } from "vitest"
import { checkBrowseUrl, hostMatches, parseAllowlist } from "@/lib/agent/browser/allowlist"

describe("hostMatches", () => {
  it("matches the host itself", () => {
    expect(hostMatches("xero.com", "xero.com")).toBe(true)
  })

  it("matches a subdomain, because that is what people mean", () => {
    expect(hostMatches("login.xero.com", "xero.com")).toBe(true)
    expect(hostMatches("a.b.xero.com", "xero.com")).toBe(true)
  })

  it("accepts a leading wildcard as the same thing", () => {
    expect(hostMatches("login.xero.com", "*.xero.com")).toBe(true)
    expect(hostMatches("xero.com", "*.xero.com")).toBe(true)
  })

  it("does not let a lookalike domain through", () => {
    // The classic allowlist escape: endsWith("xero.com") without the dot.
    expect(hostMatches("evil-xero.com", "xero.com")).toBe(false)
    expect(hostMatches("notxero.com", "xero.com")).toBe(false)
  })

  it("does not match a domain that merely contains the pattern", () => {
    expect(hostMatches("xero.com.attacker.net", "xero.com")).toBe(false)
  })

  it("refuses a bare star, which would make the list meaningless", () => {
    expect(hostMatches("anything.com", "*")).toBe(false)
  })

  it("ignores case and a trailing dot", () => {
    expect(hostMatches("LOGIN.Xero.com", "xero.com")).toBe(true)
    expect(hostMatches("xero.com.", "xero.com")).toBe(true)
  })

  it("never matches an empty pattern", () => {
    expect(hostMatches("xero.com", "")).toBe(false)
    expect(hostMatches("xero.com", "   ")).toBe(false)
  })
})

describe("parseAllowlist", () => {
  it("reads one host per line", () => {
    expect(parseAllowlist("xero.com\nmyob.com")).toEqual(["xero.com", "myob.com"])
  })

  it("also accepts commas, because people write both", () => {
    expect(parseAllowlist("xero.com, myob.com")).toEqual(["xero.com", "myob.com"])
  })

  it("drops comments and blank lines so the list can be annotated", () => {
    expect(parseAllowlist("# accounting\nxero.com\n\n# freight\ntoll.com.au")).toEqual([
      "xero.com",
      "toll.com.au",
    ])
  })

  it("treats nothing as an empty list rather than throwing", () => {
    expect(parseAllowlist(null)).toEqual([])
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist("")).toEqual([])
  })
})

describe("checkBrowseUrl", () => {
  it("refuses something that is not a URL", async () => {
    await expect(checkBrowseUrl("not a url", ["xero.com"])).resolves.toMatchObject({
      allowed: false,
    })
  })

  it("refuses a scheme the browser has no business opening", async () => {
    // file:// would read the disk; javascript: would run in whatever page is open.
    await expect(checkBrowseUrl("file:///etc/passwd", ["xero.com"])).resolves.toMatchObject({
      allowed: false,
    })
    await expect(checkBrowseUrl("javascript:alert(1)", ["xero.com"])).resolves.toMatchObject({
      allowed: false,
    })
  })

  it("treats an empty allowlist as closed, not open", async () => {
    // An unconfigured deployment must not have a browser that goes anywhere.
    const verdict = await checkBrowseUrl("https://xero.com", [])
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/no sites have been approved/i)
  })

  it("refuses a host nobody approved, and says who can approve it", async () => {
    const verdict = await checkBrowseUrl("https://example.com/page", ["xero.com"])
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain("example.com")
    expect(verdict.reason).toMatch(/admin/i)
  })

  it("refuses a lookalike host even though it ends with the pattern", async () => {
    const verdict = await checkBrowseUrl("https://evil-xero.com/login", ["xero.com"])
    expect(verdict.allowed).toBe(false)
  })

  it("refuses our own network even when the host is on the list", async () => {
    // The allowlist is permission to visit a site, not permission to reach
    // inside this network to do it.
    const verdict = await checkBrowseUrl("http://localhost:3000/api/orders", ["localhost"])
    expect(verdict.allowed).toBe(false)
  })
})
