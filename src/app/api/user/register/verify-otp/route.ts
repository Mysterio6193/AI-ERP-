import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { normalizeEmail } from "@/lib/customer-auth"
import { rateLimit, resetRateLimit } from "@/lib/rate-limit"

const prisma = db as any

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = normalizeEmail(body.email)
    const otp = String(body.otp || "").trim()

    // A six-digit code is a million guesses; unthrottled that is minutes of
    // work. Ten attempts per email per 10 minutes makes it impractical while
    // leaving room for someone fat-fingering the code.
    const limitKey = `otp-verify:${email}`
    const limit = rateLimit({ key: limitKey, limit: 10, windowSeconds: 600 })

    if (!limit.ok) {
      return customerError(
        request,
        `Too many attempts. Request a new code or try again in ${limit.retryAfterSeconds} seconds.`,
        429
      )
    }

    const customer = await prisma.customer.findFirst({
      where: { email },
    })

    if (!customer || !customer.otpCode || !customer.otpExpiresAt) {
      return customerError(request, "No pending verification found for this email.", 404)
    }

    if (customer.otpExpiresAt < new Date()) {
      return customerError(request, "The OTP has expired. Please request a new code.", 400)
    }

    if (customer.otpCode !== otp) {
      return customerError(request, "Invalid OTP.", 400)
    }

    resetRateLimit(limitKey)

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        emailVerifiedAt: new Date(),
        otpCode: null,
        otpExpiresAt: null,
      },
    })

    return customerJson(request, {
      success: true,
      message: "Account verified successfully.",
    })
  } catch (error) {
    console.error("Customer verify otp error:", error)
    return customerError(request, "Failed to verify OTP.", 500)
  }
}
