import { describe, expect, it } from "vitest"

import { chooseVoice, TRANSCRIPTION_PROMPT } from "./language"

/**
 * Speech was pinned to one Australian English voice and transcription was
 * pinned to English text, so Hindi and Italian were mangled on the way out and
 * silently translated on the way in.
 */

describe("chooseVoice", () => {
  it("reads Devanagari with a Hindi voice", () => {
    expect(chooseVoice("क्या स्टॉक उपलब्ध है").language).toBe("hi-IN")
  })

  it("lets script win over vocabulary", () => {
    // An English product name inside a Hindi sentence does not make it English.
    expect(chooseVoice("Mozzarella का स्टॉक कितना है").language).toBe("hi-IN")
  })

  it("reads Italian with an Italian voice", () => {
    expect(chooseVoice("Vorrei sapere quanto costa la consegna domani").language).toBe("it-IT")
  })

  it("reads romanised Hinglish with an Indian English voice, not a Hindi one", () => {
    // A hi-IN voice reading Latin letters mispronounces them; an Indian
    // English voice handles the mixture the way a person speaking it would.
    const choice = chooseVoice("Bhai kitna stock hai warehouse mein")

    expect(choice.language).toBe("en-IN")
    expect(choice.voice).toContain("en-IN")
  })

  it("leaves ordinary English on the default voice", () => {
    expect(chooseVoice("How much stock do we have in the Sydney warehouse").language).toBe("en-AU")
  })

  it("does not mistake an English sentence for another language on one stray word", () => {
    // "Hai" appears in English text often enough that one hit must not flip a
    // long sentence — misreading English as Hindi is the worse error.
    expect(chooseVoice("Please check whether the Hai Foods order shipped yesterday afternoon").language).toBe("en-AU")
  })

  it("accepts a single marker in a short phrase, where it is decisive", () => {
    expect(chooseVoice("kitna hai").language).toBe("en-IN")
    expect(chooseVoice("quanto costa").language).toBe("it-IT")
  })

  it("falls back cleanly on empty text", () => {
    expect(chooseVoice("").language).toBe("en-AU")
    expect(chooseVoice("   ").voice).toContain("en-AU")
  })

  it("explains its choice", () => {
    expect(chooseVoice("क्या हाल है").reason).toContain("Devanagari")
  })
})

describe("TRANSCRIPTION_PROMPT", () => {
  it("asks for the spoken language rather than English", () => {
    // The old prompt said "into accurate English text", which silently
    // translated. A transcript that changes language cannot be reviewed.
    expect(TRANSCRIPTION_PROMPT).toMatch(/do not translate/i)
    expect(TRANSCRIPTION_PROMPT).not.toMatch(/into accurate English text/i)
  })

  it("names the mixed case explicitly, since it is the easy one to lose", () => {
    expect(TRANSCRIPTION_PROMPT).toMatch(/hinglish/i)
  })
})
