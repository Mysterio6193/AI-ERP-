import { NextRequest, NextResponse } from "next/server"

import {
  attachAdminSessionCookie,
  authenticateAdminCredentials,
  clearAdminSessionCookie,
  getAdminSetupState,
  getAdminUserFromRequest,
  signAdminSessionToken,
} from "@/lib/admin-auth"
import { clientKey, rateLimit, resetRateLimit } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  try {
    const [user, setupState] = await Promise.all([
      getAdminUserFromRequest(request),
      getAdminSetupState(),
    ])

    return NextResponse.json({
      success: true,
      data: {
        authenticated: Boolean(user),
        needsSetup: setupState.needsSetup,
        user,
      },
    })
  } catch (error) {
    console.error("Admin session fetch error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch session" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const setupState = await getAdminSetupState()
    if (setupState.needsSetup) {
      return NextResponse.json(
        { success: false, error: "Complete initial admin setup first.", needsSetup: true },
        { status: 409 }
      )
    }

    const body = await request.json()
    const email = String(body.email || "").trim()
    const password = String(body.password || "")

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      )
    }

    // Keyed on address *and* the submitted email, so neither a single host
    // hammering many accounts nor a rotating-IP attack on one account gets a
    // free run at the password.
    const limitKey = `admin-login:${clientKey(request)}:${email.toLowerCase()}`
    const limit = rateLimit({ key: limitKey, limit: 8, windowSeconds: 300 })

    if (!limit.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      )
    }

    const user = await authenticateAdminCredentials(email, password)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials or inactive account." },
        { status: 401 }
      )
    }

    // A legitimate user who mistyped twice should not stay throttled.
    resetRateLimit(limitKey)

    const token = await signAdminSessionToken(user)
    const response = NextResponse.json({
      success: true,
      data: {
        authenticated: true,
        user,
      },
    })

    attachAdminSessionCookie(response, token)
    return response
  } catch (error) {
    console.error("Admin login error:", error)
    return NextResponse.json({ success: false, error: "Failed to sign in." }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  clearAdminSessionCookie(response)
  return response
}
