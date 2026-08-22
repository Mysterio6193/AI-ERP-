import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.finance)
    if (!auth.user) return auth.response

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || ""
    const search = searchParams.get("search") || ""

    const applications = await db.creditApplication.findMany({
      where: {
        AND: [
          status ? { status } : {},
          search
            ? {
                OR: [
                  { businessName: { contains: search, mode: "insensitive" } },
                  { tradingName: { contains: search, mode: "insensitive" } },
                  { contactEmail: { contains: search, mode: "insensitive" } },
                  { customer: { name: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {},
        ],
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            creditLimit: true,
            creditStatus: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const summary = {
      total: applications.length,
      submitted: applications.filter((item) => item.status === "submitted").length,
      underReview: applications.filter((item) => item.status === "under_review").length,
      approved: applications.filter((item) => item.status === "approved").length,
      requestedValue: applications.reduce((sum, item) => sum + item.requestedLimit, 0),
    }

    return NextResponse.json({ success: true, data: applications, summary })
  } catch (error) {
    console.error("Error fetching credit applications:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch credit applications" },
      { status: 500 }
    )
  }
}
