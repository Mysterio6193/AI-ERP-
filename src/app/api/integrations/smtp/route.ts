import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { validateSmtpConfig } from "@/lib/integrations/smtp"
import { encryptSecret, isEncryptionConfigured } from "@/lib/secure-store"

/**
 * Connect the business's mailbox over SMTP.
 *
 * The settings are proven before they are stored. Saving unverified credentials
 * is how mail ends up silently not being sent: everything looks connected, and
 * the first anyone hears of it is a customer asking where their invoice went.
 * So this opens a real connection and authenticates against the server, and
 * only writes the row if that succeeds.
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const companyId = await getActiveCompanyId(request).catch(() => null)

  const row = await db.integrationConnection.findFirst({
    where: { provider: "smtp", scope: "company", companyId },
    select: { configJson: true, status: true, lastError: true, lastSyncAt: true, accountEmail: true },
  })

  if (!row?.configJson) {
    return NextResponse.json({ success: true, data: { connected: false, config: null } })
  }

  // The password is never returned, not even masked — there is no screen that
  // needs it, and the only way to change it is to enter it again.
  const config = JSON.parse(row.configJson)

  return NextResponse.json({
    success: true,
    data: {
      connected: row.status === "connected",
      config,
      lastError: row.lastError,
      lastSyncAt: row.lastSyncAt,
      accountEmail: row.accountEmail,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Set INTEGRATION_ENCRYPTION_KEY before storing mail credentials. Generate one with: openssl rand -hex 32",
      },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const password = String(body.password ?? "")

  if (!password) {
    return NextResponse.json({ success: false, error: "A password is required." }, { status: 400 })
  }

  const verdict = validateSmtpConfig(body)
  if (!verdict.ok) {
    return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })
  }

  const { config } = verdict

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: password },
    // Bounded, because an unreachable host otherwise hangs the request until
    // the browser gives up and the person assumes the app is broken.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })

  try {
    await transporter.verify()
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Could not reach the mail server."

    /**
     * Provider errors are accurate but not helpful. The two that account for
     * most failures — an ordinary password where an app password is required,
     * and the TLS mode not matching the port — are named directly.
     */
    const hint = /invalid login|authentication failed|535/i.test(reason)
      ? " If this account has two-factor authentication, you need an app password rather than your normal one."
      : /wrong version number|ssl|tls/i.test(reason)
        ? ` Check the port and encryption match — 587 is usually STARTTLS, 465 is usually TLS.`
        : ""

    return NextResponse.json({ success: false, error: `${reason}${hint}` }, { status: 400 })
  } finally {
    transporter.close()
  }

  const companyId = await getActiveCompanyId(request).catch(() => null)

  // One mail connection per company, so a re-save replaces rather than adding a
  // second row that nothing would ever pick.
  await db.integrationConnection.deleteMany({
    where: { provider: "smtp", scope: "company", companyId },
  })

  await db.integrationConnection.create({
    data: {
      provider: "smtp",
      category: "email",
      scope: "company",
      userId: auth.user!.id,
      companyId,
      status: "connected",
      accountEmail: config.fromEmail ?? config.user,
      accountName: config.fromName ?? null,
      configJson: JSON.stringify(config),
      accessTokenEnc: encryptSecret(password),
      lastSyncAt: new Date(),
      lastError: null,
    },
  })

  return NextResponse.json({
    success: true,
    data: { connected: true, verified: true, account: config.fromEmail ?? config.user },
  })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const companyId = await getActiveCompanyId(request).catch(() => null)

  await db.integrationConnection.deleteMany({
    where: { provider: "smtp", scope: "company", companyId },
  })

  return NextResponse.json({
    success: true,
    data: { note: "Mail disconnected. Outgoing email will fail until another mailbox is connected." },
  })
}
