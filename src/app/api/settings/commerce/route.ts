import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { normalizeCommerceSettings } from "@/lib/commerce"

export async function GET() {
  try {
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

export async function PUT(request: Request) {
  try {
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
