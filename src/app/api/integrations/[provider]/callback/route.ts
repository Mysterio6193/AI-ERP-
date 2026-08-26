import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"
import { exchangeCodeForTokens, expiryFrom, verifyState } from "@/lib/integrations/oauth"
import { getProvider } from "@/lib/integrations/providers"
import { encryptSecret } from "@/lib/secure-store"

/**
 * Where the provider sends the browser back.
 *
 * This runs before the user is known from a session — the request arrives from
 * Google, not from our app — so identity comes entirely from the signed state.
 * That signature is checked before anything is written, because the whole point
 * of the attack this prevents is getting a token stored against the wrong user.
 */

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/integrations", request.nextUrl.origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerId } = await params
  const provider = getProvider(providerId)

  if (!provider) return back(request, { error: `Unknown integration "${providerId}".` })

  const code = request.nextUrl.searchParams.get("code")
  const rawState = request.nextUrl.searchParams.get("state")
  const denied = request.nextUrl.searchParams.get("error")

  // The user pressed Cancel on the consent screen. Not an error worth alarming
  // anybody about, but it must not look like it worked.
  if (denied) return back(request, { error: `${provider.name} connection was cancelled.` })
  if (!code || !rawState) return back(request, { error: "The provider did not send back a code." })

  const verdict = verifyState(rawState)
  if (!verdict.ok) return back(request, { error: verdict.reason })

  if (verdict.state.provider !== provider.id) {
    return back(request, { error: "This link was started for a different integration." })
  }

  try {
    const baseUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin
    const tokens = await exchangeCodeForTokens({ provider, code, baseUrl })

    if (tokens.error || (!tokens.access_token && !tokens.authed_user?.access_token)) {
      return back(request, {
        error: tokens.error_description || tokens.error || `${provider.name} did not return a token.`,
      })
    }

    // Slack answers with the granting user's token nested rather than at the
    // top level, so both shapes are read before deciding there is no token.
    const accessToken = tokens.access_token || tokens.authed_user?.access_token || ""

    let accountEmail: string | null = null
    let accountName: string | null = tokens.workspace_name ?? null

    if (provider.profileUrl && accessToken) {
      try {
        const profile = await fetch(provider.profileUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }).then((response) => response.json())

        accountEmail = profile.email || profile.mail || profile.userPrincipalName || null
        accountName = accountName || profile.name || profile.displayName || null
      } catch {
        // Not fatal. The connection works; we just cannot label which account
        // it is, and saying nothing is better than guessing wrong.
      }
    }

    accountEmail = accountEmail || tokens.owner?.user?.person?.email || null
    accountName = accountName || tokens.owner?.user?.name || null

    await db.integrationConnection.upsert({
      where: { provider_userId: { provider: provider.id, userId: verdict.state.userId } },
      create: {
        provider: provider.id,
        category: provider.category,
        userId: verdict.state.userId,
        companyId: await getActiveCompanyId(request).catch(() => null),
        status: "connected",
        accountEmail,
        accountName,
        accessTokenEnc: encryptSecret(accessToken),
        refreshTokenEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
        expiresAt: expiryFrom(tokens.expires_in),
        scopes: tokens.scope || provider.scopes.join(" ") || null,
        lastSyncAt: new Date(),
        lastError: null,
      },
      update: {
        status: "connected",
        accountEmail,
        accountName,
        accessTokenEnc: encryptSecret(accessToken),
        // A re-consent that returns no refresh token must not wipe the one we
        // already have, or the connection silently becomes an hour long.
        ...(tokens.refresh_token ? { refreshTokenEnc: encryptSecret(tokens.refresh_token) } : {}),
        expiresAt: expiryFrom(tokens.expires_in),
        scopes: tokens.scope || provider.scopes.join(" ") || null,
        lastSyncAt: new Date(),
        lastError: null,
      },
    })

    return back(request, { connected: provider.name })
  } catch (error) {
    console.error(`Integration callback failed for ${provider.id}:`, error)
    return back(request, {
      error: error instanceof Error ? error.message : `Could not finish connecting ${provider.name}.`,
    })
  }
}
