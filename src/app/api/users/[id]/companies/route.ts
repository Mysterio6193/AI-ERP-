import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { db } from "@/lib/db"

/**
 * Which entities a staff member may act as.
 *
 * Admins reach every company by role, so grants are only meaningful for
 * everybody else — which is the point: someone working across manufacturing and
 * retail no longer has to be made an admin to see both.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminUserFromRequest(request)
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const [user, grants, companies] = await Promise.all([
    db.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, companyId: true } }),
    db.userCompany.findMany({ where: { userId: id }, select: { companyId: true } }),
    db.company.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ])

  if (!user) return NextResponse.json({ success: false, error: "No such user" }, { status: 404 })

  return NextResponse.json({
    success: true,
    data: {
      user,
      companies,
      grantedIds: grants.map((grant) => grant.companyId),
      // An admin's access does not come from grants, so the UI should say so
      // rather than showing an empty list that looks like no access.
      allByRole: user.role === "admin",
    },
  })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminUserFromRequest(request)
  if (!actor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  if (actor.role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Only an admin can change which companies someone can access." },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const companyIds: string[] = Array.isArray(body.companyIds) ? body.companyIds.map(String) : []

  const user = await db.user.findUnique({ where: { id }, select: { id: true, companyId: true } })
  if (!user) return NextResponse.json({ success: false, error: "No such user" }, { status: 404 })

  // Only ids that exist, so a stale form cannot grant access to a company that
  // was deleted while it was open.
  const valid = await db.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true },
  })

  const validIds = valid.map((company) => company.id)

  await db.$transaction([
    db.userCompany.deleteMany({ where: { userId: id, companyId: { notIn: validIds } } }),
    ...validIds.map((companyId) =>
      db.userCompany.upsert({
        where: { userId_companyId: { userId: id, companyId } },
        create: { userId: id, companyId },
        update: {},
      })
    ),
  ])

  return NextResponse.json({ success: true, data: { userId: id, companyIds: validIds } })
}
