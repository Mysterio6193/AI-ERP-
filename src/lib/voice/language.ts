/**
 * Choosing a voice that suits the words.
 *
 * Speech was pinned to `en-AU-NatashaNeural` with `lang: "en-AU"`, and nothing
 * ever passed anything else — so an Italian or Hindi reply was read aloud by an
 * Australian English voice, which mangles it. Transcription had the mirror
 * problem: its prompt asked for "accurate English text", so speaking Hindi got
 * you an English translation rather than what you actually said.
 */

export type SpokenLanguage = "en-AU" | "en-IN" | "hi-IN" | "it-IT"

export interface VoiceChoice {
  language: SpokenLanguage
  voice: string
  /** Why this voice, so a surprising choice can be understood. */
  reason: string
}

/** Edge Neural voices, one per language we can actually speak well. */
export const VOICES: Record<SpokenLanguage, string> = {
  "en-AU": "en-AU-NatashaNeural",
  "en-IN": "en-IN-NeerjaNeural",
  "hi-IN": "hi-IN-SwaraNeural",
  "it-IT": "it-IT-ElsaNeural",
}

const DEVANAGARI = /[ऀ-ॿ]/

/**
 * Hindi words that survive into romanised Hinglish.
 *
 * Deliberately short and unambiguous — words like "hai", "nahi" and "kitna"
 * that do not collide with English. A longer list catches more Hinglish and
 * starts misreading English sentences as Hindi, which is the worse error.
 */
const HINGLISH_MARKERS = [
  "hai", "hain", "nahi", "nahin", "kya", "kitna", "kitne", "kaise", "karo",
  "kar", "raha", "rahi", "mera", "mere", "aap", "abhi", "chahiye", "bhej",
  "bhejo", "dekho", "batao", "thoda", "acha", "accha", "haan", "theek",
]

/** Italian words distinctive enough not to appear in an English sentence. */
const ITALIAN_MARKERS = [
  "sono", "grazie", "prego", "quanto", "perché", "perche", "domani", "oggi",
  "consegna", "ordine", "fattura", "magazzino", "cliente", "questo", "questa",
  "vorrei", "buongiorno", "arrivederci", "però", "pero", "anche", "molto",
]

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function markerHits(words: string[], markers: string[]): number {
  return words.filter((word) => markers.includes(word)).length
}

/**
 * Pick the voice that should read this text.
 *
 * Script wins over vocabulary: Devanagari is Hindi whatever else is in the
 * sentence. Romanised Hinglish is deliberately *not* sent to the Hindi voice —
 * a hi-IN voice reading Latin letters mispronounces them, while an Indian
 * English voice handles the mixture the way a person would.
 */
export function chooseVoice(text: string, fallback: SpokenLanguage = "en-AU"): VoiceChoice {
  const trimmed = (text || "").trim()

  if (!trimmed) {
    return { language: fallback, voice: VOICES[fallback], reason: "No text; using the default voice." }
  }

  if (DEVANAGARI.test(trimmed)) {
    return { language: "hi-IN", voice: VOICES["hi-IN"], reason: "Devanagari script." }
  }

  const words = wordsOf(trimmed)
  const hinglish = markerHits(words, HINGLISH_MARKERS)
  const italian = markerHits(words, ITALIAN_MARKERS)

  if (italian >= 2 || (italian === 1 && words.length <= 6)) {
    return { language: "it-IT", voice: VOICES["it-IT"], reason: "Italian vocabulary." }
  }

  if (hinglish >= 2 || (hinglish === 1 && words.length <= 6)) {
    // Latin-script Hindi-English mixture. An Indian English voice reads it
    // closer to how it is spoken than either a Hindi or an Australian voice.
    return { language: "en-IN", voice: VOICES["en-IN"], reason: "Romanised Hinglish." }
  }

  return { language: fallback, voice: VOICES[fallback], reason: "No other language detected." }
}

/**
 * The instruction the transcriber is given.
 *
 * It used to demand English, which silently translated whatever was said. A
 * transcript that quietly changes language is worse than a rough one: someone
 * reviewing what a customer asked for cannot tell it was reworded.
 */
export const TRANSCRIPTION_PROMPT = `You are an accurate voice transcription system for SupplySure OS.

Transcribe the spoken audio in the language it was actually spoken in. Do not translate.

- Hindi spoken in Devanagari stays in Devanagari.
- Hindi-English mixed speech (Hinglish) stays mixed, written the way it was said.
- Italian stays in Italian.
- English stays in English.

Keep product names, business names and numbers exactly as spoken.
Do not add any preamble, metadata, or commentary. Output ONLY the raw transcript.`
