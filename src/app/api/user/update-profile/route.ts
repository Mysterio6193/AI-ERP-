import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions, mapProfile } from "@/lib/customer-api"
import { normalizeEmail, requireCustomer } from "@/lib/customer-auth"

const prisma = db as any

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function PATCH(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const body = await request.json()
    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        contactPerson: body.full_name?.trim() || customer.contactPerson,
        name: body.company_name?.trim() || customer.name,
        email: body.email ? normalizeEmail(body.email) : customer.email,
        phone: body.phone_no?.trim() || customer.phone,
        website: body.website?.trim() || customer.website,
      },
      include: { cartItems: true },
    })

    const profile = mapProfile(updated)
    return customerJson(request, {
      success: true,
      message: "Profile updated successfully.",
      data: profile,
      ...profile,
    })
  } catch (error) {
    console.error("Customer update profile error:", error)
    return customerError(request, "Failed to update profile.", 500)
  }
}
