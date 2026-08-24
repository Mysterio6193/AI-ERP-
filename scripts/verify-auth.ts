/**
 * Auth verification.
 *
 * AUTH_BYPASS=true handed a synthetic admin to any request with no session, so
 * every guard in the platform passed locally whether or not it worked. The
 * guards were present in source and had never once been made to reject. This
 * proves they do.
 *
 *   bun scripts/verify-auth.ts
 */
const BASE = "http://localhost:3000"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

async function call(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    signal: AbortSignal.timeout(30000),
  })
  return r.status
}

/** Routes that must refuse an anonymous caller. */
const GUARDED: Array<[string, string, RequestInit?]> = [
  ["staff order list", "/api/orders"],
  ["one order", "/api/orders/anything"],
  ["customers", "/api/customers"],
  ["products (write)", "/api/products", { method: "POST", body: "{}" }],
  ["inventory", "/api/inventory"],
  ["suppliers", "/api/suppliers"],
  ["purchase orders", "/api/purchase-orders"],
  ["invoices", "/api/invoices"],
  ["payments", "/api/payments", { method: "POST", body: "{}" }],
  ["chart of accounts", "/api/accounting/accounts"],
  ["settings", "/api/settings/company", { method: "PUT", body: "{}" }],
  ["tax rates", "/api/tax-rates"],
  ["discount rules", "/api/discount-rules"],
  ["CRM actions", "/api/crm/actions", { method: "POST", body: '{"action":"createLead"}' }],
  ["agent chat", "/api/agent/chat", { method: "POST", body: "{}" }],
  ["voice transcribe", "/api/voice/transcribe", { method: "POST", body: "{}" }],
  ["inbox", "/api/inbox"],
  ["inbox reply", "/api/inbox", { method: "POST", body: "{}" }],
  ["users", "/api/users"],
  ["companies", "/api/companies"],
]

/** Routes that are public on purpose. */
const PUBLIC: Array<[string, string]> = [
  ["health", "/api/health"],
  ["product categories", "/api/products/get-categories"],
  ["company branding", "/api/settings/company"],
]

/**
 * Storefront reads that validate a customer token themselves. Middleware must
 * hand them to the route rather than demanding an admin session — but the
 * route must still refuse an anonymous caller.
 */
const CUSTOMER_SELF_AUTH: Array<[string, string]> = [
  ["product list", "/api/products/get-products"],
  ["product detail", "/api/products/detail-product-variant"],
]

async function main() {
  console.log("Auth verification — AUTH_BYPASS is off\n")
  console.log("1. Guarded routes must refuse an anonymous caller")

  for (const [label, path, init] of GUARDED) {
    const status = await call(path, init)
    // 401/403 are both correct refusals. 404 is not a refusal — it leaks that
    // the route ran. 200 means the guard does nothing.
    check([401, 403].includes(status), label.padEnd(20), `HTTP ${status}`)
  }

  console.log("\n2. Public routes still answer")
  for (const [label, path] of PUBLIC) {
    const status = await call(path)
    check(status < 400, label.padEnd(20), `HTTP ${status}`)
  }

  console.log("\n3. Storefront reads reach their route and refuse anonymously")
  for (const [label, path] of CUSTOMER_SELF_AUTH) {
    const status = await call(path)
    // 401 from the route is right. What must not happen is the middleware
    // demanding a staff session for a customer endpoint.
    check([401, 403].includes(status), label.padEnd(20), `HTTP ${status}`)
  }

  console.log("\n4. Rate limiting refuses a loop")
  let sawLimit = false
  let firstStatus = 0
  for (let i = 0; i < 14; i++) {
    const status = await call("/api/user/login", {
      method: "POST",
      body: JSON.stringify({ email: "probe@example.com", password: "wrong" }),
    })
    if (i === 0) firstStatus = status
    if (status === 429) { sawLimit = true; break }
  }
  check(sawLimit, "sign-in is rate limited", sawLimit ? "429 after repeated attempts" : `never limited (first ${firstStatus})`)

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1) })
