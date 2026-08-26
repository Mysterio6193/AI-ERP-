import { describe, expect, it } from "vitest"

import {
  MissingEncryptionKeyError,
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
  maskSecret,
} from "@/lib/secure-store"

const env = { INTEGRATION_ENCRYPTION_KEY: "a".repeat(64) } as unknown as NodeJS.ProcessEnv
const other = { INTEGRATION_ENCRYPTION_KEY: "b".repeat(64) } as unknown as NodeJS.ProcessEnv

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a token", () => {
    const token = "ya29.a0AfB_refresh_token_value"
    expect(decryptSecret(encryptSecret(token, env), env)).toBe(token)
  })

  it("produces different ciphertext each time", () => {
    // Same token twice must not look the same at rest, or a dump reveals which
    // accounts share a credential.
    const a = encryptSecret("same-token", env)
    const b = encryptSecret("same-token", env)

    expect(a).not.toBe(b)
    expect(decryptSecret(a, env)).toBe(decryptSecret(b, env))
  })

  it("refuses a value encrypted under a different key", () => {
    const stored = encryptSecret("token", env)
    expect(() => decryptSecret(stored, other)).toThrow()
  })

  it("detects tampering rather than decrypting to something else", () => {
    const stored = encryptSecret("token", env)
    const parts = stored.split(":")
    const flipped = Buffer.from(parts[3], "base64")
    flipped[0] ^= 0xff
    parts[3] = flipped.toString("base64")

    expect(() => decryptSecret(parts.join(":"), env)).toThrow()
  })

  it("rejects a truncated or foreign value", () => {
    for (const junk of ["", "not-encrypted", "v1:only:three", "v2:a:b:c"]) {
      expect(() => decryptSecret(junk, env)).toThrow()
    }
  })

  it("handles unicode and long values", () => {
    const value = `refresh—${"x".repeat(2000)}—café`
    expect(decryptSecret(encryptSecret(value, env), env)).toBe(value)
  })

  it("will not invent a key when none is configured", () => {
    // A default key is the same as no encryption, except it looks encrypted.
    expect(() => encryptSecret("token", {} as unknown as NodeJS.ProcessEnv)).toThrow(MissingEncryptionKeyError)
    expect(isEncryptionConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it("rejects a key too short to be meant seriously", () => {
    expect(() => encryptSecret("token", { INTEGRATION_ENCRYPTION_KEY: "short" } as unknown as NodeJS.ProcessEnv)).toThrow()
  })

  it("falls back to the app secret when no dedicated key is set", () => {
    const shared = { NEXTAUTH_SECRET: "z".repeat(40) } as unknown as NodeJS.ProcessEnv
    expect(decryptSecret(encryptSecret("token", shared), shared)).toBe("token")
  })
})

describe("maskSecret", () => {
  it("shows enough to tell two connections apart, never enough to use", () => {
    const masked = maskSecret("ya29.averylongaccesstokenvalue")
    expect(masked.startsWith("ya29")).toBe(true)
    expect(masked).not.toContain("averylongaccesstoken")
  })

  it("reveals nothing at all for a short value", () => {
    expect(maskSecret("abc")).toBe("•••")
  })
})
