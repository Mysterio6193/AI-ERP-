import { describe, expect, it } from "vitest"

import { modelSuitsProvider } from "./model"

/**
 * The assistant answered nothing and the log showed a 404 from
 * `generativelanguage.googleapis.com/v1beta/z-ai/glm-5.2:free`. A gateway model
 * id had been chosen while Google was the configured provider, and the id was
 * passed straight through because it contained a slash.
 */

describe("modelSuitsProvider", () => {
  it("accepts a Gemini id for Google", () => {
    // Gemini ids never contain a slash.
    expect(modelSuitsProvider("gemini-3.1-flash-lite", "google")).toBe(true)
    expect(modelSuitsProvider("gemini-2.5-flash", "google")).toBe(true)
  })

  it("rejects a gateway id for Google", () => {
    // These are the ids that produced the 404.
    expect(modelSuitsProvider("z-ai/glm-5.2:free", "google")).toBe(false)
    expect(modelSuitsProvider("nvidia/nemotron-3-ultra-550b-a55b:free", "google")).toBe(false)
  })

  it("lets a gateway take anything, since that is what a gateway is for", () => {
    expect(modelSuitsProvider("z-ai/glm-5.2:free", "openrouter")).toBe(true)
    expect(modelSuitsProvider("gemini-3.1-flash-lite", "openrouter")).toBe(true)
    expect(modelSuitsProvider("anything", "local")).toBe(true)
  })
})
