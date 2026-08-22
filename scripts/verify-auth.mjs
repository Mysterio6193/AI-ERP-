#!/usr/bin/env node
/**
 * Auth verification: every staff API route must refuse anonymous callers AND
 * callers presenting a junk `Authorization: Bearer` header.
 *
 * Skips paths that are public by design (webhooks with their own signature
 * checks, first-run setup, the customer/driver namespaces that validate their
 * own tokens, and the deliberate public branding read).
 *
 * Usage: BASE_URL=http://localhost:3100 node scripts/verify-auth.mjs
 * Run the server with AUTH_BYPASS unset, or every check trivially passes.
 */
import { readdirSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"

const BASE = process.env.BASE_URL || "http://localhost:3000"
const ROOT = join(process.cwd(), "src", "app", "api")

const PUBLIC_PATHS = new Set([
  "/api/admin/session",
  "/api/admin/setup",
  "/api/health",
  "/api/stripe/webhook",
  "/api/agent/telegram",
  "/api/agent/email",
  "/api/cron/agents", // CRON_SECRET-gated, not session-gated
])

const PUBLIC_PREFIXES = ["/api/user/", "/api/order/", "/api/driver/"]

/** Scaffold hello-world stub; sits outside the /api/ prefix match. */
const SKIP_PATHS = new Set(["/api"])

function collect(dir, prefix = "") {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      const nested = entry.startsWith("[")
        ? prefix // dynamic segment: probe the collection route, not every id
        : `${prefix}/${entry}`
      out.push(...collect(full, nested))
    } else if (entry === "route.ts") {
      out.push(prefix || "/api")
    }
  }
  return out
}

const routes = [
  ...new Set(collect(ROOT, "/api")),
].filter((path) => {
  if (SKIP_PATHS.has(path)) return false
  if (PUBLIC_PATHS.has(path)) return false
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return false
  if (path === "/api/settings/company") return false // public GET by design
  return true
})

let failures = 0
async function probe(path, label, headers, method = "GET") {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(method === "POST" ? { "content-type": "application/json" } : {}), ...headers },
      body: method === "POST" ? "{}" : undefined,
      redirect: "manual",
    })
    return res.status
  } catch (error) {
    console.log(`FAIL ${path} (${label}): request error ${error.message}`)
    failures++
    return null
  }
}

for (const path of routes) {
  for (const [label, headers] of [
    ["anonymous", {}],
    ["junk bearer", { authorization: "Bearer junk-token-not-real" }],
  ]) {
    let status = await probe(path, label, headers)

    // 405 = the route has no GET handler; re-probe with POST so we exercise
    // the real handler chain rather than Next's method router.
    if (status === 405) {
      status = await probe(path, label, headers, "POST")
    }

    // 401 = rejected. Anything else means the gate let the request through.
    if (status !== null && status !== 401) {
      console.log(`FAIL ${path} (${label}): expected 401, got ${status}`)
      failures++
    }
  }
}

console.log(`\n${routes.length} routes x 2 probes: ${failures} failure(s)`)
process.exit(failures ? 1 : 0)
