import { NextRequest, NextResponse } from "next/server"
import { requireDriverSession } from "@/lib/driver-auth"
import { db } from "@/lib/db"
import { backfillDeliveryRoutes } from "@/lib/delivery-routes"
import { getDriverActiveRoute } from "@/lib/driver-delivery"

export async function GET(request: NextRequest) {
  try {
    const driver = await requireDriverSession(request)

    if (!driver) {
      return NextResponse.json(
        { success: false, error: "Not signed in" },
        { status: 401 }
      )
    }

    await backfillDeliveryRoutes(db)
    const route = await getDriverActiveRoute(db, driver.id)

    return NextResponse.json({
      success: true,
      data: route
        ? {
            driver,
            route,
          }
        : {
            driver,
            route: null,
          },
    })
  } catch (error) {
    console.error("Error fetching driver route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch driver route" },
      { status: 500 }
    )
  }
}
