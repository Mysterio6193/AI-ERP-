import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import type { ProviderDefinition } from "./providers"

/**
 * The OAuth handshake, kept in one place.
 *
 * The `state` parameter is the whole security of this flow. Without it anyone
 * can send a staff member a crafted callback URL and attach their own Google
 * account to that person's profile — the app would then read and send mail as
 * an account the attacker controls. So state is signed, carries who started the
 * flow, and expires.
 */

const STATE_TTL_MS = 10 * 60 * 1000

export interface OAuthState {
  provider: string
  userId: string
  nonce: string
  issuedAt: number
}

function stateSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.INTEGRATION_ENCRYPTION_KEY || env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error("Cannot sign OAuth state: set INTEGRATION_ENCRYPTION_KEY or NEXTAUTH_SECRET.")
  }

  return secret
}

export function encodeState(input: Omit<OAuthState, "nonce" | "issuedAt">, env?: NodeJS.ProcessEnv): string {
  const state: OAuthState = { ...input, nonce: randomBytes(9).toString("base64url"), issuedAt: Date.now() }
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url")
  const signature = createHmac("sha256", stateSecret(env)).update(payload).digest("base64url")

  return `${payload}.${signature}`
}

export type StateVerdict =
  | { ok: true; state: OAuthState }
  | { ok: false; reason: string }

export function verifyState(raw: string, env?: NodeJS.ProcessEnv): StateVerdict {
  const [payload, signature] = raw.split(".")
  if (!payload || !signature) return { ok: false, reason: "Malformed state." }

  const expected = createHmac("sha256", stateSecret(env)).update(payload).digest("base64url")
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)

  // Compared in constant time, and length-checked first because timingSafeEqual
  // throws on a length mismatch rather than returning false.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "State signature does not match. The link was altered or is not ours." }
  }

  let state: OAuthState
  try {
    state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return { ok: false, reason: "State payload is not readable." }
  }

  if (Date.now() - state.issuedAt > STATE_TTL_MS) {
    return { ok: false, reason: "This connection link has expired. Start again from Integrations." }
  }

  return { ok: true, state }
}

/** Where the provider sends the browser back to. Must match what is registered. */
export function callbackUrl(provider: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/integrations/${provider}/callback`
}

export function buildAuthorizeUrl(input: {
  provider: ProviderDefinition
  state: string
  baseUrl: string
  env?: NodeJS.ProcessEnv
}): string {
  const env = input.env ?? process.env
  const url = new URL(input.provider.authUrl)

  url.searchParams.set("client_id", env[input.provider.clientIdEnv] as string)
  url.searchParams.set("redirect_uri", callbackUrl(input.provider.id, input.baseUrl))
  url.searchParams.set("response_type", "code")
  url.searchParams.set("state", input.state)

  if (input.provider.scopes.length > 0) {
    url.searchParams.set("scope", input.provider.scopes.join(" "))
  }

  for (const [key, value] of Object.entries(input.provider.extraAuthParams ?? {})) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}

export interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  /** Slack and Notion answer with their own shapes rather than plain OAuth. */
  authed_user?: { access_token?: string }
  workspace_name?: string
  owner?: { user?: { person?: { email?: string }; name?: string } }
  error?: string
  error_description?: string
}

export async function exchangeCodeForTokens(input: {
  provider: ProviderDefinition
  code: string
  baseUrl: string
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
}): Promise<TokenResponse> {
  const env = input.env ?? process.env
  const doFetch = input.fetchImpl ?? fetch

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: callbackUrl(input.provider.id, input.baseUrl),
    client_id: env[input.provider.clientIdEnv] as string,
    client_secret: env[input.provider.clientSecretEnv] as string,
  })

  const response = await doFetch(input.provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  })

  return (await response.json()) as TokenResponse
}

/**
 * When the stored access token stops being usable.
 *
 * A minute is taken off so a token that expires mid-request is refreshed before
 * it is used rather than failing halfway through one.
 */
export function expiryFrom(expiresIn: number | undefined, now = new Date()): Date | null {
  if (!expiresIn) return null
  return new Date(now.getTime() + Math.max(0, expiresIn - 60) * 1000)
}
