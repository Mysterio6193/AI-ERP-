import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto"

/**
 * Offline licences for self-hosted installs.
 *
 * A customer running this on their own server has no route to our billing
 * system, and must not need one: the licence itself carries the plan, the seat
 * count and the expiry, signed with Ed25519 so none of it can be edited on the
 * way. Verification is a signature check against a public key compiled into
 * the build — no network, no clock sync with us, nothing to be offline from.
 *
 * What this does and does not claim:
 *
 *   - It proves a licence was issued by us and has not been altered. That is
 *     genuinely enforced by the signature.
 *   - It does not stop a determined operator patching the binary. Nothing
 *     shipped to someone else's server can. The goal is to make the honest
 *     path easy and accidental over-use visible, not to win against the
 *     machine's owner.
 *
 * The database stores only a SHA-256 of the key, so a leaked dump does not
 * hand out replayable licences.
 */

export interface LicensePayload {
  /** Licence id, so an issued key can be revoked by reference. */
  id: string
  /** Plan code, not plan id — ids are per-install, codes are stable. */
  plan: string
  issuedTo: string
  seats: number
  /** ISO date. Absent means perpetual. */
  expires?: string
  issued: string
  /** Random, so two identical licences are still distinct keys. */
  nonce: string
}

export interface VerifiedLicense {
  valid: true
  payload: LicensePayload
  expired: boolean
  daysRemaining: number | null
}

export interface InvalidLicense {
  valid: false
  reason: string
}

const PREFIX = "SSOS"

function b64url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromB64url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64")
}

/** Generates an issuing key pair. Run once; keep the private key off the app servers. */
export function generateLicenseKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")

  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  }
}

/**
 * Signs a licence.
 *
 * Only ever run where the private key lives — the issuing side, never a
 * customer install.
 */
export function issueLicense(payload: LicensePayload, privateKeyPem: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"))
  const signature = cryptoSign(null, Buffer.from(body, "utf8"), createPrivateKey(privateKeyPem))

  return `${PREFIX}.${body}.${b64url(signature)}`
}

/**
 * Verifies a licence against the public key.
 *
 * An expired licence still verifies — it is authentic, just out of date. The
 * caller decides what to do with that, because the grace-period rules live in
 * settings rather than being baked in here.
 */
export function verifyLicense(
  key: string,
  publicKeyPem: string,
  now = new Date()
): VerifiedLicense | InvalidLicense {
  const trimmed = key.trim()
  const parts = trimmed.split(".")

  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return { valid: false, reason: "Not a licence key for this product" }
  }

  const [, body, signature] = parts

  let ok = false
  try {
    ok = cryptoVerify(
      null,
      Buffer.from(body, "utf8"),
      createPublicKey(publicKeyPem),
      fromB64url(signature)
    )
  } catch {
    return { valid: false, reason: "Licence signature could not be checked" }
  }

  if (!ok) {
    return { valid: false, reason: "Licence signature does not match — the key has been altered" }
  }

  let payload: LicensePayload
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"))
  } catch {
    return { valid: false, reason: "Licence contents are unreadable" }
  }

  if (!payload.plan || !payload.id || typeof payload.seats !== "number") {
    return { valid: false, reason: "Licence is missing a plan, id or seat count" }
  }

  if (!payload.expires) {
    return { valid: true, payload, expired: false, daysRemaining: null }
  }

  const expires = new Date(payload.expires)

  if (Number.isNaN(expires.getTime())) {
    return { valid: false, reason: "Licence expiry date is unreadable" }
  }

  const daysRemaining = Math.floor((expires.getTime() - now.getTime()) / 86_400_000)

  return {
    valid: true,
    payload,
    expired: expires.getTime() <= now.getTime(),
    daysRemaining,
  }
}

/** What the database stores. Never the key itself. */
export function hashLicenseKey(key: string) {
  return createHash("sha256").update(key.trim()).digest("hex")
}

/** Enough of the key to recognise it in a list, not enough to use it. */
export function licenseHint(key: string) {
  const trimmed = key.trim()
  const body = trimmed.split(".")[1] ?? trimmed
  return `${body.slice(0, 6)}…${body.slice(-4)}`
}

/**
 * A stable identifier for this install, so one licence cannot be spread across
 * several servers.
 *
 * Deliberately coarse — hardware-bound licensing punishes ordinary things like
 * restoring a backup or moving hosts. This binds to the database identity,
 * which survives a redeploy and changes when the install genuinely does.
 */
export function installFingerprint(seed: string) {
  return createHash("sha256").update(seed).digest("hex").slice(0, 32)
}
