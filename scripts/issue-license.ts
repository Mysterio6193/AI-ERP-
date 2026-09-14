/**
 * Issues a signed licence for a self-hosted install.
 *
 * Run this where the private key lives — your machine or a build box, never an
 * application server. The install being licensed needs only the public half.
 *
 *   # once, to create the pair
 *   npx tsx scripts/issue-license.ts --keygen
 *
 *   # then, per customer
 *   LICENSE_PRIVATE_KEY="$(cat license-private.pem)" \
 *     npx tsx scripts/issue-license.ts \
 *       --plan enterprise --to "RDM Pizza Group" --seats 50 --days 365
 *
 * The key is printed once and never stored here. What the customer's install
 * keeps is a SHA-256 of it, so losing a key means issuing another, not
 * recovering the old one.
 */
import { randomUUID, randomBytes } from "node:crypto"

import {
  generateLicenseKeyPair,
  hashLicenseKey,
  issueLicense,
  licenseHint,
  verifyLicense,
  type LicensePayload,
} from "../src/lib/subscription/license"

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1 || index === process.argv.length - 1) return fallback
  return process.argv[index + 1]
}

function has(name: string) {
  return process.argv.includes(`--${name}`)
}

function fail(message: string): never {
  console.error(`✖ ${message}`)
  process.exit(1)
}

function main() {
  if (has("keygen")) {
    const pair = generateLicenseKeyPair()
    console.log("# Public half — put this in the install's LICENSE_PUBLIC_KEY")
    console.log(pair.publicKey)
    console.log("# Private half — keep this off the application servers")
    console.log(pair.privateKey)
    return
  }

  const privateKey = process.env.LICENSE_PRIVATE_KEY?.replace(/\\n/g, "\n")

  if (!privateKey) {
    fail("LICENSE_PRIVATE_KEY is not set. Run with --keygen first, or export the key.")
  }

  const plan = arg("plan")
  const issuedTo = arg("to")

  if (!plan) fail("--plan is required (the plan code, e.g. enterprise)")
  if (!issuedTo) fail('--to is required (e.g. --to "RDM Pizza Group")')

  const seats = Number(arg("seats", "1"))

  if (!Number.isInteger(seats) || seats < 1) {
    fail("--seats must be a whole number of at least 1")
  }

  const daysArg = arg("days")
  // No --days means perpetual, which is a real product decision rather than an
  // oversight, so it is stated explicitly in the output below.
  const days = daysArg === undefined ? null : Number(daysArg)

  if (days !== null && (!Number.isInteger(days) || days < 1)) {
    fail("--days must be a whole number of at least 1, or omitted for perpetual")
  }

  const payload: LicensePayload = {
    id: `lic_${randomUUID()}`,
    plan,
    issuedTo,
    seats,
    issued: new Date().toISOString(),
    ...(days === null ? {} : { expires: new Date(Date.now() + days * 86_400_000).toISOString() }),
    nonce: randomBytes(9).toString("base64url"),
  }

  const key = issueLicense(payload, privateKey)

  // Verify what was just signed before handing it over. A key that does not
  // verify is worse than no key — the customer would find out, not us.
  const publicKey = process.env.LICENSE_PUBLIC_KEY?.replace(/\\n/g, "\n")

  if (publicKey) {
    const check = verifyLicense(key, publicKey)
    if (!check.valid) {
      fail(`Signed a key that does not verify against LICENSE_PUBLIC_KEY: ${check.reason}`)
    }
  }

  console.log("")
  console.log(`  Plan       ${plan}`)
  console.log(`  Issued to  ${issuedTo}`)
  console.log(`  Seats      ${seats}`)
  console.log(`  Expires    ${payload.expires ? payload.expires.slice(0, 10) : "never (perpetual)"}`)
  console.log(`  Hint       ${licenseHint(key)}`)
  console.log(`  SHA-256    ${hashLicenseKey(key)}`)
  console.log(`  Verified   ${publicKey ? "yes, against LICENSE_PUBLIC_KEY" : "not checked (no LICENSE_PUBLIC_KEY set)"}`)
  console.log("")
  console.log("  Licence key — shown once, paste into the customer's Licence screen:")
  console.log("")
  console.log(key)
  console.log("")
}

main()
