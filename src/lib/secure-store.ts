import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"

/**
 * Encryption for third-party credentials at rest.
 *
 * An OAuth refresh token is not a session — it is a long-lived key to someone's
 * mailbox and calendar that keeps working until they revoke it. Kept in plain
 * text it means a database dump, a stray backup or a read-only SQL injection
 * hands over every connected account in the business, and nobody would know.
 *
 * AES-256-GCM, so tampering is detected rather than silently decrypted into
 * something else. Each value carries its own random IV, which is why encrypting
 * the same token twice gives different output — that is correct, not a bug.
 */

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16
const VERSION = "v1"

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      "INTEGRATION_ENCRYPTION_KEY is not set. Third-party tokens cannot be stored without it. " +
        "Generate one with: openssl rand -hex 32"
    )
    this.name = "MissingEncryptionKeyError"
  }
}

/**
 * The key, derived so any sufficiently long secret works.
 *
 * Hashed rather than used raw because AES needs exactly 32 bytes and a
 * pasted-in secret is never exactly 32 bytes. Refuses to invent one: a default
 * key is the same as no encryption, except it looks encrypted.
 */
function getKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret = env.INTEGRATION_ENCRYPTION_KEY || env.NEXTAUTH_SECRET

  if (!secret || secret.length < 16) {
    throw new MissingEncryptionKeyError()
  }

  return createHash("sha256").update(secret).digest()
}

export function isEncryptionConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    getKey(env)
    return true
  } catch {
    return false
  }
}

/** Encrypt a credential for storage. Returns `v1:<iv>:<tag>:<ciphertext>`. */
export function encryptSecret(plainText: string, env?: NodeJS.ProcessEnv): string {
  const key = getKey(env)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":")
}

/**
 * Decrypt a stored credential.
 *
 * Throws on anything that is not intact: a truncated value, a different key, a
 * changed byte. Returning a partial or wrong token would send a malformed
 * credential to a provider and read as "their API is broken".
 */
export function decryptSecret(stored: string, env?: NodeJS.ProcessEnv): string {
  const parts = stored.split(":")

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Stored credential is not in the expected format.")
  }

  const [, ivPart, tagPart, dataPart] = parts
  const iv = Buffer.from(ivPart, "base64")
  const tag = Buffer.from(tagPart, "base64")

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Stored credential has a malformed header.")
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(env), iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]).toString("utf8")
}

/**
 * What a token looks like in a log or on screen.
 *
 * Enough to tell two connections apart, never enough to use.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "".padEnd(value.length, "•")
  return `${value.slice(0, 4)}${"•".repeat(8)}${value.slice(-4)}`
}
