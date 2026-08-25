import path from "node:path"
import type { BrowserContext, Page } from "playwright"

/**
 * The browser the agent drives, and how long it is allowed to live.
 *
 * A persistent profile is the whole point. A fresh context per turn means
 * logging in every turn, which for a supplier portal with two-factor is not a
 * workflow anybody will use. `launchPersistentContext` keeps cookies and local
 * storage in a directory on disk, so a person signs in once — by hand, at the
 * keyboard — and the agent inherits the session afterwards.
 *
 * That is also the risk, stated plainly: this directory is a live credential.
 * Anything that can read it can act as whoever signed in. It lives outside the
 * repo, one directory per agent so a bot restricted to freight cannot reuse
 * the accounting session, and it never goes near git.
 *
 * The profile idea and the eviction shape come from OpenBot's
 * `agent-computer/src/profiles.ts` and `browser-eviction.ts` (MIT); see
 * docs/THIRD_PARTY.md.
 */

/** Where profiles live. Outside the repo, and never committed. */
export function profileRoot(): string {
  return process.env.AGENT_BROWSER_PROFILE_DIR || path.join(process.cwd(), ".browser-profiles")
}

/**
 * One directory per agent.
 *
 * The slug is sanitised rather than trusted: it reaches a filesystem path, and
 * an agent slug containing `../` would otherwise choose where the profile is
 * written.
 */
export function profilePathFor(agentSlug: string): string {
  const safe = agentSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    // Trimmed, or a slug of nothing but separators becomes "-" — a real
    // directory name, so the fallback below would never run.
    .replace(/^-|-$/g, "")
    .slice(0, 64)

  return path.join(profileRoot(), safe || "default")
}

/** Close a browser left idle this long. */
export const IDLE_TIMEOUT_MS = 5 * 60_000

/** Never hold more than this many browsers open at once. */
export const MAX_SESSIONS = 3

interface Session {
  context: BrowserContext
  page: Page
  agentSlug: string
  lastUsedAt: number
}

const sessions = new Map<string, Session>()

/**
 * Playwright is imported here rather than at module scope.
 *
 * Importing it costs a lot and pulls in native bindings, and almost every
 * request to this application never touches a browser. A module-scope import
 * would make every cold start pay for a feature most of them do not use.
 */
async function chromium() {
  const { chromium: browser } = await import("playwright")
  return browser
}

/**
 * The agent's browser for this agent, started if it is not already running.
 *
 * Headless by default. `AGENT_BROWSER_HEADED=true` shows the window, which is
 * how a person signs in to a portal the first time — the agent cannot be given
 * the password, so somebody has to type it.
 */
export async function getSession(agentSlug: string): Promise<Session> {
  const existing = sessions.get(agentSlug)

  if (existing) {
    existing.lastUsedAt = Date.now()
    return existing
  }

  await evictIdle()

  if (sessions.size >= MAX_SESSIONS) {
    // Oldest first, so a long-running job is not evicted by a passing one.
    const oldest = [...sessions.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0]
    if (oldest) await closeSession(oldest.agentSlug)
  }

  const browser = await chromium()
  const context = await browser.launchPersistentContext(profilePathFor(agentSlug), {
    headless: process.env.AGENT_BROWSER_HEADED !== "true",
    viewport: { width: 1280, height: 900 },
    // Downloads are refused rather than silently landing on the server's disk.
    acceptDownloads: false,
  })

  const page = context.pages()[0] ?? (await context.newPage())

  // A page that hangs must not hang the turn; the agent's own deadline is a
  // backstop, not a substitute for this.
  page.setDefaultTimeout(20_000)
  page.setDefaultNavigationTimeout(30_000)

  const session: Session = { context, page, agentSlug, lastUsedAt: Date.now() }
  sessions.set(agentSlug, session)

  return session
}

export async function closeSession(agentSlug: string): Promise<void> {
  const session = sessions.get(agentSlug)
  if (!session) return

  sessions.delete(agentSlug)

  // A browser that will not close must not stop the caller; the process is
  // reaped either way.
  await session.context.close().catch(() => undefined)
}

/** Shut anything nobody has used recently. A browser is expensive to leave running. */
export async function evictIdle(now = Date.now()): Promise<number> {
  const stale = [...sessions.values()].filter((s) => now - s.lastUsedAt > IDLE_TIMEOUT_MS)

  for (const session of stale) {
    await closeSession(session.agentSlug)
  }

  return stale.length
}

/** For shutdown, and for tests that must not leave a browser behind. */
export async function closeAllSessions(): Promise<void> {
  await Promise.all([...sessions.keys()].map((slug) => closeSession(slug)))
}

export function openSessionCount(): number {
  return sessions.size
}
