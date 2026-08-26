import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { getActiveCompanyId } from "@/lib/active-company"
import { canManage, connectionWhere, describeScope } from "@/lib/integrations/lookup"
import { CATEGORY_LABEL, PROVIDERS, getProvider, isProviderConfigured } from "@/lib/integrations/providers"
import { isEncryptionConfigured } from "@/lib/secure-store"

/**
 * What each tool's state is for the person asking.
 *
 * Every provider is listed whether or not it is set up, because a tool that is
 * missing from the page is indistinguishable from one this product does not
 * support. What changes is what it says about itself.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) return auth.response

  const companyId = await getActiveCompanyId(request).catch(() => null)

  // Their own connections plus anything the company shares, since a gateway
  // connected by a colleague is still connected as far as this page goes.
  const connections = await db.integrationConnection.findMany({
    where: {
      OR: [
        { userId: auth.user!.id, scope: "user" },
        { scope: "company", companyId },
      ],
    },
    select: {
      provider: true,
      status: true,
      accountEmail: true,
      accountName: true,
      expiresAt: true,
      lastSyncAt: true,
      lastError: true,
      scopes: true,
    },
  })

  const byProvider = new Map(connections.map((row) => [row.provider, row]))
  const canStoreTokens = isEncryptionConfigured()

  return NextResponse.json({
    success: true,
    data: {
      // Said once at the top rather than on every card: without a key, no
      // connection can be stored at all, and that is a deployment problem.
      canStoreTokens,
      encryptionHint: canStoreTokens
        ? null
        : "Set INTEGRATION_ENCRYPTION_KEY before connecting anything. Generate one with: openssl rand -hex 32",
      providers: PROVIDERS.map((provider) => {
        const connection = byProvider.get(provider.id)
        const configured = isProviderConfigured(provider)

        return {
          id: provider.id,
          name: provider.name,
          vendor: provider.vendor,
          category: provider.category,
          categoryLabel: CATEGORY_LABEL[provider.category],
          summary: provider.summary,
          grants: provider.grants,
          scope: provider.scope,
          scopeLabel: describeScope(provider),
          // A salesperson can see the company gateway but must not be able to
          // disconnect the thing every invoice depends on.
          canManage: canManage(provider, auth.user!.role),
          configured,
          setupHint: configured
            ? null
            : `Needs ${provider.clientIdEnv} and ${provider.clientSecretEnv}.`,
          connection: connection
            ? {
                status: connection.status,
                account: connection.accountEmail || connection.accountName || null,
                expiresAt: connection.expiresAt,
                lastSyncAt: connection.lastSyncAt,
                lastError: connection.lastError,
              }
            : null,
        }
      }),
    },
  })
}

/** Disconnect. The token is destroyed here; the user should also revoke at the provider. */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({}))
  const providerId = String(body.provider || "")
  const provider = getProvider(providerId)

  if (!provider) {
    return NextResponse.json({ success: false, error: "Unknown integration." }, { status: 400 })
  }

  if (!canManage(provider, auth.user!.role)) {
    return NextResponse.json(
      {
        success: false,
        error: `${provider.name} is shared by the whole company. Only an admin can disconnect it.`,
      },
      { status: 403 }
    )
  }

  // Deleted rather than marked revoked: keeping a dead refresh token has no use
  // and every hour it sits there is another hour it could leak.
  await db.integrationConnection.deleteMany({
    where: connectionWhere(provider, {
      userId: auth.user!.id,
      companyId: await getActiveCompanyId(request).catch(() => null),
    }),
  })

  return NextResponse.json({
    success: true,
    data: {
      provider: provider.id,
      // Ours is gone, but the grant at the provider is not — say so plainly
      // rather than letting someone believe access is fully withdrawn.
      note: `Disconnected. To withdraw access entirely, also remove it in your ${provider.vendor} account settings.`,
    },
  })
}
