import { NextRequest, NextResponse } from "next/server"
import { requireDriverSession } from "@/lib/driver-auth"

export async function GET(request: NextRequest) {
  try {
    const driver = await requireDriverSession(request)

    if (!driver) {
      return NextResponse.json(
        { success: false, error: "Not signed in" },
        { status: 401 }
      )
    }

    return NextResponse.json({ success: true, data: driver })
  } catch (error) {
    console.error("Error fetching driver profile:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch driver profile" },
      { status: 500 }
    )
  }
}
