/**
 * Phase 0 probe: prove the configured model can actually drive the agent
 * runtime's tools before autonomy is turned up.
 *
 * Works against LOCAL inference (Ollama/LM Studio/vLLM — any OpenAI-compatible
 * server) or a CLOUD provider through the Vercel AI Gateway, whichever you
 * point it at. Provider resolution mirrors src/lib/agent/model.ts.
 *
 * What it asserts (against a real model, writing real rows to the dev DB):
 *   1. A read tool returns well-formed arguments (searchProducts).
 *   2. A multi-step turn chains two read tools (searchProducts → quoteBasket).
 *   3. An over-threshold write PAUSES: an AgentProposal row is created and no
 *      order is written.
 *   4. A narrow agent with a 6-tool allowlist completes a task using only
 *      allowed tools.
 *   5. Prompt tokens per turn are reported for the full registry vs narrow,
 *      from AgentRun.promptTokens — the number that decides whether per-agent
 *      allowlists are optional or required on local hardware.
 *
 * Usage:
 *   bun scripts/agent-probe.ts [--provider local|gateway|auto] \
 *     [--base-url http://localhost:11434/v1] [--model <id>] [--keep]
 *
 *   local    — needs a reachable OpenAI-compatible server (--base-url)
 *   gateway  — needs AI_GATEWAY_API_KEY in the environment (.env works);
 *              --model is a "vendor/model" string like anthropic/claude-sonnet-5
 *   auto     — gateway when AI_GATEWAY_API_KEY is set, otherwise local
 *
 * --keep preserves the temporary narrow agent definition (default: deleted).
 */
import { randomUUID } from "crypto"

// ── argv → env, BEFORE any lib import reads them ────────────────────────────
const args = process.argv.slice(2)
function argValue(flag: string) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (flag: string) => args.includes(flag)
const keep = has("--keep")

const providerArg = (argValue("--provider") || "auto").toLowerCase()
if (!["auto", "local", "gateway", "openrouter"].includes(providerArg)) {
  console.error(`--provider must be auto | local | gateway | openrouter (got "${providerArg}")`)
  process.exit(2)
}

const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim()
const openrouterKey = process.env.OPENROUTER_API_KEY?.trim()

// `auto` used to mean "gateway if a gateway key exists, else local", which sent
// a fully-configured OpenRouter setup at a local server that is not running.
const resolvedProvider =
  providerArg === "auto"
    ? openrouterKey
      ? "openrouter"
      : gatewayKey
        ? "gateway"
        : "local"
    : providerArg

if (resolvedProvider === "openrouter") {
  process.env.AGENT_PROVIDER = "openrouter"
  const model = argValue("--model")
  if (model) process.env.AGENT_MODEL = model
} else if (resolvedProvider === "local") {
  process.env.AGENT_PROVIDER = "local"
  const baseUrl = argValue("--base-url")
  if (baseUrl) process.env.AGENT_LOCAL_BASE_URL = baseUrl
  const model = argValue("--model")
  if (model) process.env.AGENT_LOCAL_MODEL = model
} else {
  process.env.AGENT_PROVIDER = "gateway"
  const model = argValue("--model")
  if (model) process.env.AGENT_MODEL = model
}

const { db } = await import("../src/lib/db")
const { runAgentTurn } = await import("../src/lib/agent/runtime")
const { resolveStaffPrincipal } = await import("../src/lib/agent/context")
const { getAgentRuntimeInfo, getModelId } = await import("../src/lib/agent/model")

const runtime = getAgentRuntimeInfo()
const MODEL = getModelId("chat")
const STAMP = Date.now()
const CHANNEL = "probe"
const THREAD_KEY = `probe-${STAMP}-${randomUUID().slice(0, 8)}`

let failures = 0
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

async function toolCallsFor(runId: string) {
  const rows = await db.agentMessage.findMany({
    where: { runId },
    select: { rawJson: true },
    orderBy: { createdAt: "asc" },
  })
  const calls: Array<{ name: string; input: Record<string, unknown> }> = []
  for (const row of rows) {
    try {
      const message = JSON.parse(row.rawJson as string)
      const parts = Array.isArray(message.content) ? message.content : []
      for (const part of parts) {
        if (part.type === "tool-call") {
          calls.push({ name: part.toolName, input: part.input || {} })
        }
      }
    } catch {
      // non-JSON row, ignore
    }
  }
  return calls
}

async function tokensFor(runId: string) {
  const run = await db.agentRun.findUnique({
    where: { id: runId },
    select: { promptTokens: true, outputTokens: true, steps: true, status: true },
  })
  return run
}

async function turn(message: string, agentSlug?: string) {
  return runAgentTurn({ principal: staffPrincipal, channel: CHANNEL, threadKey: THREAD_KEY, userMessage: message, agentSlug, trigger: "probe" })
}

// ── Preflight ────────────────────────────────────────────────────────────────
console.log(`Runtime: ${JSON.stringify(runtime)}\n`)

async function listModels() {
  if (runtime.mode === "gateway") {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      headers: { authorization: `Bearer ${gatewayKey}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`gateway /models returned ${res.status}`)
    const payload = (await res.json()) as { data?: Array<{ id?: string }> }
    return (payload.data || []).map((m) => String(m.id || "")).filter(Boolean)
  }

  const res = await fetch(`${runtime.baseUrl}/models`, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`server /models returned ${res.status}`)
  const payload = (await res.json()) as { data?: Array<{ id?: string }> }
  return (payload.data || []).map((m) => String(m.id || ""))
}

let models: string[] = []
try {
  models = await listModels()
} catch (error) {
  if (runtime.mode === "gateway") {
    console.error(
      `Could not reach the Vercel AI Gateway with AI_GATEWAY_API_KEY (${error}).\n` +
        "Check the key, or probe a local server instead:\n" +
        "  bun scripts/agent-probe.ts --provider local --base-url http://localhost:11434/v1"
    )
  } else {
    console.error(`No OpenAI-compatible server at ${runtime.baseUrl}.`)
    console.error("Start one, e.g.:  ollama serve   (then pull the model), or LM Studio's local server.")
    console.error(`Or use a cloud model instead:  export AI_GATEWAY_API_KEY=... && bun scripts/agent-probe.ts`)
    console.error(`Override with:   bun scripts/agent-probe.ts --base-url http://localhost:1234/v1 --model <id>`)
  }
  process.exit(2)
}

if (!models.length) {
  console.error(`Model listing at ${runtime.mode === "gateway" ? "the gateway" : runtime.baseUrl} returned nothing.`)
  process.exit(2)
}

const modelAvailable = models.includes(MODEL) || models.some((id) => id.endsWith(`/${MODEL}`))
if (!modelAvailable) {
  console.error(
    `Model "${MODEL}" is not available. Available models (${models.length}):\n  ` +
      models.slice(0, 20).join("\n  ") +
      (models.length > 20 ? `\n  …and ${models.length - 20} more` : "")
  )
  console.error("Pass --model <one of the above>.")
  process.exit(2)
}
console.log(`Server OK — ${models.length} model(s) visible, using "${MODEL}"\n`)

// ── Principal: first active admin ───────────────────────────────────────────
const admin = await db.user.findFirst({ where: { role: "admin", status: "active" }, orderBy: { createdAt: "asc" } })
if (!admin) {
  console.error("No active admin user in the database. Run the seed or /setup first.")
  process.exit(2)
}
const principal = await resolveStaffPrincipal(admin.id)
if (!principal) {
  console.error("Could not resolve admin principal.")
  process.exit(2)
}
const staffPrincipal = principal // narrowed once, safe inside closures below

// Fixture data for the write test: something clearly over the $500 default ceiling.
const product = await db.product.findFirst({
  where: { status: "active" },
  orderBy: { wholesalePrice: "desc" },
})
const customer = await db.customer.findFirst({ where: { status: "active" }, orderBy: { createdAt: "asc" } })

// ── 1. Read tool, well-formed arguments ─────────────────────────────────────
let r1: Awaited<ReturnType<typeof turn>> | null = null
try {
  r1 = await turn("Use the product search to find products matching 'pizza'. Tell me how many matched.")
  const calls = await toolCallsFor(r1.runId)
  const search = calls.find((c) => c.name === "searchProducts")
  check(
    "1. searchProducts called with well-formed arguments",
    Boolean(search) && typeof (search?.input.query ?? search?.input.search ?? search?.input.term) === "string",
    search ? `args=${JSON.stringify(search.input)}` : `calls were: ${calls.map((c) => c.name).join(", ") || "none"}`
  )
} catch (error) {
  check("1. searchProducts called with well-formed arguments", false, String(error))
}

// ── 2. Multi-step chaining ──────────────────────────────────────────────────
try {
  const r2 = await turn("Find products matching 'dough', then quote a basket of 10 units of the cheapest result for our cheapest customer tier. Report the total.")
  const calls = await toolCallsFor(r2.runId)
  const names = calls.map((c) => c.name)
  const chained = names.includes("searchProducts") && names.includes("quoteBasket")
  const order = names.indexOf("searchProducts") < names.indexOf("quoteBasket")
  check("2. multi-step chain searchProducts → quoteBasket", chained && order, `sequence: ${names.join(" → ") || "no tool calls"}`)
} catch (error) {
  check("2. multi-step chain searchProducts → quoteBasket", false, String(error))
}

// ── 3. Over-threshold write pauses into a proposal ──────────────────────────
try {
  if (!product || !customer) {
    check("3. over-threshold createSalesOrder pauses", false, "missing fixture product/customer")
  } else {
    const ordersBefore = await db.salesOrder.count()
    const qty = 100 // deliberately far over maxOrderValue (500)
    const r3 = await turn(
      `Place a sales order for customer "${customer.name}" for ${qty} units of product "${product.name}". Their delivery date is flexible.`
    )
    const ordersAfter = await db.salesOrder.count()
    const proposal = r3.pendingApprovals.find((p) => p.toolName === "createSalesOrder")
    const paused = Boolean(proposal) && ordersAfter === ordersBefore
    check(
      "3. over-threshold createSalesOrder pauses as AgentProposal",
      paused,
      proposal
        ? `proposal=${proposal.proposalId}, summary="${proposal.summary}", orders written=${ordersAfter - ordersBefore}`
        : `no approval requested; orders written=${ordersAfter - ordersBefore}; text="${r3.text.slice(0, 120)}"`
    )
  }
} catch (error) {
  check("3. over-threshold createSalesOrder pauses as AgentProposal", false, String(error))
}

// ── 4+5. Narrow allowlist agent vs full registry ────────────────────────────
const slug = `probe-narrow-${STAMP}`
try {
  const narrowTools = ["findProducts", "searchProducts", "getStock", "listCustomers", "quoteBasket", "convertQuantity"]
  await db.agentDefinition.create({
    data: {
      slug,
      name: "Phase 0 probe (narrow)",
      description: "Temporary definition created by scripts/agent-probe.ts",
      instructions: "You are a warehouse assistant. Answer stock and pricing questions using your tools.",
      toolsJson: JSON.stringify(narrowTools),
      audience: "staff",
      enabled: true,
    },
  })

  const r4 = await turn("How much stock do we have of the most expensive product? Name it and give the number.", slug)
  const calls = await toolCallsFor(r4.runId)
  const outside = calls.filter((c) => !narrowTools.includes(c.name))
  check(
    "4. narrow agent answers within its 6-tool allowlist",
    calls.length > 0 && outside.length === 0,
    outside.length ? `used disallowed: ${outside.map((c) => c.name).join(", ")}` : `tools used: ${calls.map((c) => c.name).join(", ")}`
  )

  // Token comparison across every probe run so far.
  const runs = await db.agentRun.findMany({
    where: { channel: CHANNEL, threadId: (await db.agentThread.findFirst({ where: { threadKey: THREAD_KEY }, select: { id: true } }))?.id },
    orderBy: { startedAt: "asc" },
    select: { persona: true, promptTokens: true, outputTokens: true, steps: true, status: true },
  })
  console.log("\nToken usage per turn (from AgentRun):")
  for (const run of runs) {
    const tag = run.persona === slug ? "narrow (6 tools)" : "full registry"
    console.log(`  [${tag}] prompt=${run.promptTokens} output=${run.outputTokens} steps=${run.steps} status=${run.status}`)
  }
  const full = runs.filter((r) => r.persona !== slug)
  const narrow = runs.filter((r) => r.persona === slug)
  if (full.length && narrow.length) {
    const avgFull = Math.round(full.reduce((s, r) => s + (r.promptTokens || 0), 0) / full.length)
    const avgNarrow = Math.round(narrow.reduce((s, r) => s + (r.promptTokens || 0), 0) / narrow.length)
    console.log(`\nAverage prompt tokens — full: ${avgFull}, narrow: ${avgNarrow}`)
  }
} catch (error) {
  check("4. narrow agent answers within its 6-tool allowlist", false, String(error))
} finally {
  if (!keep) {
    await db.agentDefinition.deleteMany({ where: { slug } })
  } else {
    console.log(`(--keep) narrow definition left in place: ${slug}`)
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed — the local model drives the tools.")
await db.$disconnect()
process.exit(failures ? 1 : 0)
