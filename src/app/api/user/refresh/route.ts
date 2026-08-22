import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { refreshCustomerSession } from "@/lib/customer-auth"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const tokens = await refreshCustomerSession(body.refresh)

    if (!tokens) {
      return customerError(request, "Invalid refresh token.", 401)
    }

    return customerJson(request, {
      success: true,
      message: "Token refreshed successfully.",
      data: tokens,
    })
  } catch (error) {
    console.error("Customer refresh error:", error)
    return customerError(request, "Failed to refresh session.", 500)
  }
}
