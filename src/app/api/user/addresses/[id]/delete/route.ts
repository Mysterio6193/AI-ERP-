import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const { id } = await params
    const existing = await db.customerLocation.findFirst({
      where: { id, customerId: customer.id },
    })

    if (!existing) {
      return customerError(request, "Address not found.", 404)
    }

    await db.customerLocation.delete({
      where: { id },
    })

    return customerJson(request, {
      success: true,
      message: "Address deleted successfully.",
    })
  } catch (error) {
    console.error("Customer delete address error:", error)
    return customerError(request, "Failed to delete address.", 500)
  }
}
