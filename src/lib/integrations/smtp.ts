import { db } from "@/lib/db"
import { decryptSecret } from "@/lib/secure-store"

/**
 * Sending mail from the business's own mailbox, with nothing registered.
 *
 * The alternative to OAuth for email, and for most small operations the better
 * one: every mail provider still speaks SMTP, an app password takes a minute to
 * create, and there is no application to register or have reviewed. Gmail,
 * Outlook, Fastmail and a hosting company's mail server all work the same way.
 *
 * It is stored as a connection rather than in server config so it can be
 * changed by an admin from the app, and so a deployment serving several
 * companies can have a different sender per company.
 */

export interface SmtpConfig {
  host: string
  port: number
  user: string
  /** STARTTLS on 587, implicit TLS on 465 — the usual pair. */
  secure: boolean
  fromName?: string
  fromEmail?: string
}

/** The port tells you which TLS mode is meant, and people get this wrong. */
export function defaultSecureForPort(port: number): boolean {
  return port === 465
}

export type SmtpVerdict =
  | { ok: true; config: SmtpConfig }
  | { ok: false; error: string }

/**
 * Check the settings look sendable before anything is stored.
 *
 * Cheap validation only — the real test is an actual connection, which the
 * route does. This exists so obvious mistakes are named precisely rather than
 * coming back as a socket error twenty seconds later.
 */
export function validateSmtpConfig(input: Record<string, unknown>): SmtpVerdict {
  const host = String(input.host ?? "").trim()
  const user = String(input.user ?? "").trim()
  const port = Number(input.port ?? 587)

  if (!host) return { ok: false, error: "A mail server address is required, e.g. smtp.gmail.com." }
  if (/^https?:\/\//i.test(host)) {
    return { ok: false, error: "That looks like a web address. A mail server is a hostname, e.g. smtp.gmail.com." }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Port must be a number between 1 and 65535 — usually 587 or 465." }
  }
  if (!user) return { ok: false, error: "A username is required, usually the full email address." }

  const fromEmail = String(input.fromEmail ?? "").trim() || user

  if (!fromEmail.includes("@")) {
    return { ok: false, error: "The sending address must be a full email address." }
  }

  return {
    ok: true,
    config: {
      host,
      port,
      user,
      secure: input.secure === undefined ? defaultSecureForPort(port) : Boolean(input.secure),
      fromName: String(input.fromName ?? "").trim() || undefined,
      fromEmail,
    },
  }
}

/**
 * The stored mail settings for a company, if any.
 *
 * Returns the password decrypted, so callers must not log the result. Kept
 * separate from the transporter so the settings can be shown on screen without
 * building a connection.
 */
export async function loadSmtpConnection(companyId: string | null): Promise<{
  config: SmtpConfig
  password: string
} | null> {
  const row = await db.integrationConnection.findFirst({
    where: { provider: "smtp", scope: "company", companyId, status: "connected" },
    select: { configJson: true, accessTokenEnc: true },
  })

  if (!row?.configJson || !row.accessTokenEnc) return null

  try {
    return {
      config: JSON.parse(row.configJson) as SmtpConfig,
      password: decryptSecret(row.accessTokenEnc),
    }
  } catch {
    // A config that cannot be read is treated as absent rather than throwing:
    // the caller then falls back to server config and says mail is unconfigured,
    // which is recoverable. Throwing here would take down every send.
    return null
  }
}
