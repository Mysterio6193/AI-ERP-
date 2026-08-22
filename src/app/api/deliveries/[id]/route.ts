import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  DeliveryStopValidationError,
  updateDeliveryStop,
} from "@/lib/driver-stop-actions"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const delivery = await db.$transaction((tx) => updateDeliveryStop(tx, id, body))

    return NextResponse.json({ success: true, data: delivery })
  } catch (error) {
    console.error("Error updating delivery:", error)
    if (error instanceof DeliveryStopValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { success: false, error: "Failed to update delivery" },
      { status: 500 }
    )
  }
}
