/**
 * Proof that the browser tools are wired, gated, and off by default.
 *
 * Written because the failure this codebase keeps producing is not a crash but
 * a thing that looks connected and is not — a tool registered in policy that
 * no principal ever receives, or a switch that reads a setting nothing writes.
 */
import { buildTools } from "@/lib/agent/tools"
import { TOOL_POLICY } from "@/lib/agent/tools"
import { checkBrowseUrl } from "@/lib/agent/browser/allowlist"

const BROWSER_TOOLS = ["openPage", "readCurrentPage", "clickOnPage", "typeIntoPage"]

async function main() {
  let failures = 0
  const fail = (msg: string) => { console.error(`  FAIL  ${msg}`); failures++ }
  const pass = (msg: string) => console.log(`  ok    ${msg}`)

  const staff: any = { kind: "staff", userId: "u1", role: "admin", companyId: null }
  const customer: any = { kind: "customer", customerId: "c1", companyId: null }

  const staffTools = await buildTools(staff)
  const customerTools = await buildTools(customer)

  for (const name of BROWSER_TOOLS) {
    if (staffTools[name]) pass(`staff has ${name}`)
    else fail(`staff is missing ${name} — registered in policy but never built`)

    if (customerTools[name]) fail(`a CUSTOMER can reach ${name}`)
    else pass(`customer cannot reach ${name}`)

    if (TOOL_POLICY[name]) pass(`${name} has a policy entry`)
    else fail(`${name} has no TOOL_POLICY entry, so decide() sees no metadata`)
  }

  if (TOOL_POLICY.clickOnPage?.alwaysApprove) pass("clicking always asks a human")
  else fail("clicking does not require approval")

  if (TOOL_POLICY.typeIntoPage?.alwaysApprove) pass("typing always asks a human")
  else fail("typing does not require approval")

  // Off by default: the tool must refuse before it ever launches a browser.
  const result: any = await (staffTools.openPage as any).execute!({ url: "https://example.com" }, {} as any)
  if (result?.ok === false) pass(`off by default — refused: "${String(result.error).slice(0, 60)}…"`)
  else fail("the browser ran while disabled")

  // Empty allowlist means closed.
  const closed = await checkBrowseUrl("https://example.com", [])
  if (!closed.allowed) pass("empty allowlist refuses everything")
  else fail("empty allowlist allowed a page")

  // Our own network stays out of reach even if allowlisted.
  const internal = await checkBrowseUrl("http://127.0.0.1:3000/api/orders", ["127.0.0.1"])
  if (!internal.allowed) pass("our own network is refused even when allowlisted")
  else fail("the browser could reach inside our network")

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
