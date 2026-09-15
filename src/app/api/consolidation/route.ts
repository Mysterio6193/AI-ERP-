import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import {
  consolidatedGroup,
  linkCustomerToEntity,
  suggestGroupEntityLinks,
} from "@/lib/consolidation/service"

/** The group's figures, across every entity. */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // Group figures span every entity, so this is deliberately narrower than
  // the per-entity reports: seeing the whole group is not the same right as
  // seeing the entity you work in.
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)

  try {
    if (searchParams.get("view") === "suggestions") {
      return NextResponse.json({ success: true, data: await suggestGroupEntityLinks() })
    }

    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const data = await consolidatedGroup({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      presentationCurrency: searchParams.get("currency") || undefined,
      // Eliminations are on unless explicitly turned off: the consolidated
      // figure is the one that means anything outside the group.
      eliminateIntercompany: searchParams.get("eliminate") !== "false",
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to consolidate" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({}))

  if (String(body.action || "") !== "link-entity") {
    return NextResponse.json(
      { success: false, error: 'Unknown action. Expected "link-entity".' },
      { status: 400 }
    )
  }

  if (!body.customerId) {
    return NextResponse.json({ success: false, error: "customerId is required" }, { status: 400 })
  }

  try {
    const result = await linkCustomerToEntity(
      String(body.customerId),
      body.companyId ? String(body.companyId) : null
    )

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to link" },
      { status: 500 }
    )
  }
}
