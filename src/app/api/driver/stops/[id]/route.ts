import { NextRequest, NextResponse } from "next/server"
import { requireDriverSession } from "@/lib/driver-auth"
import { db } from "@/lib/db"
import { getDriverStopDetail } from "@/lib/driver-delivery"
import {
  DeliveryStopValidationError,
  updateDeliveryStop,
} from "@/lib/driver-stop-actions"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const driver = await requireDriverSession(request)
    if (!driver) {
      return NextResponse.json(
        { success: false, error: "Not signed in" },
        { status: 401 }
      )
    }

    const { id } = await params
    const stop = await getDriverStopDetail(db, id)

    if (!stop || stop.driverId !== driver.id) {
      return NextResponse.json(
        { success: false, error: "Stop not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: stop })
  } catch (error) {
    console.error("Error fetching driver stop:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch driver stop" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const driver = await requireDriverSession(request)
    if (!driver) {
      return NextResponse.json(
        { success: false, error: "Not signed in" },
        { status: 401 }
      )
    }

    const { id } = await params
    const existing = await db.delivery.findUnique({
      where: { id },
      select: {
        id: true,
        driverId: true,
      },
    })

    if (!existing || existing.driverId !== driver.id) {
      return NextResponse.json(
        { success: false, error: "Stop not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const updated = await db.$transaction((tx) => updateDeliveryStop(tx, id, body))
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Error updating driver stop:", error)
    if (error instanceof DeliveryStopValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { success: false, error: "Failed to update driver stop" },
      { status: 500 }
    )
  }
}
