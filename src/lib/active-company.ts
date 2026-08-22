import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { db } from "@/lib/db"

/**
 * Which legal entity the request is acting as.
 *
 * This group bills from several companies - manufacturing, retail and
 * equipment are separate ABNs - and most of the app previously resolved the
 * company with `findFirst()`. With one company that was correct by accident;
 * with three it silently picks whichever row sorts first, so an invoice could
 * go out under the wrong ABN.
 *
 * Resolution order:
 *   1. the entity the user explicitly switched to, if they may see it
 *   2. the company their user record belongs to
 *   3. the only company that exists (single-entity installs)
 */

export const ACTIVE_COMPANY_COOKIE = "supplysure_active_company"

export interface ActiveCompany {
  id: string
  name: string
  tradingName: string | null
  abn: string | null
  country: string
  baseCurrency: string
}

const SELECT = {
  id: true,
  name: true,
  tradingName: true,
  abn: true,
  country: true,
  baseCurrency: true,
} as const

/**
 * Entities this user may act as.
 *
 * Admins can span the group, which is how one person runs three companies
 * without three logins. Everyone else is confined to their own entity.
 */
export async function listCompaniesForUser(userId: string | null, role?: string) {
  if (role === "admin") {
    return db.company.findMany({ orderBy: { createdAt: "asc" }, select: SELECT })
  }

  if (!userId) {
    return []
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  })

  if (!user?.companyId) {
    return db.company.findMany({ orderBy: { createdAt: "asc" }, take: 1, select: SELECT })
  }

  return db.company.findMany({ where: { id: user.companyId }, select: SELECT })
}

export async function getActiveCompany(request: NextRequest): Promise<ActiveCompany | null> {
  const user = await getAdminUserFromRequest(request)
  const requested = request.cookies.get(ACTIVE_COMPANY_COOKIE)?.value

  if (requested) {
    // Never trust the cookie alone - confirm the user may act as this entity,
    // or a switched cookie becomes a way to read another company's books.
    const permitted = await listCompaniesForUser(user?.id ?? null, user?.role)
    const match = permitted.find((company) => company.id === requested)

    if (match) {
      return match
    }
  }

  if (user?.id) {
    const record = await db.user.findUnique({
      where: { id: user.id },
      select: { company: { select: SELECT } },
    })

    if (record?.company) {
      return record.company
    }
  }

  return db.company.findFirst({ orderBy: { createdAt: "asc" }, select: SELECT })
}

/** The active company's id, or null. Convenience for `where` clauses. */
export async function getActiveCompanyId(request: NextRequest) {
  const company = await getActiveCompany(request)
  return company?.id ?? null
}

export function attachActiveCompanyCookie(response: NextResponse, companyId: string) {
  response.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })

  return response
}
