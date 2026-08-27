import { NextRequest, NextResponse } from "next/server"

import { attachActiveCompanyCookie, listCompaniesForUser } from "@/lib/active-company"
import { getAdminUserFromRequest } from "@/lib/admin-auth"

/**
 * Change which entity the user is acting as.
 *
 * Split out from `POST /api/companies`, which used to mean "switch" and now
 * means "create". Two different actions behind one verb is how somebody
 * eventually creates a company while trying to change between them.
 */
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

  // Checked against what this user may see, not merely that it exists — the
  // cookie decides which company's data every later request reads and writes.
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
