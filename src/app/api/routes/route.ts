import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import {
  backfillDeliveryRoutes,
  ensureDefaultDriver,
  ensureRouteForOrder,
  syncRouteMetrics,
} from "@/lib/delivery-routes"
import { buildRoutePayloads } from "@/lib/driver-delivery"

/**
 * Delivery routes.
 *
 * The GET used to call `backfillDeliveryRoutes` on every request, so reading
 * the routes screen created data: it scanned every packed, dispatched and
 * delivered order in the business and materialised deliveries as a side
 * effect. A delivery existed because somebody happened to open a page.
 *
 * Orders now get their delivery on the pack path, where it belongs. Reading is
 * a read, and the backfill is an explicit action for the historical backlog.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || ""
    const driverId = searchParams.get("driverId") || ""

    const data = await buildRoutePayloads(db, {
      status: status || undefined,
      driverId: driverId || undefined,
    })

    // Surfaced rather than silently repaired, so the backlog is visible and
    // fixing it stays a decision.
    const covered = await db.delivery.findMany({
      where: { orderId: { not: null } },
      select: { orderId: true },
    })

    const missingDeliveries = await db.salesOrder.count({
      where: {
        status: { in: ["packed", "dispatched", "delivered"] },
        id: { notIn: covered.map((row) => row.orderId!).filter(Boolean) },
      },
    })

    return NextResponse.json({ success: true, data, meta: { missingDeliveries } })
  } catch (error) {
    console.error("Error fetching routes:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch routes" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const body = await request.json().catch(() => ({}))
    const companyId = await getActiveCompanyId(request)

    if (body.action === "backfill") {
      const result = await backfillDeliveryRoutes(db)
      return NextResponse.json({ success: true, data: result })
    }

    const routeDate = body.routeDate ? new Date(body.routeDate) : new Date()

    if (Number.isNaN(routeDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "That is not a valid route date." },
        { status: 400 }
      )
    }

    const warehouse = body.warehouseId
      ? await db.warehouse.findUnique({
          where: { id: String(body.warehouseId) },
          select: { id: true, name: true },
        })
      : await db.warehouse.findFirst({
          where: companyId ? { companyId } : undefined,
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { id: true, name: true },
        })

    if (!warehouse) {
      return NextResponse.json(
        { success: false, error: "No warehouse to plan a route from." },
        { status: 400 }
      )
    }

    // A route with nobody on it cannot be driven, and the default driver is
    // created on demand rather than blocking the plan.
    const driverId = body.driverId
      ? String(body.driverId)
      : (await ensureDefaultDriver(db, companyId))?.id ?? null

    // Returns the existing route when one already covers this date, warehouse
    // and driver, so planning twice does not produce two half-full runs.
    const route = await ensureRouteForOrder(db, {
      routeDate,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      companyId,
      driverId,
    })

    await syncRouteMetrics(db, route.id)

    return NextResponse.json({ success: true, data: route }, { status: 201 })
  } catch (error) {
    console.error("Error creating route:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create route" },
      { status: 500 }
    )
  }
}
