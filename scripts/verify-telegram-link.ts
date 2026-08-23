/**
 * Telegram linking verification.
 *
 * Only one person was on Telegram against fifteen active staff, and no more
 * could be added: `generateCode` existed in the settings page and nothing ever
 * called it, so there was no way to create a link code anywhere in the app.
 * The API only ever issued a code for the signed-in user too, so even with a
 * button an admin could not onboard anyone but themselves.
 *
 *   bun scripts/verify-telegram-link.ts
 */
import { db } from "../src/lib/db"
import { consumeLinkCode, createLinkCode } from "../src/lib/agent/channels/identity"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const STAMP = Date.now()
const madeIdentities: string[] = []

async function cleanup() {
  await db.channelIdentity.deleteMany({ where: { id: { in: madeIdentities } } })
  await db.channelIdentity.deleteMany({ where: { externalId: { startsWith: `probe-chat-${STAMP}` } } })
}

async function main() {
  console.log("Telegram linking verification\n")

  const [admin, other] = await Promise.all([
    db.user.findFirstOrThrow({ where: { role: "admin", status: "active" }, select: { id: true, name: true } }),
    db.user.findFirstOrThrow({
      where: { status: "active", role: { in: ["sales", "warehouse", "accounts"] } },
      select: { id: true, name: true, role: true },
    }),
  ])

  console.log("1. A code can be issued for someone other than the admin")
  const link = await createLinkCode(other.id, "telegram")
  const pending = await db.channelIdentity.findFirstOrThrow({
    where: { linkCode: link.code },
    select: { id: true, userId: true, status: true },
  })
  madeIdentities.push(pending.id)

  check(pending.userId === other.id, `code belongs to ${other.name} (${other.role})`, pending.userId === other.id ? "yes" : "WRONG USER")
  check(pending.status === "pending", "and starts pending", pending.status)
  check(link.expiresInMinutes > 0, "with an expiry", `${link.expiresInMinutes} min`)

  console.log("\n2. Redeeming it from a chat links that person, not the admin")
  const chatId = `probe-chat-${STAMP}`
  const result = await consumeLinkCode({
    channel: "telegram",
    externalId: chatId,
    code: link.code,
    displayName: "Probe Device",
  })

  check(result.status === "linked", "linked", result.status)

  const linked = await db.channelIdentity.findFirstOrThrow({
    where: { channel: "telegram", externalId: chatId },
    select: { id: true, userId: true, status: true },
  })
  madeIdentities.push(linked.id)

  check(linked.userId === other.id, `bound to ${other.name}`, linked.userId === other.id ? "yes" : "WRONG USER")
  check(linked.userId !== admin.id, "and not to the admin who issued it")
  check(linked.status === "active", "active", linked.status)

  console.log("\n3. A second person can be added without disturbing the first")
  const before = await db.channelIdentity.count({ where: { channel: "telegram", status: "active" } })
  const second = await createLinkCode(admin.id, "telegram")
  const secondPending = await db.channelIdentity.findFirstOrThrow({ where: { linkCode: second.code }, select: { id: true } })
  madeIdentities.push(secondPending.id)

  const stillLinked = await db.channelIdentity.findFirst({
    where: { channel: "telegram", externalId: chatId, status: "active" },
    select: { id: true },
  })
  check(Boolean(stillLinked), "the first link survives", `${before} active before`)

  console.log("\n4. A stale or wrong code is refused")
  const bad = await consumeLinkCode({ channel: "telegram", externalId: `probe-chat-${STAMP}-x`, code: "ZZZZZZ" })
  check(bad.status === "unlinked", "an unknown code does not link anyone", bad.status)

  await cleanup()
  console.log("\n   (probe identities removed)")

  const finalCount = await db.channelIdentity.count({ where: { channel: "telegram", status: "active" } })
  console.log(`   real telegram links untouched: ${finalCount}`)

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(String(e).slice(0, 400)); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
