/**
 * A stand-in for OpenBot's API server, so its UI can be demonstrated.
 *
 * OpenBot's real server refuses to start without a CopilotKit Intelligence key
 * and licence, and its Bots need Docker. Neither is available on a machine that
 * only wants to show somebody the product. This answers the reads its browser
 * makes with invented data shaped like the real types, so every screen renders.
 *
 * WHAT THIS IS NOT. It runs no model, stores nothing, and decides nothing. The
 * conversations in `data.ts` were written by hand; no Bot produced them, and
 * sending a message here does not reach one. It exists to show the interface,
 * and it should never be pointed at anything that matters.
 *
 *   npm run openbot:demo      # this, on 3011
 *   npm run openbot:demo:ui   # OpenBot's own UI on 3010, proxied here
 *
 * The roster's live socket (`/api/channels/events`) is not served here, so the
 * browser retries it and logs a failure every few seconds. Nothing on screen
 * depends on it — it is what makes a channel light up while a Bot is working,
 * and in a demo nothing is working. Left alone rather than half-built.
 */

import { createServer } from "node:http"

import { agents, channels, skills, transcripts, user } from "./data"

const PORT = Number(process.env.STUB_PORT ?? 3011)

/** Endpoints whose answer never varies. */
const fixed: Record<string, unknown> = {
  "/api/me": { user },
  "/api/capabilities": { mode: "intelligence", durableHistory: true, singleUser: true },

  "/api/agents": { agents },
  "/api/agents/capabilities": {
    capabilities: { computers: true, plugins: true, routines: true, handoff: true },
  },

  "/api/channels": { channels, nextCursor: null },

  // PluginsPage: a bare object, not an envelope.
  "/api/plugins": {
    catalogue: [],
    servers: [],
    skills,
    botsMayCallBack: true,
    redirectUri: null,
  },
  "/api/plugins/connections": { connections: [], redirectUri: null },
  "/api/plugins/servers": { servers: [] },
  "/api/plugins/grants": { grants: [] },
  "/api/plugins/skills": { skills },

  "/api/computers": { computers: [] },
  "/api/computers/policy": { policy: { allowPrivateNetwork: false, rules: [] } },
  "/api/components": { components: [] },
  "/api/components/catalogue": { catalogue: [] },
  "/api/routines": { routines: [] },
  "/api/sandboxed": { sandboxed: [] },
  "/api/sandboxed/published": { published: [] },

  /*
   * What CopilotKit's client reads before it will talk to a runtime at all.
   * `agents` must be an object keyed by id: the client does
   * `Object.entries(info.agents)` unguarded, so omitting it throws inside the
   * library and every screen logs a runtime error even though nothing visible
   * depends on it.
   */
  "/api/copilotkit/info": {
    version: "1.69.0",
    agents: Object.fromEntries(
      agents.map((profile) => [
        profile.id,
        { description: profile.roleDescription, capabilities: [] },
      ])
    ),
  },

  "/api/admin/credentials": { credentials: [] },
  "/api/admin/identity": { providers: [], ssoConfigured: false },
  "/api/admin/people": { people: [user] },
  "/api/threads": { threads: [] },
}

/** Paths carrying an id, matched in order. */
const dynamic: Array<[RegExp, (id: string, url: URL) => unknown | undefined]> = [
  // The transcript a channel restores when somebody opens it.
  [
    /^\/api\/copilotkit\/threads\/([^/]+)\/messages$/,
    (threadId) => ({ messages: transcripts[threadId] ?? [] }),
  ],
  [/^\/api\/channels\/([^/]+)$/, (id) => {
    const channel = channels.find((entry) => entry.id === id)
    return channel ? { channel } : undefined
  }],
  [/^\/api\/agents\/([^/]+)$/, (id) => {
    const profile = agents.find((entry) => entry.id === id)
    return profile ? { agent: profile } : undefined
  }],
  [/^\/api\/agents\/([^/]+)\/handoff$/, () => ({ handoff: { enabled: false, targets: [] } })],
  // What one Bot has been granted. Skills it holds, no callable tools.
  [/^\/api\/plugins\/for\/([^/]+)$/, (agentId) => ({
    tools: [],
    skills: skills
      .filter((skill) => skill.grantedTo.includes(agentId))
      .map(({ slug, title, summary, instructions }) => ({ slug, title, summary, instructions })),
  })],
]

const seen = new Set<string>()

/*
 * `node:http` rather than `Bun.serve`, though Bun runs the UI beside this. Bun's
 * global types redefine `fetch`, and pulling them into this project's tsconfig
 * broke two unrelated files in src/lib/agent — a demo script has no business
 * changing the type environment of the app it sits next to.
 */
createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`)
  const path = url.pathname
  const line = `${request.method} ${path}`

  // Once each: the log is for seeing which reads a screen makes, and a polled
  // endpoint repeated every fifteen seconds buries that.
  if (!seen.has(line)) {
    seen.add(line)
    console.log(line)
  }

  const send = (body: unknown) => {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify(body))
  }

  if (path in fixed) {
    send(fixed[path])
    return
  }

  for (const [pattern, build] of dynamic) {
    const match = pattern.exec(path)
    if (!match) continue
    const body = build(decodeURIComponent(match[1]), url)
    if (body !== undefined) {
      send(body)
      return
    }
  }

  /*
   * Anything unmodelled: an empty, well-formed answer rather than a 404.
   * A screen that asks for something this file has not heard of should render
   * empty, not fall into the error boundary and take the demo with it.
   */
  send({})
}).listen(PORT, () => {
  console.log(`OpenBot demo API on http://localhost:${PORT} — invented data, no model behind it`)
})
