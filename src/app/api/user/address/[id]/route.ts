import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions, mapAddress } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const { id } = await params
    const address = await db.customerLocation.findFirst({
      where: {
        id,
        customerId: customer.id,
      },
    })

    if (!address) {
      return customerError(request, "Address not found.", 404)
    }

    return customerJson(request, {
      success: true,
      message: "Address fetched successfully.",
      data: mapAddress(address),
    })
  } catch (error) {
    console.error("Customer single address error:", error)
    return customerError(request, "Failed to fetch address.", 500)
  }
}
