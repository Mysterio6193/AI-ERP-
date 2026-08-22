import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { normalizeCommerceSettings } from "@/lib/commerce"
import { ROLE_SETS } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.staff)
    if (!auth.user) return auth.response

    const existing = await db.commerceSettings.findFirst({
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json({
      success: true,
      data: normalizeCommerceSettings(existing),
    })
  } catch (error) {
    console.error("Error fetching commerce settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch commerce settings" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.adminOnly)
    if (!auth.user) return auth.response

    const body = await request.json()
    const data = normalizeCommerceSettings(body)
    const company = await db.company.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    const existing = await db.commerceSettings.findFirst({
      orderBy: { createdAt: "asc" },
    })

    const persisted = existing
      ? await db.commerceSettings.update({
          where: { id: existing.id },
          data: {
            ...data,
            companyId: existing.companyId || company?.id || null,
          },
        })
      : await db.commerceSettings.create({
          data: {
            ...data,
            companyId: company?.id || null,
          },
        })

    return NextResponse.json({ success: true, data: persisted })
  } catch (error) {
    console.error("Error saving commerce settings:", error)
    return NextResponse.json(
      { success: false, error: "Failed to save commerce settings" },
      { status: 500 }
    )
  }
}
