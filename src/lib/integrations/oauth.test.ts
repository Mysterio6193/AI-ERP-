import { describe, expect, it } from "vitest"

import { buildAuthorizeUrl, callbackUrl, encodeState, expiryFrom, verifyState } from "@/lib/integrations/oauth"
import { getProvider } from "@/lib/integrations/providers"

const env = { INTEGRATION_ENCRYPTION_KEY: "k".repeat(48) } as unknown as NodeJS.ProcessEnv

/**
 * State is the whole security of this flow. Without it, a crafted callback link
 * attaches an attacker's mailbox to a staff member's profile, and the app then
 * reads and sends mail as an account somebody else controls.
 */
describe("OAuth state", () => {
  it("round-trips who started the flow", () => {
    const state = encodeState({ provider: "gmail", userId: "user_1" }, env)
    const verdict = verifyState(state, env)

    expect(verdict.ok).toBe(true)
    if (verdict.ok) {
      expect(verdict.state.provider).toBe("gmail")
      expect(verdict.state.userId).toBe("user_1")
    }
  })

  it("rejects a tampered payload", () => {
    const state = encodeState({ provider: "gmail", userId: "victim" }, env)
    const [payload, signature] = state.split(".")
    const forged = Buffer.from(JSON.stringify({
      provider: "gmail", userId: "attacker", nonce: "x", issuedAt: Date.now(),
    })).toString("base64url")

    const verdict = verifyState(`${forged}.${signature}`, env)
    expect(verdict.ok).toBe(false)
    expect(payload).not.toBe(forged)
  })

  it("rejects state signed with a different key", () => {
    const state = encodeState({ provider: "gmail", userId: "user_1" }, env)
    const other = { INTEGRATION_ENCRYPTION_KEY: "different".repeat(6) } as unknown as NodeJS.ProcessEnv

    expect(verifyState(state, other).ok).toBe(false)
  })

  it("rejects a stale link", () => {
    const old = Buffer.from(JSON.stringify({
      provider: "gmail", userId: "user_1", nonce: "n",
      issuedAt: Date.now() - 60 * 60 * 1000,
    })).toString("base64url")

    // Signed correctly, but too old to still be somebody's live attempt.
    const state = encodeState({ provider: "gmail", userId: "user_1" }, env)
    const signature = state.split(".")[1]
    const verdict = verifyState(`${old}.${signature}`, env)

    expect(verdict.ok).toBe(false)
  })

  it("rejects junk without throwing", () => {
    for (const junk of ["", "no-dot", "a.b.c.d"]) {
      expect(verifyState(junk, env).ok).toBe(false)
    }
  })

  it("gives a different state every time", () => {
    const a = encodeState({ provider: "gmail", userId: "user_1" }, env)
    const b = encodeState({ provider: "gmail", userId: "user_1" }, env)
    expect(a).not.toBe(b)
  })
})

describe("buildAuthorizeUrl", () => {
  const withCreds = {
    ...env,
    GOOGLE_OAUTH_CLIENT_ID: "client-123",
    GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  } as unknown as NodeJS.ProcessEnv

  it("asks Google for offline access, or the connection dies within the hour", () => {
    const url = new URL(buildAuthorizeUrl({
      provider: getProvider("gmail")!,
      state: "state-value",
      baseUrl: "https://app.example.com",
      env: withCreds,
    }))

    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(url.searchParams.get("prompt")).toBe("consent")
  })

  it("sends the redirect that must match what is registered", () => {
    const url = new URL(buildAuthorizeUrl({
      provider: getProvider("gmail")!,
      state: "s",
      baseUrl: "https://app.example.com/",
      env: withCreds,
    }))

    // Trailing slash on the base must not become a double slash in the path.
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/integrations/gmail/callback")
  })

  it("carries the state through", () => {
    const url = new URL(buildAuthorizeUrl({
      provider: getProvider("gmail")!, state: "abc123", baseUrl: "https://a.example.com", env: withCreds,
    }))

    expect(url.searchParams.get("state")).toBe("abc123")
  })

  it("omits scope for a provider that grants access per page instead", () => {
    const notionCreds = { ...env, NOTION_OAUTH_CLIENT_ID: "id", NOTION_OAUTH_CLIENT_SECRET: "s" } as unknown as NodeJS.ProcessEnv
    const url = new URL(buildAuthorizeUrl({
      provider: getProvider("notion")!, state: "s", baseUrl: "https://a.example.com", env: notionCreds,
    }))

    expect(url.searchParams.has("scope")).toBe(false)
    expect(url.searchParams.get("owner")).toBe("user")
  })

  it("requests offline_access from Microsoft, which is what returns a refresh token", () => {
    const msCreds = { ...env, MICROSOFT_OAUTH_CLIENT_ID: "id", MICROSOFT_OAUTH_CLIENT_SECRET: "s" } as unknown as NodeJS.ProcessEnv
    const url = new URL(buildAuthorizeUrl({
      provider: getProvider("outlook")!, state: "s", baseUrl: "https://a.example.com", env: msCreds,
    }))

    expect(url.searchParams.get("scope")).toContain("offline_access")
  })
})

describe("callbackUrl", () => {
  it("does not double the slash when the base has one", () => {
    expect(callbackUrl("notion", "https://a.example.com/")).toBe("https://a.example.com/api/integrations/notion/callback")
  })
})

describe("expiryFrom", () => {
  it("expires a minute early so a token is never used mid-request as it dies", () => {
    const now = new Date("2026-08-25T10:00:00Z")
    expect(expiryFrom(3600, now)?.toISOString()).toBe("2026-08-25T10:59:00.000Z")
  })

  it("returns nothing when the provider gives no expiry", () => {
    expect(expiryFrom(undefined)).toBeNull()
  })

  it("never returns a time in the past for a very short token", () => {
    const now = new Date("2026-08-25T10:00:00Z")
    expect(expiryFrom(10, now)!.getTime()).toBeGreaterThanOrEqual(now.getTime())
  })
})
