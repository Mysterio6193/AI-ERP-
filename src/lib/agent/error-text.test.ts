import { describe, expect, it } from "vitest"

import { describeAgentError, redactSecrets } from "./error-text"

describe("describeAgentError", () => {
  it("folds in the part of the error that actually explains it", () => {
    // The real case: the SDK's message is the HTTP status text, and the
    // explanation is in responseBody. "Forbidden" alone tells an operator
    // nothing they can act on.
    const message = describeAgentError({
      message: "Forbidden",
      url: "https://openrouter.ai/api/v1/chat/completions",
      responseBody: "Host not in allowlist: openrouter.ai. Add this host to your network egress settings to allow access.",
    })

    expect(message).toContain("Forbidden")
    expect(message).toContain("openrouter.ai")
    expect(message).toContain("network egress settings")
  })

  it("names which provider refused", () => {
    const message = describeAgentError({
      message: "Unauthorized",
      url: "https://api.openai.com/v1/chat/completions",
      responseBody: "Incorrect API key provided",
    })

    expect(message).toContain("api.openai.com")
  })

  it("does not repeat the status text back at itself", () => {
    const message = describeAgentError({
      message: "Forbidden",
      url: "https://example.com/v1",
      responseBody: "Forbidden",
    })

    expect(message).toBe("Forbidden (example.com)")
  })

  it("truncates a wall of JSON", () => {
    const message = describeAgentError({
      message: "Bad Request",
      responseBody: "x".repeat(5_000),
    })

    expect(message.length).toBeLessThan(500)
    expect(message).toContain("…")
  })

  it("redacts anything that looks like a credential", () => {
    // Provider errors sometimes echo the request, and this text gets pasted
    // into tickets and chats.
    const message = describeAgentError({
      message: "Unauthorized",
      responseBody: 'key sk-abcd1234efgh5678 rejected; sent {"api_key":"secret-value"} with Bearer eyJhbGciOiJIUzI1',
    })

    expect(message).not.toContain("sk-abcd1234efgh5678")
    expect(message).not.toContain("secret-value")
    expect(message).not.toContain("eyJhbGciOiJIUzI1")
    expect(message).toContain("***")
  })

  it("copes with the shapes that are not API errors at all", () => {
    expect(describeAgentError(new Error("boom"))).toBe("boom")
    expect(describeAgentError("just a string")).toBe("just a string")
    expect(describeAgentError(null)).toBe("Agent failed")
    expect(describeAgentError({})).toBe("Agent failed")
    expect(describeAgentError({ message: "   " })).toBe("Agent failed")
  })

  it("ignores a url that is not one", () => {
    expect(describeAgentError({ message: "Nope", url: "not a url" })).toBe("Nope")
  })
})

describe("redactSecrets", () => {
  it("catches the common key shapes without eating ordinary text", () => {
    expect(redactSecrets("sk-livekey1234567890")).toContain("sk-***")
    expect(redactSecrets("Bearer abcdefghijklmnop")).toBe("Bearer ***")
    // A short hyphenated word is not a key.
    expect(redactSecrets("pre-flight check failed")).toBe("pre-flight check failed")
  })
})
