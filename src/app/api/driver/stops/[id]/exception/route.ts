import { NextRequest, NextResponse } from "next/server"
import { requireDriverSession } from "@/lib/driver-auth"
import { db } from "@/lib/db"
import {
  DeliveryStopValidationError,
  updateDeliveryStop,
} from "@/lib/driver-stop-actions"

export async function POST(
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
    const nextStatus = body?.status === "returned" ? "returned" : "failed"
    const updated = await db.$transaction((tx) =>
      updateDeliveryStop(tx, id, {
        status: nextStatus,
        notes: body?.notes,
        exceptionReason: body?.exceptionReason,
        exceptionPhotoUrl: body?.exceptionPhotoUrl,
        rescheduleRequested: body?.rescheduleRequested,
      })
    )

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Error reporting driver stop exception:", error)
    if (error instanceof DeliveryStopValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { success: false, error: "Failed to report stop exception" },
      { status: 500 }
    )
  }
}
