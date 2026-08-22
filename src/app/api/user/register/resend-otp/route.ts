import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import {
  generateOtp,
  normalizeEmail,
  otpExpiresAt,
  shouldExposeCustomerOtp,
} from "@/lib/customer-auth"

const prisma = db as any

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = normalizeEmail(body.email)
    const customer = await prisma.customer.findFirst({
      where: { email },
    })

    if (!customer) {
      return customerError(request, "Customer not found.", 404)
    }

    const otpCode = generateOtp()
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        otpCode,
        otpExpiresAt: otpExpiresAt(),
      },
    })

    const exposedOtp = shouldExposeCustomerOtp() ? otpCode : undefined

    return customerJson(request, {
      success: true,
      message: "OTP sent successfully.",
      data: {
        otp: exposedOtp,
        otp_delivery: exposedOtp ? "debug" : "external",
      },
    })
  } catch (error) {
    console.error("Customer resend otp error:", error)
    return customerError(request, "Failed to resend OTP.", 500)
  }
}
