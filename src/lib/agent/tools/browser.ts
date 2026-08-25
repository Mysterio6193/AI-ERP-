import { z } from "zod"

import { parseAllowlist } from "@/lib/agent/browser/allowlist"
import { clickRef, openPage, readPage, typeIntoRef } from "@/lib/agent/browser/actions"
import { getSettings } from "@/lib/settings/service"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * A browser the agent drives, carrying real logins.
 *
 * This is the most powerful thing on the platform and the least contained,
 * because unlike every other tool it acts on systems we do not own and cannot
 * audit. A tool that raises a credit limit is bounded by our own schema. A
 * browser signed into a supplier portal is bounded by whatever that portal
 * lets the account do.
 *
 * Four guards, and as with the settings tools they live in the bodies below
 * rather than in policy metadata, because metadata is a table somebody can
 * edit:
 *
 *   1. Staff only, and never a customer. A customer conversation gets no
 *      browser tools at all — not refusing ones, none, so they never reach a
 *      prompt where an injected instruction could try to use them.
 *   2. Only sites an admin has named. The allowlist is empty by default, which
 *      means closed, so an unconfigured deployment has a browser that goes
 *      nowhere.
 *   3. Off until switched on. `ops.enableAgentBrowser` gates the whole group.
 *   4. Clicking is an approval-gated action in TOOL_POLICY, because a click on
 *      a page we did not write can submit an order, accept terms or move money,
 *      and nothing in the page's own text can be trusted to say which.
 *
 * What the agent is deliberately never given is a way to sign in. There is no
 * tool here that types a password, and `typeIntoPage` refuses password fields.
 * A person signs in once at the keyboard with AGENT_BROWSER_HEADED=true and the
 * session persists; the agent inherits it and never learns the credential.
 */

async function browserAllowlist(): Promise<string[]> {
  try {
    const ops = await getSettings("ops")
    return parseAllowlist((ops as Record<string, unknown>).agentBrowserSites as string | undefined)
  } catch {
    // Settings unreadable means closed, not open.
    return []
  }
}

async function browserEnabled(): Promise<boolean> {
  try {
    const ops = await getSettings("ops")
    return (ops as Record<string, unknown>).enableAgentBrowser === true
  } catch {
    return false
  }
}

function refuse(reason: string) {
  return { ok: false as const, error: reason }
}

const OFF =
  "The agent browser is switched off. An admin turns it on in Settings, and adds the sites it may visit."

export function buildBrowserTools(principal: AgentPrincipal) {
  // Guard 1. Not a refusing tool — no tool, so it never reaches the prompt.
  if (!isStaff(principal)) return {}

  const agentSlug = principal.userId ? `staff-${principal.userId}` : "shared"

  return {
    openPage: defineTool({
      description:
        "Open a web page in the agent's own browser, which stays signed in to sites a person has already logged into. Returns the page as a list of things that can be clicked or typed into, each with a ref. Only works for sites an admin has approved.",
      inputSchema: z.object({
        url: z.string().describe("The full URL to open, including https://"),
      }),
      execute: async ({ url }) => {
        if (!(await browserEnabled())) return refuse(OFF)

        const allowlist = await browserAllowlist()
        return await openPage(agentSlug, url, allowlist)
      },
    }),

    readCurrentPage: defineTool({
      description:
        "Look at the page the browser is already on, again. Use this when a page loads its content after opening, or to see what changed after an action.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!(await browserEnabled())) return refuse(OFF)

        return await readPage(agentSlug, await browserAllowlist())
      },
    }),

    clickOnPage: defineTool({
      description:
        "Click something on the current page, naming it by the ref from the page listing. Returns the page as it looks afterwards.",
      inputSchema: z.object({
        ref: z.string().describe("The ref of the element to click, e.g. 'e4'"),
        what: z
          .string()
          .describe("What you are clicking and why, in plain words - this is what a person approves"),
      }),
      execute: async ({ ref }) => {
        if (!(await browserEnabled())) return refuse(OFF)

        return await clickRef(agentSlug, ref, await browserAllowlist())
      },
    }),

    typeIntoPage: defineTool({
      description:
        "Type into a field on the current page, naming it by its ref. Cannot be used for password fields - a person signs in themselves and the browser keeps the session.",
      inputSchema: z.object({
        ref: z.string().describe("The ref of the field, e.g. 'e1'"),
        text: z.string().describe("What to type"),
      }),
      execute: async ({ ref, text }) => {
        if (!(await browserEnabled())) return refuse(OFF)

        // The password refusal is in typeIntoRef, checked against the field
        // rather than against the text — the text tells you nothing.
        return await typeIntoRef(agentSlug, ref, text, await browserAllowlist())
      },
    }),
  }
}
