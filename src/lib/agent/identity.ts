import { db } from "@/lib/db"

/**
 * The agent's own identity.
 *
 * Giving the agent a real User row rather than letting it act as whoever
 * triggered it is what makes autonomous work attributable: an order raised by a
 * scheduled run, an email answered at 3am, a note logged from a Telegram
 * message all point at the same actor, and `AuditLog.userId`,
 * `CrmTask.assignedToId` and `Activity.userId` all resolve to something real.
 *
 * It also gives the agent somewhere to be reached: its own address and number,
 * so customers can email or message "the office" and land here.
 */

const SETTING_KEY = "agent.identity"

export interface AgentIdentity {
  name: string
  email: string
  phone: string | null
  signature: string
  /** Never impersonate a person: outbound copy says what this is. */
  disclosure: string
}

export const DEFAULT_IDENTITY: AgentIdentity = {
  name: "SupplySure Assistant",
  email: "orders@localhost",
  phone: null,
  signature: "SupplySure Assistant",
  disclosure: "I'm the automated assistant. Reply and a person will pick it up if you'd rather.",
}

export async function getAgentIdentity(): Promise<AgentIdentity> {
  try {
    const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } })

    if (!setting) {
      return {
        ...DEFAULT_IDENTITY,
        email: process.env.AGENT_EMAIL || DEFAULT_IDENTITY.email,
        phone: process.env.AGENT_PHONE || null,
      }
    }

    return { ...DEFAULT_IDENTITY, ...(JSON.parse(setting.value) as Partial<AgentIdentity>) }
  } catch {
    return DEFAULT_IDENTITY
  }
}

export async function saveAgentIdentity(patch: Partial<AgentIdentity>) {
  const next = { ...(await getAgentIdentity()), ...patch }

  await db.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(next), category: "agent" },
    update: { value: JSON.stringify(next) },
  })

  // Keep the User row in step so attribution shows the current name.
  const user = await ensureAgentUser()
  if (user.name !== next.name || user.email !== next.email) {
    await db.user
      .update({ where: { id: user.id }, data: { name: next.name, email: next.email } })
      .catch(() => undefined)
  }

  return next
}

/**
 * Returns the agent's User row, creating it on first use. The password is
 * random and never surfaced - this account exists to be referenced, not to be
 * signed into.
 */
export async function ensureAgentUser() {
  const identity = await getAgentIdentity()

  const existing = await db.user.findFirst({
    where: { role: "agent" },
    select: { id: true, name: true, email: true, role: true, status: true },
  })

  if (existing) {
    return existing
  }

  const company = await db.company.findFirst({ select: { id: true } })

  return db.user.create({
    data: {
      name: identity.name,
      email: identity.email,
      // Not a login. Random, unusable, and never returned anywhere.
      password: `agent:${crypto.randomUUID()}`,
      role: "agent",
      status: "active",
      companyId: company?.id,
    },
    select: { id: true, name: true, email: true, role: true, status: true },
  })
}

/** Appends the disclosure so outbound copy never reads as a person. */
export async function signOutbound(message: string) {
  const identity = await getAgentIdentity()
  return `${message}\n\n— ${identity.signature}\n${identity.disclosure}`
}
