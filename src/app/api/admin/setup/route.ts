import { NextRequest, NextResponse } from "next/server"

import {
  attachAdminSessionCookie,
  createInitialAdmin,
  getAdminSetupState,
  signAdminSessionToken,
} from "@/lib/admin-auth"

export async function GET() {
  try {
    const state = await getAdminSetupState()
    return NextResponse.json({ success: true, data: state })
  } catch (error) {
    console.error("Admin setup state error:", error)
    return NextResponse.json({ success: false, error: "Failed to load setup state." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const state = await getAdminSetupState()
    if (!state.needsSetup) {
      return NextResponse.json(
        { success: false, error: "Initial setup is already complete." },
        { status: 409 }
      )
    }

    const body = await request.json()
    const companyName = String(body.companyName || "").trim()
    const name = String(body.name || "").trim()
    const email = String(body.email || "").trim()
    const password = String(body.password || "")
    const confirmPassword = String(body.confirmPassword || "")

    if (!companyName || !name || !email || !password) {
      return NextResponse.json(
        { success: false, error: "Company name, full name, email, and password are required." },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters." },
        { status: 400 }
      )
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "Passwords do not match." },
        { status: 400 }
      )
    }

    const user = await createInitialAdmin({
      companyName,
      name,
      email,
      password,
    })

    const token = await signAdminSessionToken(user)
    const response = NextResponse.json({
      success: true,
      data: {
        user,
      },
    })

    attachAdminSessionCookie(response, token)
    return response
  } catch (error) {
    console.error("Admin setup error:", error)
    return NextResponse.json({ success: false, error: "Failed to complete setup." }, { status: 500 })
  }
}
