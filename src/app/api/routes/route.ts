import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { backfillDeliveryRoutes } from "@/lib/delivery-routes"
import { buildRoutePayloads } from "@/lib/driver-delivery"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    await backfillDeliveryRoutes(db)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || ""
    const driverId = searchParams.get("driverId") || ""

    const data = await buildRoutePayloads(db, {
      status: status || undefined,
      driverId: driverId || undefined,
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error fetching routes:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch routes" },
      { status: 500 }
    )
  }
}
