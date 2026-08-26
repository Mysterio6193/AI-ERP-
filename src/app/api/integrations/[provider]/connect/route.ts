import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { buildAuthorizeUrl, encodeState } from "@/lib/integrations/oauth"
import { canManage } from "@/lib/integrations/lookup"
import { getProvider, isProviderConfigured } from "@/lib/integrations/providers"

/**
 * Start a connection.
 *
 * Signs who is connecting into the `state` parameter and sends the browser to
 * the provider. The signature is what stops a crafted link attaching somebody
 * else's mailbox to this user's profile on the way back.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) return auth.response

  const { provider: providerId } = await params
  const provider = getProvider(providerId)

  if (!provider) {
    return NextResponse.json({ success: false, error: `Unknown integration "${providerId}".` }, { status: 404 })
  }

  if (!canManage(provider, auth.user!.role)) {
    // Stopped before the consent screen rather than after it: sending someone
    // through a full OAuth grant and then refusing to save it wastes their time
    // and leaves an authorised app they did not ask for.
    return NextResponse.json(
      {
        success: false,
        error: `${provider.name} is connected once for the whole company. Ask an admin to set it up.`,
      },
      { status: 403 }
    )
  }

  if (!isProviderConfigured(provider)) {
    // Sending someone to a consent screen that cannot work wastes their time
    // and looks like the product is broken, so say what is actually missing.
    return NextResponse.json(
      {
        success: false,
        error:
          `${provider.name} has not been set up on this deployment. ` +
          `Set ${provider.clientIdEnv} and ${provider.clientSecretEnv}, then try again.`,
      },
      { status: 400 }
    )
  }

  const baseUrl =
    process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin

  const state = encodeState({ provider: provider.id, userId: auth.user!.id })

  return NextResponse.redirect(buildAuthorizeUrl({ provider, state, baseUrl }))
}
