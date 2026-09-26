import { describe, expect, it } from "vitest"

import { overridesFor, type ModelSettings } from "./model-config"

const BLANK: ModelSettings = {
  provider: "environment",
  chatModel: "",
  telegramModel: "",
  ocrModel: "",
  voiceModel: "",
  replenishmentModel: "",
  emailModel: "",
  financeModel: "",
  fastModel: "",
  localBaseUrl: "",
}

describe("overridesFor", () => {
  it("contributes nothing when everything is unset", () => {
    // The case that matters most. Saving the settings form writes every field,
    // so if blanks counted as opinions, opening the page once would override a
    // working deployment's environment with nothing.
    expect(overridesFor(BLANK, "chat")).toEqual({})
  })

  it("contributes nothing when there are no settings at all", () => {
    expect(overridesFor(null, "chat")).toEqual({})
    expect(overridesFor(undefined, "chat")).toEqual({})
  })

  it('treats "environment" as deferring, not as a provider', () => {
    expect(overridesFor({ ...BLANK, provider: "environment" }, "chat").provider).toBeUndefined()
  })

  it("passes a chosen provider through", () => {
    expect(overridesFor({ ...BLANK, provider: "google" }, "chat").provider).toBe("google")
  })

  it("picks the model for the purpose asked for", () => {
    const settings = { ...BLANK, chatModel: "gemini-pro", ocrModel: "gemini-vision" }

    expect(overridesFor(settings, "ocr").model).toBe("gemini-vision")
    expect(overridesFor(settings, "chat").model).toBe("gemini-pro")
  })

  it("matches a purpose inside an agent slug", () => {
    // Agents are addressed by slug, so "finance-bot" should get the finance
    // model without every slug being listed.
    const settings = { ...BLANK, financeModel: "finance-model" }

    expect(overridesFor(settings, "finance-bot").model).toBe("finance-model")
    expect(overridesFor(settings, "daily-finance-report").model).toBe("finance-model")
  })

  it("falls back to the chat model for a purpose nobody configured", () => {
    expect(overridesFor({ ...BLANK, chatModel: "general" }, "some-new-agent").model).toBe("general")
  })

  it("uses the fast model when the fast tier is asked for", () => {
    const settings = { ...BLANK, chatModel: "big", fastModel: "small" }

    expect(overridesFor(settings, undefined, "fast").model).toBe("small")
    expect(overridesFor(settings, undefined, "chat").model).toBe("big")
  })

  it("prefers an exact purpose over the tier", () => {
    const settings = { ...BLANK, ocrModel: "vision", fastModel: "small" }

    expect(overridesFor(settings, "ocr", "fast").model).toBe("vision")
  })

  it("treats whitespace as unset and trims what it passes on", () => {
    expect(overridesFor({ ...BLANK, chatModel: "   " }, "chat").model).toBeUndefined()
    expect(overridesFor({ ...BLANK, chatModel: "  gemini-pro  " }, "chat").model).toBe("gemini-pro")
  })

  it("passes a local base url through only when set", () => {
    expect(overridesFor(BLANK, "chat").localBaseUrl).toBeUndefined()
    expect(
      overridesFor({ ...BLANK, localBaseUrl: "http://localhost:1234/v1" }, "chat").localBaseUrl
    ).toBe("http://localhost:1234/v1")
  })

  it("handles partial configuration in either direction", () => {
    // Pick Gemini and leave the model to the environment, or pin a model and
    // leave the provider alone. Both are normal.
    expect(overridesFor({ ...BLANK, provider: "google" }, "chat")).toEqual({ provider: "google" })
    expect(overridesFor({ ...BLANK, chatModel: "x" }, "chat")).toEqual({ model: "x" })
  })

  it("is not case sensitive about the purpose", () => {
    expect(overridesFor({ ...BLANK, ocrModel: "vision" }, "OCR").model).toBe("vision")
  })
})
