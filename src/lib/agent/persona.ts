import type { SettingsOf } from "@/lib/settings/registry"

/**
 * Turning the persona settings into instructions the model actually reads.
 *
 * These settings were editable in the UI and read by nothing: an admin could
 * choose a tone and write standing instructions for the business, save them,
 * and the agent would behave exactly as before.
 *
 * The agent's *name* is deliberately not here. It belongs to the identity
 * record, which also owns the email, phone and customer-facing signature; a
 * second copy would let Settings disagree with the name the agent signs
 * emails with.
 */

export type PersonaSettings = SettingsOf<"agentPersona">

/** How each tone should change the writing, rather than just being named. */
const TONE_GUIDANCE: Record<PersonaSettings["tone"], string> = {
  professional:
    "Write in plain professional English. Full sentences, no slang, no exclamation marks.",
  concise:
    "Be brief. Lead with the answer, give the shortest context that makes it usable, and stop. No preamble, and no summary of what you just said.",
  friendly:
    "Write warmly and conversationally, as a helpful colleague would. Stay accurate: warmth never means softening a bad number.",
  technical:
    "Be precise and specific. Use the exact field, document and product names rather than paraphrases, and give figures rather than adjectives.",
}

/**
 * The persona block, or an empty string when there is nothing to say.
 *
 * Returns "" rather than a heading with nothing under it: an empty section in
 * the prompt is tokens spent telling the model nothing.
 */
export function formatPersona(persona: PersonaSettings | null | undefined): string {
  if (!persona) return ""

  const lines: string[] = []

  const tone = TONE_GUIDANCE[persona.tone]
  if (tone) lines.push(tone)

  const custom = (persona.customSystemInstructions || "").trim()
  if (custom) {
    // Attributed to the business so the model reads it as a standing
    // instruction from the operator rather than part of the platform's prompt.
    lines.push(`Standing instructions from this business:\n${custom}`)
  }

  if (!lines.length) return ""

  return ["--- How this business wants you to work ---", ...lines].join("\n")
}
