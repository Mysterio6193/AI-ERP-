import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ensureDefaultDriver } from "@/lib/delivery-routes"
import { ROLE_SETS } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.operations)
    if (!auth.user) return auth.response

    await ensureDefaultDriver(db)

    const drivers = await db.user.findMany({
      where: {
        role: "driver",
        status: "active",
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        licenseNumber: true,
        vehicleId: true,
        companyId: true,
      },
    })

    return NextResponse.json({ success: true, data: drivers })
  } catch (error) {
    console.error("Error fetching drivers:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch drivers" },
      { status: 500 }
    )
  }
}
