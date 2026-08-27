import { NextRequest, NextResponse } from "next/server"

import { getActiveCompany, listCompaniesForUser } from "@/lib/active-company"
import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { canRaiseInvoices, validateCompany } from "@/lib/companies"
import { db } from "@/lib/db"

/** Entity list and switcher for groups that bill from more than one company. */

export async function GET(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const [companies, active] = await Promise.all([
    listCompaniesForUser(user.id, user.role),
    getActiveCompany(request),
  ])

  return NextResponse.json({
    success: true,
    data: { companies, activeId: active?.id ?? null },
  })
}

/**
 * Create an entity.
 *
 * This did not exist: POST used to mean "switch", so the only companies that
 * could ever exist were the ones demo-seed created — and demo-seed refuses to
 * run in production. A business could not add the entity it bills from.
 * Switching now lives at POST /api/companies/switch.
 */
export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  if (user.role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Only an admin can add a company." },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const verdict = validateCompany(body)

  if (!verdict.ok) {
    return NextResponse.json(
      { success: false, error: verdict.error, field: verdict.field },
      { status: 400 }
    )
  }

  // ABN is unique in the schema, so a duplicate would surface as a database
  // error. Caught here instead, where it can say which company already has it.
  if (verdict.company.abn) {
    const existing = await db.company.findUnique({
      where: { abn: verdict.company.abn },
      select: { name: true },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, field: "abn", error: `That ABN already belongs to ${existing.name}.` },
        { status: 409 }
      )
    }
  }

  const company = await db.company.create({ data: verdict.company })

  return NextResponse.json({
    success: true,
    data: company,
    // Said plainly rather than leaving someone to discover it at invoice time.
    note: canRaiseInvoices(company).ok
      ? null
      : `Created. It cannot raise invoices until you add its ${canRaiseInvoices(company).missing.join(", ")}.`,
  })
}
