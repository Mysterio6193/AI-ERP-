import { compare } from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  createDriverSessionToken,
  getDriverFromSessionToken,
  requireDriverSession,
} from "@/lib/driver-auth"

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
    console.error("Error fetching driver session:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch driver session" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body?.email || "").trim().toLowerCase()
    const password = String(body?.password || "")

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      )
    }

    const driver = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
        status: true,
        phone: true,
        avatar: true,
        licenseNumber: true,
        vehicleId: true,
        companyId: true,
      },
    })

    if (!driver || driver.role !== "driver" || driver.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Invalid driver credentials." },
        { status: 401 }
      )
    }

    const passwordMatches = driver.password.startsWith("$2")
      ? await compare(password, driver.password)
      : password === driver.password

    if (!passwordMatches) {
      return NextResponse.json(
        { success: false, error: "Invalid driver credentials." },
        { status: 401 }
      )
    }

    const token = createDriverSessionToken({
      sub: driver.id,
      email: driver.email,
      companyId: driver.companyId,
      role: driver.role,
    })

    const sessionDriver = await getDriverFromSessionToken(token)

    return NextResponse.json({
      success: true,
      data: {
        token,
        driver: sessionDriver,
      },
    })
  } catch (error) {
    console.error("Error creating driver session:", error)
    return NextResponse.json(
      { success: false, error: "Failed to sign in" },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  return NextResponse.json({ success: true })
}
