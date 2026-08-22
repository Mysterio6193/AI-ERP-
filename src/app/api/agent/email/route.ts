import { NextRequest, NextResponse } from "next/server"

import { resolveCustomerByEmail, resolveCustomerPrincipal, resolveStaffPrincipal } from "@/lib/agent/context"
import { signOutbound } from "@/lib/agent/identity"
import { runAgentTurn } from "@/lib/agent/runtime"
import { sendCommunicationMessage } from "@/lib/communications"
import { db } from "@/lib/db"

/**
 * The agent's own inbox.
 *
 * In food distribution a large share of orders arrive as free-text email from
 * a venue manager, not through a form. Point any inbound-parsing provider
 * (Postmark, Mailgun Routes, SendGrid Inbound Parse, SES + SNS) at this route
 * and a plain email becomes: resolve the sender to an account, treat the body
 * as a message to the customer agent, and reply from the same address.
 *
 * The payload shape below matches Postmark's inbound webhook (FromFull, Subject,
 * TextBody, MessageID) since it is the most common starting point; adapt the
 * three destructured fields if you wire a different provider.
 */

function isProviderConfigured() {
  return Boolean(process.env.INBOUND_EMAIL_SECRET)
}

export async function POST(request: NextRequest) {
  if (isProviderConfigured()) {
    const provided = request.headers.get("x-inbound-secret")
    if (provided !== process.env.INBOUND_EMAIL_SECRET) {
      return NextResponse.json({ success: false }, { status: 401 })
    }
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ success: true, skipped: "unparseable" })
  }

  const from = String(body.FromFull?.Email || body.from || "").toLowerCase()
  const subject = String(body.Subject || body.subject || "(no subject)")
  const text = String(body.TextBody || body.text || body.body || "").trim()
  const messageId = String(body.MessageID || body.messageId || "")

  if (!from || !text) {
    return NextResponse.json({ success: true, skipped: "missing sender or body" })
  }

  // Idempotency: inbound-parsing providers retry on anything slower than a
  // couple of seconds, and a retried email must not run the agent twice.
  if (messageId) {
    const seen = await db.communicationLog.findFirst({
      where: { externalId: messageId, method: "email", direction: "inbound" },
      select: { id: true },
    })

    if (seen) {
      return NextResponse.json({ success: true, skipped: "duplicate" })
    }
  }

  const customer = await resolveCustomerByEmail(from)

  await db.communicationLog.create({
    data: {
      customerId: customer?.id || null,
      method: "email",
      direction: "inbound",
      recipient: from,
      subject,
      message: text,
      status: "received",
      externalId: messageId || null,
    },
  })

  if (!customer) {
    // Unknown sender: log it and let a human decide - the agent does not
    // guess whose account an unrecognised address belongs to.
    await db.crmTask.create({
      data: {
        title: `Unrecognised email from ${from}: ${subject}`,
        type: "follow_up",
        priority: "normal",
      },
    })

    return NextResponse.json({ success: true, data: { matched: false } })
  }

  const principal = await resolveCustomerPrincipal(customer.id)
  if (!principal) {
    return NextResponse.json({ success: true, data: { matched: true, blocked: true } })
  }

  try {
    const turn = await runAgentTurn({
      principal,
      channel: "email",
      threadKey: `email:${customer.id}`,
      userMessage: `Subject: ${subject}\n\n${text}`,
      trigger: "email",
    })

    // A pending approval means the agent could not just answer - it needs a
    // human, so it acknowledges receipt rather than promising something it
    // cannot yet deliver.
    const replyText = turn.pendingApprovals.length
      ? "Thanks for your email - I've passed this to the team and someone will get back to you shortly."
      : turn.text || "Thanks for your email - I'll follow up shortly."

    await sendCommunicationMessage({
      to: from,
      method: "email",
      subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
      message: await signOutbound(replyText),
      customerId: customer.id,
    })

    return NextResponse.json({
      success: true,
      data: { matched: true, customer: customer.name, pendingApprovals: turn.pendingApprovals.length },
    })
  } catch (error) {
    console.error("Inbound email agent turn failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Agent failed" },
      { status: 500 }
    )
  }
}
