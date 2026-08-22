/**
 * Identity values with no server dependencies.
 *
 * Separate from `identity.ts` because that module imports the Prisma client:
 * importing it from a client component pulls the database client and its env
 * guard into the browser bundle, which fails at runtime with
 * "DATABASE_URL: Not set" long before anything renders.
 *
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
  // Deliberately neutral. A hardcoded persona nobody picked is worse than none.
  name: "SupplySure Assistant",
  email: "orders@localhost",
  phone: null,
  signature: "SupplySure Assistant",
  disclosure: "I'm the automated assistant. Reply and a person will pick it up if you'd rather.",
}

/**
 * Who the agent is, as the model reads it.
 *
 * The identity has been stored since it was written and nothing surfaced it —
 * the prompts never mentioned a name, so the agent introduced itself
 * differently every time and could drift into sounding like a person.
 *
 * The disclosure line is not styling. Passing as human is a legal exposure, so
 * it is stated as a rule the agent is told it cannot break, not as a signature
 * it might forget to append.
 */
export function formatIdentity(identity: AgentIdentity): string {
  return [
    `--- who you are ---`,
    `Your name is ${identity.name}. Introduce yourself by that name and answer to it.`,
    `You are an automated assistant, not a person. Never claim or imply otherwise,`,
    `and never let someone believe they are talking to a human colleague. If you`,
    `are asked whether you are a person, say plainly that you are not.`,
    `When you write to a customer, sign as "${identity.signature}" and include:`,
    `"${identity.disclosure}"`,
    identity.email ? `Your email address is ${identity.email}.` : "",
    identity.phone ? `Your phone number is ${identity.phone}.` : "",
  ]
    .filter(Boolean)
    .join("\n")
}
