/**
 * The world the demo shows.
 *
 * Kept apart from the server so the things a demo actually changes — who the
 * coworkers are, what they have been asked, what they said back — are edited in
 * one file without touching any routing.
 *
 * Everything here is invented. Nothing in it came out of a model.
 */

export const user = {
  id: "preview-user",
  email: "you@example.com",
  name: "Preview User",
  image: null,
  role: "admin" as const,
  onboarding: null,
}

/** Shaped as AgentProfile in apps/openbot/app/src/lib/agents/queries.ts. */
export interface Agent {
  id: string
  name: string
  title: string
  roleDescription: string
  avatarSeed: string
  visibility: "public" | "private"
  endpoint: string | null
  builtIn: boolean
  hasAuth: boolean
  hasCallbackToken: boolean
  hidden: boolean
  systemOwned: boolean
  canManage: boolean
  mine: boolean
}

function agent(id: string, name: string, title: string, roleDescription: string): Agent {
  return {
    id,
    name,
    title,
    roleDescription,
    avatarSeed: id,
    visibility: "public",
    endpoint: null,
    builtIn: true,
    hasAuth: false,
    hasCallbackToken: false,
    hidden: false,
    systemOwned: true,
    canManage: true,
    mine: false,
  }
}

export const agents: Agent[] = [
  agent(
    "general-assistant",
    "General Assistant",
    "Everyday work",
    "Drafting, research, and the questions that come up during the day."
  ),
  agent(
    "knowledge",
    "Knowledge",
    "Company questions",
    "Answers from your own documents, and shows the source it read."
  ),
  agent(
    "risk-analyst",
    "Risk Analyst",
    "Risk and compliance",
    "Reviews an exposure and says what it would need before signing off."
  ),
  agent(
    "supplier-desk",
    "Supplier Desk",
    "Purchasing",
    "Chases quotes, compares them, and drafts the purchase order."
  ),
  agent(
    "collections",
    "Collections",
    "Receivables",
    "Works the overdue ledger and writes the chase email a human sends."
  ),
]

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string; tool?: { name: string; args: Record<string, unknown> } }

interface ChannelSeed {
  agentId: string
  /** Minutes ago the last thing was said. Null for a channel nobody has used. */
  lastMinutesAgo: number | null
  transcript: Turn[]
}

/**
 * The conversations. Written to show the product's shape — a turn that browses,
 * a turn that asks before acting — rather than to be impressive.
 */
const seeds: ChannelSeed[] = [
  {
    agentId: "general-assistant",
    lastMinutesAgo: 42,
    transcript: [
      {
        role: "user",
        content:
          "The View on Mount Glorious asked for a quote on 9-pack margherita. What did we charge them last time?",
      },
      {
        role: "assistant",
        tool: { name: "search_orders", args: { customer: "The View on Mount Glorious", limit: 5 } },
      },
      {
        role: "assistant",
        content:
          "They have not ordered the 9-pack before. Their last three orders were all 12\" bases, most recently 40 cartons in June at $38.50 a carton on a 30-day account.\n\nThe 9-pack list price is $52.00. Applying the same 8% they get on bases would put it at $47.85. Do you want me to draft the quote at that, or hold list?",
      },
      { role: "user", content: "Draft it at the discounted price." },
      {
        role: "assistant",
        content:
          "Drafted and left in your outbox — quote Q-2291, 9-pack margherita at $47.85 a carton, valid 30 days, addressed to Katharina Haire.\n\nI have not sent it. It needs your name on it before it goes.",
      },
    ],
  },
  {
    agentId: "knowledge",
    lastMinutesAgo: 130,
    transcript: [
      { role: "user", content: "What is our allergen policy for shared production lines?" },
      {
        role: "assistant",
        tool: { name: "search_documents", args: { query: "allergen shared production line policy" } },
      },
      {
        role: "assistant",
        content:
          "Three documents mention it. The current one is the HACCP plan, revision 7, dated March 2026:\n\n- A shared line carrying a declared allergen needs a full wet clean and a documented swab before a non-allergen run.\n- The swab result goes on the batch record, not just in the cleaning log.\n- Any run that cannot show a swab is labelled \"may contain\" regardless of recipe.\n\nThe two older documents say the same thing with a verbal sign-off instead of a swab. They were superseded in March.",
      },
    ],
  },
  {
    agentId: "risk-analyst",
    lastMinutesAgo: 20,
    transcript: [
      {
        role: "user",
        content: "Bidfood want to move to 60-day terms across the group. Anything I should worry about?",
      },
      {
        role: "assistant",
        content:
          "Two things.\n\nThey are three entities on one ABN, and the credit limit is set per entity, so 60 days across the group is roughly $340k of exposure at their current run rate rather than the $120k any single limit implies.\n\nTheir payment history is clean — 41 invoices, none past due. But the last credit check on file is from 2024.\n\nI would want a fresh check before agreeing, and a group limit rather than three. Want me to draft the request?",
      },
    ],
  },
  {
    agentId: "supplier-desk",
    lastMinutesAgo: 300,
    transcript: [
      { role: "user", content: "We are short on 10\" bases. Who can get them to us this week?" },
      {
        role: "assistant",
        tool: { name: "browse", args: { url: "https://supplier-portal.example.com/availability" } },
      },
      {
        role: "assistant",
        content:
          "Two of the three can. Gema Group show 180 cartons at $31.20, delivered Thursday. Global Food & Wine show 120 at $29.80 but their earliest is Monday week.\n\nOn the shortfall you gave me you need 150 by Friday, so only Gema clears it. Shall I raise the PO?",
      },
    ],
  },
  {
    agentId: "collections",
    lastMinutesAgo: null,
    transcript: [],
  },
]

const now = Date.now()

/** Shaped as ChannelSummary in apps/openbot/app/src/lib/channels/queries.ts. */
export const channels = seeds.map((seed, index) => {
  const profile = agents.find((entry) => entry.id === seed.agentId)
  const lastAssistant = [...seed.transcript].reverse().find((turn) => turn.role === "assistant" && turn.content)

  return {
    id: `channel-${seed.agentId}`,
    name: profile?.name ?? seed.agentId,
    agentIds: [seed.agentId],
    threadId: `thread-${seed.agentId}`,
    active: true,
    lastMessage: lastAssistant && "content" in lastAssistant ? (lastAssistant.content ?? null) : null,
    lastMessageAt:
      seed.lastMinutesAgo === null ? null : new Date(now - seed.lastMinutesAgo * 60_000).toISOString(),
    lastMessageAgentId: seed.lastMinutesAgo === null ? null : seed.agentId,
    createdAt: new Date(now - (index + 2) * 86_400_000).toISOString(),
    pinned: false,
    lastReadAt: null,
  }
})

/**
 * Transcripts by thread id, in the shape `@ag-ui/core`'s MessageSchema accepts.
 *
 * A tool call is written as `{id, type: "function", function: {name, arguments}}`
 * — the AG-UI dialect, not the history store's `{id, name, args}` — because the
 * reader translates the latter and only accepts the former unchanged.
 */
export const transcripts: Record<string, unknown[]> = Object.fromEntries(
  seeds.map((seed) => {
    const messages: unknown[] = []
    let counter = 0

    for (const turn of seed.transcript) {
      counter += 1
      const id = `${seed.agentId}-${counter}`

      if (turn.role === "user") {
        messages.push({ id, role: "user", content: turn.content })
        continue
      }

      if (turn.tool) {
        const callId = `${id}-call`
        messages.push({
          id,
          role: "assistant",
          toolCalls: [
            {
              id: callId,
              type: "function",
              function: { name: turn.tool.name, arguments: JSON.stringify(turn.tool.args) },
            },
          ],
        })
        messages.push({
          id: `${id}-result`,
          role: "tool",
          toolCallId: callId,
          content: "(demo) tool result",
        })
        continue
      }

      messages.push({ id, role: "assistant", content: turn.content })
    }

    return [`thread-${seed.agentId}`, messages]
  })
)

export const skills = [
  {
    id: "skill-quote",
    slug: "draft-a-quote",
    ownerUserId: null,
    title: "Draft a quote",
    summary: "House rules for pricing a quote: which discount applies to whom, and what needs a human.",
    instructions:
      "Look up what this customer paid last. Apply their standing discount band. Anything above 10% off list is drafted, never sent.",
    origin: "deployment",
    installedBy: null,
    grantedTo: ["general-assistant", "supplier-desk"],
    tools: [],
  },
  {
    id: "skill-chase",
    slug: "chase-an-invoice",
    ownerUserId: null,
    title: "Chase an invoice",
    summary: "The escalation ladder for overdue receivables, and the wording at each rung.",
    instructions:
      "Day 7 is a reminder. Day 21 names the amount and the terms. Day 45 goes to the account owner, not the contact. Never threaten.",
    origin: "deployment",
    installedBy: null,
    grantedTo: ["collections"],
    tools: [],
  },
  {
    id: "skill-allergen",
    slug: "allergen-check",
    ownerUserId: null,
    title: "Allergen check",
    summary: "What to confirm before a shared line runs a non-allergen batch.",
    instructions:
      "Confirm the wet clean is logged and a swab result is on the batch record. No swab means the batch is labelled may-contain.",
    origin: "deployment",
    installedBy: null,
    grantedTo: ["knowledge", "risk-analyst"],
    tools: [],
  },
]
