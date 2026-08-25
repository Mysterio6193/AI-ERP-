import { BROWSER_UNTRUSTED, checkBrowseUrl } from "@/lib/agent/browser/allowlist"
import { REF_ATTRIBUTE, renderSnapshot, snapshotPage } from "@/lib/agent/browser/snapshot"
import { getSession } from "@/lib/agent/browser/session"

/**
 * What the agent can actually do with a page.
 *
 * Every one of these returns the page as it looks afterwards, because the
 * alternative — act, then call a separate tool to see what happened — costs a
 * round trip per step and invites the model to assume a click worked. Acting
 * and looking are one operation here.
 *
 * The allowlist is re-checked on navigation rather than once at the start. A
 * page can redirect, and a link the model clicks can go anywhere; a check made
 * only at the front door does not survive either.
 */

export interface BrowseResult {
  ok: boolean
  error?: string
  url?: string
  page?: string
  /** Repeated on every read, never omitted. */
  trust?: string
}

function refused(error: string): BrowseResult {
  return { ok: false, error }
}

/** The page as the model should see it, with the framing that must always accompany it. */
async function describe(page: import("playwright").Page): Promise<BrowseResult> {
  const snapshot = await snapshotPage(page)

  return {
    ok: true,
    url: snapshot.url,
    page: renderSnapshot(snapshot),
    trust: BROWSER_UNTRUSTED,
  }
}

/**
 * Confirm where the browser actually ended up.
 *
 * Checked after the navigation settles rather than before it starts, because
 * the address that matters is the one it arrived at. A redirect chain out of
 * an approved site is exactly the case a pre-check misses.
 */
async function confirmLanding(page: import("playwright").Page, allowlist: string[]): Promise<string | null> {
  const landed = await checkBrowseUrl(page.url(), allowlist)

  if (!landed.allowed) {
    // Taken off the page before anything reads it. A refusal that leaves the
    // browser sitting on the destination has not refused anything.
    await page.goto("about:blank").catch(() => undefined)
    return `That address redirected somewhere not approved: ${landed.reason}`
  }

  return null
}

export async function openPage(
  agentSlug: string,
  url: string,
  allowlist: string[]
): Promise<BrowseResult> {
  const verdict = await checkBrowseUrl(url, allowlist)
  if (!verdict.allowed) return refused(verdict.reason ?? "That address cannot be opened.")

  try {
    const { page } = await getSession(agentSlug)
    await page.goto(url, { waitUntil: "domcontentloaded" })

    const drifted = await confirmLanding(page, allowlist)
    if (drifted) return refused(drifted)

    return await describe(page)
  } catch (error) {
    return refused(`Could not open that page: ${error instanceof Error ? error.message : "unknown error"}`)
  }
}

/** Look again without doing anything — for a page that loads its content late. */
export async function readPage(agentSlug: string, allowlist: string[]): Promise<BrowseResult> {
  try {
    const { page } = await getSession(agentSlug)

    if (page.url() === "about:blank") {
      return refused("The browser is not on a page yet. Open one first.")
    }

    const drifted = await confirmLanding(page, allowlist)
    if (drifted) return refused(drifted)

    return await describe(page)
  } catch (error) {
    return refused(`Could not read the page: ${error instanceof Error ? error.message : "unknown error"}`)
  }
}

function locate(page: import("playwright").Page, ref: string) {
  // Refs are ours and are assigned in the snapshot, so this is an exact match
  // rather than a guess at a selector the model invented.
  return page.locator(`[${REF_ATTRIBUTE}="${ref.replace(/"/g, "")}"]`)
}

export async function clickRef(
  agentSlug: string,
  ref: string,
  allowlist: string[]
): Promise<BrowseResult> {
  try {
    const { page } = await getSession(agentSlug)
    const target = locate(page, ref)

    if ((await target.count()) === 0) {
      return refused(
        `There is nothing called "${ref}" on this page any more. Read the page again — the refs change when it does.`
      )
    }

    await target.first().click()

    // A click is the most likely thing to navigate, so settle before reading.
    await page.waitForLoadState("domcontentloaded").catch(() => undefined)

    const drifted = await confirmLanding(page, allowlist)
    if (drifted) return refused(drifted)

    return await describe(page)
  } catch (error) {
    return refused(`Could not click that: ${error instanceof Error ? error.message : "unknown error"}`)
  }
}

export async function typeIntoRef(
  agentSlug: string,
  ref: string,
  text: string,
  allowlist: string[]
): Promise<BrowseResult> {
  try {
    const { page } = await getSession(agentSlug)
    const target = locate(page, ref)

    if ((await target.count()) === 0) {
      return refused(`There is nothing called "${ref}" on this page any more. Read the page again.`)
    }

    /**
     * The agent never fills a password field.
     *
     * Checked here, against the element, rather than against the text being
     * typed — the text tells you nothing, since a real password looks like any
     * other string, while the field says exactly what it is. A person signs in
     * once with the browser visible and the session persists, so the agent
     * never needs the credential and never sees it.
     */
    const type = ((await target.first().getAttribute("type")) ?? "").toLowerCase()

    if (type === "password") {
      return refused(
        "I will not type into a password field. Sign in yourself once with the browser visible " +
          "(AGENT_BROWSER_HEADED=true) and I will use the session afterwards."
      )
    }

    await target.first().fill(text)

    const drifted = await confirmLanding(page, allowlist)
    if (drifted) return refused(drifted)

    return await describe(page)
  } catch (error) {
    return refused(`Could not type into that: ${error instanceof Error ? error.message : "unknown error"}`)
  }
}
