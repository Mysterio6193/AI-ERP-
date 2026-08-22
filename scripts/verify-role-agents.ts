/**
 * Role agent verification.
 *
 * Phase 0 measured 63,050 prompt tokens per turn with the full registry against
 * 12,766 with six tools. This checks the routing that acts on that: a staff
 * member now reaches the agent for their job, not the one that can do
 * everything.
 *
 * Asserts scoping statically, then runs one real turn per role to record what
 * each actually costs.
 *
 *   bun scripts/verify-role-agents.ts
 */
import { db } from "../src/lib/db"
import {
  applyToolAllowlist,
  defaultSlugFor,
  getFallback,
} from "../src/lib/agent/definitions"
import { buildTools } from "../src/lib/agent/tools"
import { runAgentTurn } from "../src/lib/agent/runtime"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const ROLES = ["sales", "warehouse", "accounts", "admin"] as const

async function main() {
  console.log("Role agent verification\n")
  console.log("1. Each role routes to its own agent")

  for (const role of ROLES) {
    const slug = defaultSlugFor({ kind: "staff", role, userId: "x" } as never)
    const expected = role === "admin" ? "ops" : role
    check(slug === expected, `${role} → ${slug}`)
  }

  console.log("\n2. How many tools each actually receives")
  const sizes: Record<string, number> = {}

  for (const role of ROLES) {
    const principal = { kind: "staff", role, userId: "x", name: "probe" } as never
    const slug = defaultSlugFor(principal)
    const definition = getFallback(slug)
    const tools = applyToolAllowlist(buildTools(principal), definition.tools)
    const count = Object.keys(tools).length
    sizes[role] = count
    console.log(`     ${role.padEnd(10)} ${slug.padEnd(10)} ${String(count).padStart(3)} tools`)
  }

  check(sizes.sales < sizes.admin, "sales is narrower than admin", `${sizes.sales} vs ${sizes.admin}`)
  check(sizes.warehouse < sizes.admin, "warehouse is narrower than admin", `${sizes.warehouse} vs ${sizes.admin}`)
  check(sizes.accounts < sizes.admin, "accounts is narrower than admin", `${sizes.accounts} vs ${sizes.admin}`)

  console.log("\n3. Scoping holds — the allowlist removes reach, never grants it")
  const warehouseTools = Object.keys(
    applyToolAllowlist(buildTools({ kind: "staff", role: "warehouse", userId: "x" } as never), getFallback("warehouse").tools)
  )
  check(!warehouseTools.includes("recordPayment"), "warehouse cannot record a payment")
  check(!warehouseTools.includes("setCreditStatus"), "warehouse cannot change credit status")

  const accountsTools = Object.keys(
    applyToolAllowlist(buildTools({ kind: "staff", role: "accounts", userId: "x" } as never), getFallback("accounts").tools)
  )
  check(!accountsTools.includes("adjustInventory"), "accounts cannot adjust stock")

  // A definition cannot widen past what the principal was already allowed:
  // buildTools scopes first, the allowlist only filters.
  const salesGetsSettings = Object.keys(
    applyToolAllowlist(buildTools({ kind: "staff", role: "sales", userId: "x" } as never), ["proposeSettingChange"])
  )
  check(
    salesGetsSettings.length === 0,
    "a sales rep cannot be handed an admin-only tool by listing it",
    salesGetsSettings.join(",") || "(none)"
  )

  console.log("\n4. Real turns — what each role costs per message")

  const user = await db.user.findFirst({ where: { role: "admin", status: "active" }, select: { id: true } })
  if (!user) {
    console.log("   no admin user to run as; skipping live turns")
  } else {
    for (const role of ["sales", "warehouse", "accounts", "admin"] as const) {
      const principal = { kind: "staff", role, userId: user.id, name: "probe" } as never
      const threadKey = `role-probe-${role}-${Date.now()}`

      try {
        await runAgentTurn({
          principal,
          channel: "probe",
          threadKey,
          userMessage: "What should I look at first today? One sentence.",
          trigger: "probe",
        })

        const thread = await db.agentThread.findFirst({
          where: { threadKey },
          select: { id: true },
        })

        const run = await db.agentRun.findFirst({
          where: thread ? { threadId: thread.id } : { threadId: { not: null } },
          orderBy: { startedAt: "desc" },
          select: { promptTokens: true, status: true, steps: true, model: true },
        })

        console.log(
          `     ${role.padEnd(10)} prompt=${String(run?.promptTokens ?? "?").padStart(6)} steps=${run?.steps ?? "?"} ${run?.status ?? ""}`
        )
      } catch (error) {
        console.log(`     ${role.padEnd(10)} turn failed: ${(error as Error).message.slice(0, 70)}`)
      }
    }
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })
