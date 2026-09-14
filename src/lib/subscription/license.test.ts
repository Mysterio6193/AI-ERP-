import { describe, expect, it } from "vitest"

import {
  generateLicenseKeyPair,
  hashLicenseKey,
  issueLicense,
  licenseHint,
  installFingerprint,
  verifyLicense,
  type LicensePayload,
} from "./license"

const { publicKey, privateKey } = generateLicenseKeyPair()
const now = new Date("2026-06-15T12:00:00Z")

function payload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    id: "lic_123",
    plan: "professional",
    issuedTo: "Fresh Distribution Co",
    seats: 25,
    issued: "2026-01-01T00:00:00.000Z",
    expires: "2027-01-01T00:00:00.000Z",
    nonce: "abc123",
    ...overrides,
  }
}

describe("issueLicense / verifyLicense", () => {
  it("round-trips a licence with no network involved", () => {
    const key = issueLicense(payload(), privateKey)
    const result = verifyLicense(key, publicKey, now)

    expect(result.valid).toBe(true)
    if (!result.valid) return

    expect(result.payload.plan).toBe("professional")
    expect(result.payload.seats).toBe(25)
    expect(result.expired).toBe(false)
  })

  it("refuses a licence whose contents were edited", () => {
    const key = issueLicense(payload({ seats: 5 }), privateKey)

    // Forge more seats by rewriting the body.
    const [prefix, body, signature] = key.split(".")
    const decoded = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    decoded.seats = 5000
    const forgedBody = Buffer.from(JSON.stringify(decoded), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")

    const result = verifyLicense(`${prefix}.${forgedBody}.${signature}`, publicKey, now)

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.reason).toContain("altered")
  })

  it("refuses a licence signed by someone else's key", () => {
    const other = generateLicenseKeyPair()
    const key = issueLicense(payload(), other.privateKey)

    expect(verifyLicense(key, publicKey, now).valid).toBe(false)
  })

  it("reports an expired licence as authentic but out of date", () => {
    // Expiry is not a forgery. The caller decides what grace to give it, so
    // this must not collapse into a plain "invalid".
    const key = issueLicense(payload({ expires: "2026-01-01T00:00:00.000Z" }), privateKey)
    const result = verifyLicense(key, publicKey, now)

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.expired).toBe(true)
    expect(result.daysRemaining).toBeLessThan(0)
  })

  it("supports a perpetual licence", () => {
    const key = issueLicense(payload({ expires: undefined }), privateKey)
    const result = verifyLicense(key, publicKey, now)

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.expired).toBe(false)
    expect(result.daysRemaining).toBeNull()
  })

  it("rejects junk without throwing", () => {
    for (const junk of ["", "nonsense", "SSOS.only-two-parts", "OTHER.a.b", "SSOS..x"]) {
      const result = verifyLicense(junk, publicKey, now)
      expect(result.valid).toBe(false)
    }
  })

  it("produces a different key each time for identical terms", () => {
    // The nonce is what stops two customers on the same plan sharing a key.
    const a = issueLicense(payload({ nonce: "one" }), privateKey)
    const b = issueLicense(payload({ nonce: "two" }), privateKey)
    expect(a).not.toBe(b)
  })
})

describe("storage helpers", () => {
  it("stores a hash, never the key", () => {
    const key = issueLicense(payload(), privateKey)
    const hash = hashLicenseKey(key)

    expect(hash).toHaveLength(64)
    expect(hash).not.toContain(key.slice(0, 20))
    // Same key, same hash — so an activation attempt can be matched.
    expect(hashLicenseKey(`  ${key}  `)).toBe(hash)
  })

  it("gives a hint that identifies without revealing", () => {
    const key = issueLicense(payload(), privateKey)
    const hint = licenseHint(key)

    expect(hint).toContain("…")
    expect(hint.length).toBeLessThan(20)
  })

  it("fingerprints an install stably", () => {
    expect(installFingerprint("seed-a")).toBe(installFingerprint("seed-a"))
    expect(installFingerprint("seed-a")).not.toBe(installFingerprint("seed-b"))
  })
})
