import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { getCustomerLoginBlockReason } from "@/lib/customer-access"
import { createCustomerSession, normalizeEmail, verifyPassword } from "@/lib/customer-auth"
import { customerError, customerJson, customerOptions, mapProfile } from "@/lib/customer-api"

const prisma = db as any

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = normalizeEmail(body.email)
    const password = body.password || ""

    const customer = await prisma.customer.findFirst({
      where: { email },
      include: { cartItems: true },
    })

    if (!customer || !(await verifyPassword(password, customer.passwordHash))) {
      return customerError(request, "Invalid email or password.", 401)
    }

    const loginBlockReason = getCustomerLoginBlockReason(customer)
    if (loginBlockReason) {
      return customerError(request, loginBlockReason, 403)
    }

    if (!customer.emailVerifiedAt) {
      return customerError(request, "Please verify your account before signing in.", 403)
    }

    const tokens = await createCustomerSession(customer.id)

    return customerJson(request, {
      success: true,
      message: "Login successful.",
      data: {
        tokens,
        user: mapProfile(customer),
      },
    })
  } catch (error) {
    console.error("Customer login error:", error)
    return customerError(request, "Failed to login customer.", 500)
  }
}
