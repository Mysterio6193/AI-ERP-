import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { syncRouteMetrics } from "@/lib/delivery-routes"
import { ROLE_SETS } from "@/lib/permissions"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.operations)
    if (!auth.user) return auth.response

    const { id } = await params
    const body = await request.json()
    const { driverId, vehicle, status } = body

    const existingRoute = await db.deliveryRoute.findUnique({
      where: { id },
    })

    if (!existingRoute) {
      return NextResponse.json(
        { success: false, error: "Route not found" },
        { status: 404 }
      )
    }

    const route = await db.deliveryRoute.update({
      where: { id },
      data: {
        driverId: driverId !== undefined ? driverId || null : existingRoute.driverId,
        vehicle: vehicle !== undefined ? vehicle || null : existingRoute.vehicle,
        status: status || existingRoute.status,
        startTime:
          status === "in_progress"
            ? existingRoute.startTime || new Date()
            : status === "planned"
              ? null
              : existingRoute.startTime,
        endTime:
          status === "completed"
            ? new Date()
            : status === "planned" || status === "in_progress"
              ? null
              : existingRoute.endTime,
      },
    })

    if (driverId !== undefined) {
      await db.delivery.updateMany({
        where: { routeId: id },
        data: { driverId: driverId || null },
      })
    }

    const syncedRoute = await syncRouteMetrics(db, route.id)
    return NextResponse.json({ success: true, data: syncedRoute || route })
  } catch (error) {
    console.error("Error updating route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update route" },
      { status: 500 }
    )
  }
}
