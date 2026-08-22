import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions, mapProfile } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const profile = mapProfile(customer)
    return customerJson(request, {
      success: true,
      message: "Profile fetched successfully.",
      data: profile,
      ...profile,
    })
  } catch (error) {
    console.error("Customer profile error:", error)
    return customerError(request, "Failed to fetch profile.", 500)
  }
}
