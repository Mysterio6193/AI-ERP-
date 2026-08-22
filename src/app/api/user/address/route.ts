import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions, mapAddress } from "@/lib/customer-api"
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

    const locations = await db.customerLocation.findMany({
      where: { customerId: customer.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    })

    return customerJson(request, {
      success: true,
      message: "Addresses fetched successfully.",
      data: locations.map(mapAddress),
    })
  } catch (error) {
    console.error("Customer address list error:", error)
    return customerError(request, "Failed to fetch addresses.", 500)
  }
}
