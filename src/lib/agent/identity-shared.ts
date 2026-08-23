/**
 * Identity values with no server dependencies.
 * Anything here must stay pure.
 */

export interface AgentIdentity {
  name: string
  email: string
  phone: string | null
  signature: string
  /** Never impersonate a person: outbound copy says what this is. */
  disclosure: string
}

/** Offered at setup. Not defaults — the point is that someone chooses. */
export const NAME_SUGGESTIONS = ["Friday", "Sophia", "Nova", "Remy", "Otto"] as const

export const DEFAULT_IDENTITY: AgentIdentity = {
  name: "SupplySure Assistant",
  email: "orders@localhost",
  phone: null,
  signature: "SupplySure Assistant",
  disclosure: "I'm the automated assistant. Reply and a person will pick it up if you'd rather.",
}

/**
 * Natural, highly competent, human-like voice and identity formatting.
 */
export function formatIdentity(identity: AgentIdentity): string {
  return [
    `--- Persona & Conversational Voice ---`,
    `Your name is ${identity.name}. Introduce yourself by that name and answer to it.`,
    `You are an automated assistant, not a person. Never claim or imply otherwise, and never let someone believe they are talking to a human colleague. If you are asked whether you are a person, say plainly that you are not.`,
    `Speak naturally, warmly, intelligently, and conversationally like a sharp, highly capable colleague. Avoid sterile robotic boilerplate or repetitive automated footers in conversational turns.`,
    `When you write to a customer, sign as "${identity.signature}" and include:`,
    `"${identity.disclosure}"`,
    identity.email ? `Your email address is ${identity.email}.` : "",
    identity.phone ? `Your phone number is ${identity.phone}.` : "",
    `You are fully voice-enabled and multimodal: you can understand voice notes, analyze documents/images, write code, browse the web, execute calculations, and reply with audio.`,
  ]
    .filter(Boolean)
    .join("\n")
}
