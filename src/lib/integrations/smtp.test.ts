import { describe, expect, it } from "vitest"

import { defaultSecureForPort, validateSmtpConfig } from "@/lib/integrations/smtp"

/**
 * These messages are the whole value of validating early. A socket timeout
 * twenty seconds later tells somebody nothing about which field they got wrong.
 */
describe("validateSmtpConfig", () => {
  const valid = { host: "smtp.gmail.com", port: 587, user: "orders@rdmpizza.com.au" }

  it("accepts ordinary settings", () => {
    const verdict = validateSmtpConfig(valid)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.config.host).toBe("smtp.gmail.com")
  })

  it("names a missing server rather than failing at connect time", () => {
    const verdict = validateSmtpConfig({ ...valid, host: "" })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error).toMatch(/mail server address/i)
  })

  it("catches a web address pasted in as the mail server", () => {
    // People paste https://mail.google.com, which fails with a socket error
    // that says nothing about what they did wrong.
    const verdict = validateSmtpConfig({ ...valid, host: "https://smtp.gmail.com" })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error).toMatch(/web address/i)
  })

  it("rejects a port that is not a port", () => {
    for (const port of [0, -1, 99999, 1.5]) {
      expect(validateSmtpConfig({ ...valid, port }).ok).toBe(false)
    }
  })

  it("requires a username", () => {
    expect(validateSmtpConfig({ ...valid, user: "" }).ok).toBe(false)
  })

  it("falls back to the username as the sending address", () => {
    // Almost always the same, and asking twice invites a mismatch.
    const verdict = validateSmtpConfig(valid)
    if (verdict.ok) expect(verdict.config.fromEmail).toBe("orders@rdmpizza.com.au")
  })

  it("rejects a sending address that is not an address", () => {
    expect(validateSmtpConfig({ ...valid, fromEmail: "RDM Pizza" }).ok).toBe(false)
  })

  it("trims whitespace people paste in with credentials", () => {
    const verdict = validateSmtpConfig({ host: "  smtp.gmail.com  ", port: 587, user: " a@b.com " })
    if (verdict.ok) {
      expect(verdict.config.host).toBe("smtp.gmail.com")
      expect(verdict.config.user).toBe("a@b.com")
    }
  })
})

describe("defaultSecureForPort", () => {
  it("uses implicit TLS on 465 and STARTTLS on 587", () => {
    // Getting this pair backwards is the most common SMTP misconfiguration.
    expect(defaultSecureForPort(465)).toBe(true)
    expect(defaultSecureForPort(587)).toBe(false)
    expect(defaultSecureForPort(25)).toBe(false)
  })
})
