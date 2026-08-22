import { NextRequest, NextResponse } from "next/server"

import { ensureAccountingIntegrations, getDefaultCompanyId, safeJsonParse } from "@/lib/accounting"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

const prisma = db as any

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.accounting)
    if (!auth.user) return auth.response

    const companyId = await getDefaultCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const integrations = await ensureAccountingIntegrations(companyId)

    return NextResponse.json({
      success: true,
      data: integrations.map((integration: any) => ({
        ...integration,
        config: safeJsonParse(integration.configJson, {}),
      })),
    })
  } catch (error) {
    console.error("Accounting integrations fetch error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch accounting integrations" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.accounting)
    if (!auth.user) return auth.response

    const companyId = await getDefaultCompanyId()
    const body = await request.json()

    if (!companyId || !body.provider) {
      return NextResponse.json({ success: false, error: "Provider is required" }, { status: 400 })
    }

    const integration = await prisma.accountingIntegration.upsert({
      where: {
        provider_companyId: {
          provider: String(body.provider).trim(),
          companyId,
        },
      },
      update: {
        category: body.category?.trim() || undefined,
        status: body.status?.trim() || undefined,
        displayName: body.displayName?.trim() || undefined,
        connectionRef: body.connectionRef?.trim() || null,
        configJson: body.config ? JSON.stringify(body.config) : undefined,
        lastSyncAt: body.lastSyncAt ? new Date(body.lastSyncAt) : undefined,
        notes: body.notes?.trim() || null,
      },
      create: {
        provider: String(body.provider).trim(),
        category: body.category?.trim() || "accounting",
        status: body.status?.trim() || "disconnected",
        displayName: body.displayName?.trim() || String(body.provider).trim(),
        connectionRef: body.connectionRef?.trim() || null,
        configJson: body.config ? JSON.stringify(body.config) : null,
        lastSyncAt: body.lastSyncAt ? new Date(body.lastSyncAt) : null,
        notes: body.notes?.trim() || null,
        companyId,
      },
    })

    return NextResponse.json({ success: true, data: integration })
  } catch (error) {
    console.error("Accounting integrations save error:", error)
    return NextResponse.json({ success: false, error: "Failed to save accounting integration" }, { status: 500 })
  }
}
