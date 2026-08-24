/**
 * Inbox reply verification.
 *
 * The inbox could read a customer conversation and not answer it, which makes
 * it a log rather than an inbox. And sendCommunicationMessage only ever
 * dispatched email: every other channel was written to the log as "queued" and
 * never sent, with no error — a marketing send to a WhatsApp audience looked
 * delivered and reached nobody.
 *
 *   bun scripts/verify-inbox-reply.ts
 */
import { db } from "../src/lib/db"
import { sendCommunicationMessage } from "../src/lib/communications"

let failures = 0
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

const BASE = "http://localhost:3000"
const STAMP = Date.now()
const threadIds: string[] = []
const logIds: string[] = []

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function cleanup() {
  await db.communicationLog.deleteMany({ where: { id: { in: logIds } } })
  await db.communicationLog.deleteMany({ where: { recipient: { contains: `probe-${STAMP}` } } })
  await db.agentMessage.deleteMany({ where: { threadId: { in: threadIds } } }).catch(() => {})
  await db.agentThread.deleteMany({ where: { id: { in: threadIds } } })
}

async function main() {
  console.log("Inbox reply verification\n")

  const customer = await db.customer.findFirstOrThrow({ select: { id: true, email: true } })

  console.log("1. An unsupported channel fails loudly instead of sitting in 'queued'")
  const wa = await sendCommunicationMessage({
    to: `probe-${STAMP}@whatsapp`,
    method: "whatsapp",
    message: "Probe",
    customerId: customer.id,
  })
  logIds.push(wa.id)

  check(wa.success === false, "reported as not sent", `status ${wa.status}`)
  check(wa.status === "failed", "logged as failed, not queued", wa.status)

  const row = await db.communicationLog.findUniqueOrThrow({
    where: { id: wa.id }, select: { status: true, metadataJson: true },
  })
  check(row.status === "failed", "and that is what is on the record", row.status)
  check(
    String(row.metadataJson).includes("No transport"),
    "with the reason kept",
    JSON.parse(String(row.metadataJson)).failureReason?.slice(0, 48)
  )
  console.log("     Before this it read 'queued', which means 'will be sent shortly'. It never would be.")

  console.log("\n2. Replying to a conversation from the inbox")
  const thread = await db.agentThread.create({
    data: {
      channel: "email", threadKey: `probe-${STAMP}`, persona: "customer",
      customerId: customer.id, status: "open",
    },
    select: { id: true },
  })
  threadIds.push(thread.id)

  const replied = await api("/api/inbox", {
    method: "POST",
    body: JSON.stringify({ conversationId: thread.id, kind: "thread", message: "Thanks, on its way." }),
  })

  check(replied.status === 200 || replied.status === 502, "the endpoint exists and answers", `status ${replied.status}`)
  check(replied.body?.data?.channel === "email", "on the conversation's own channel", replied.body?.data?.channel)
  check(
    replied.body?.data?.to === customer.email,
    "addressed to the customer on the thread, not to a caller-supplied address",
    replied.body?.data?.to
  )
  if (replied.body?.data?.logId) logIds.push(replied.body.data.logId)

  const logged = await db.communicationLog.count({
    where: { customerId: customer.id, direction: "outbound", recipient: customer.email ?? undefined },
  })
  check(logged > 0, "and the reply is on the record")

  console.log("\n3. Guards")
  const empty = await api("/api/inbox", {
    method: "POST", body: JSON.stringify({ conversationId: thread.id, kind: "thread", message: "   " }),
  })
  check(empty.status === 400, "an empty reply is refused", empty.body?.error)

  const missing = await api("/api/inbox", {
    method: "POST", body: JSON.stringify({ conversationId: "nope", kind: "thread", message: "hi" }),
  })
  check(missing.status === 404, "an unknown conversation 404s", missing.body?.error)

  await cleanup()
  console.log("\n   (probe thread and logs removed)")

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failed check(s)`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e); await cleanup().catch(() => {}); await db.$disconnect(); process.exit(1)
})
