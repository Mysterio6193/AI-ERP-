/**
 * Company settings verification.
 *
 * PUT /api/settings/company resolved the record with db.company.findFirst(),
 * so an admin acting as the second entity saved onto the first one — the second
 * entity could never be configured, and the attempt wrote its details onto
 * another company's invoices. It also wrote every field on every save,
 * defaulting absent ones to null, so a partial form wiped the ABN, bank details
 * and address off whichever record it hit.
 *
 *   bun scripts/verify-company-settings.ts
 */
import { ADMIN_SESSION_COOKIE, signAdminSessionToken } from "../src/lib/admin-auth"
import { db } from "../src/lib/db"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const BASE = "http://localhost:3000"

/**
 * A real session, signed with the app's own key.
 *
 * The route requires an admin, and AUTH_BYPASS is off — as it should be. This
 * uses the same signing function the sign-in endpoint uses rather than turning
 * the guard off to test past it.
 */
async function adminCookie() {
  const admin = await db.user.findFirstOrThrow({
    where: { role: "admin", status: "active" },
    select: { id: true, name: true, email: true, role: true, status: true, avatar: true },
  })
  const token = await signAdminSessionToken(admin as never)
  return `${ADMIN_SESSION_COOKIE}=${token}`
}
let snapshots: Array<{ id: string; data: Record<string, unknown> }> = []

const FIELDS = ["name", "tradingName", "abn", "phone", "email", "website", "address", "city",
  "state", "postcode", "bankName", "bsb", "accountNumber", "accountName", "gstRate"] as const

async function snapshot() {
  const companies = await db.company.findMany()
  snapshots = companies.map((c) => ({
    id: c.id,
    data: Object.fromEntries(FIELDS.map((f) => [f, (c as Record<string, unknown>)[f]])),
  }))
}

async function restore() {
  for (const s of snapshots) {
    await db.company.update({ where: { id: s.id }, data: s.data as never })
  }
}

async function main() {
  console.log("Company settings verification\n")
  await snapshot()

  const rdm = await db.company.findFirstOrThrow({ where: { name: { contains: "RDM" } }, select: { id: true, name: true } })
  const first = await db.company.findFirstOrThrow({ select: { id: true, name: true } })

  console.log(`  first row in the table: ${first.name}`)
  console.log(`  target entity:          ${rdm.name}\n`)
  check(first.id !== rdm.id, "the two are different rows, so the bug is reachable")

  const freshBefore = await db.company.findUniqueOrThrow({ where: { id: first.id } })

  console.log("\n1. Naming the entity writes to that entity")
  const cookie = await adminCookie()
  const res = await fetch(`${BASE}/api/settings/company`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ id: rdm.id, bankName: "PROBE Bank", bsb: "000-000", accountNumber: "00000000", accountName: "PROBE" }),
  })
  console.log(`     HTTP ${res.status}`)

  const rdmAfter = await db.company.findUniqueOrThrow({ where: { id: rdm.id } })
  const freshAfter = await db.company.findUniqueOrThrow({ where: { id: first.id } })

  check(rdmAfter.bankName === "PROBE Bank", "RDM received the bank details", rdmAfter.bankName ?? "—")
  check(freshAfter.bankName === freshBefore.bankName, "the other entity's bank is untouched", freshAfter.bankName ?? "—")

  console.log("\n2. A partial save does not wipe the fields it left out")
  check(rdmAfter.abn === "41 615 988 415", "ABN survived", rdmAfter.abn ?? "WIPED")
  check(rdmAfter.address !== null, "address survived", rdmAfter.address ?? "WIPED")
  check(rdmAfter.phone !== null, "phone survived", rdmAfter.phone ?? "WIPED")
  check(rdmAfter.website !== null, "website survived", rdmAfter.website ?? "WIPED")
  console.log("     Before this, every absent field was written as null.")

  console.log("\n3. Nothing leaked to the other entity")
  check(freshAfter.abn === freshBefore.abn, "its ABN is unchanged", freshAfter.abn ?? "—")
  check(freshAfter.accountNumber === freshBefore.accountNumber, "its account number is unchanged")
  check(freshAfter.address === freshBefore.address, "its address is unchanged")

  await restore()
  const restored = await db.company.findUniqueOrThrow({ where: { id: rdm.id }, select: { bankName: true } })
  console.log(`\n   (restored — RDM bankName is ${restored.bankName ?? "empty"} again)`)

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(String(e).slice(0, 400)); await restore().catch(() => {}); await db.$disconnect(); process.exit(1)
})
