import { NextRequest, NextResponse } from "next/server"

import {
  attachActiveCompanyCookie,
  getActiveCompany,
  listCompaniesForUser,
} from "@/lib/active-company"
import { getAdminUserFromRequest } from "@/lib/admin-auth"

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

export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const companyId = String(body.companyId || "")

  if (!companyId) {
    return NextResponse.json({ success: false, error: "companyId is required" }, { status: 400 })
  }

  const permitted = await listCompaniesForUser(user.id, user.role)
  const match = permitted.find((company) => company.id === companyId)

  if (!match) {
    return NextResponse.json(
      { success: false, error: "You do not have access to that company" },
      { status: 403 }
    )
  }

  const response = NextResponse.json({ success: true, data: match })
  return attachActiveCompanyCookie(response, companyId)
}
