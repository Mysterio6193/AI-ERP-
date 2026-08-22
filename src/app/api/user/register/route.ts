import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import {
  generateOtp,
  hashPassword,
  normalizeEmail,
  otpExpiresAt,
  shouldExposeCustomerOtp,
} from "@/lib/customer-auth"
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
    const confirmPassword = body.re_enter_password || ""
    const fullName = body.full_name?.trim()
    const phone = body.phone_no?.trim() || null

    if (!email || !password || !fullName) {
      return customerError(request, "Full name, email, and password are required.", 400)
    }

    if (password !== confirmPassword) {
      return customerError(request, "Passwords do not match.", 400)
    }

    const otpCode = generateOtp()
    const passwordHash = await hashPassword(password)
    const existingCustomer = await prisma.customer.findFirst({
      where: { email },
      include: { cartItems: true },
    })
    const defaultCompany = await prisma.company.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })

    const customer =
      existingCustomer && !existingCustomer.emailVerifiedAt
        ? await prisma.customer.update({
            where: { id: existingCustomer.id },
            data: {
              name: body.company_name?.trim() || fullName,
              contactPerson: fullName,
              email,
              phone,
              tradingName: body.company_name?.trim() || null,
              abn: body.business_registration?.trim() || null,
              gstin: body.tax_id?.trim() || null,
              passwordHash,
              otpCode,
              otpExpiresAt: otpExpiresAt(),
              customerType: body.company_name ? "wholesale" : "retail",
              companyId: existingCustomer.companyId || defaultCompany?.id || null,
            },
            include: { cartItems: true },
          })
        : existingCustomer
          ? null
          : await prisma.customer.create({
              data: {
                name: body.company_name?.trim() || fullName,
                contactPerson: fullName,
                email,
                phone,
                tradingName: body.company_name?.trim() || null,
                abn: body.business_registration?.trim() || null,
                gstin: body.tax_id?.trim() || null,
                passwordHash,
                otpCode,
                otpExpiresAt: otpExpiresAt(),
                customerType: body.company_name ? "wholesale" : "retail",
                status: "active",
                companyId: defaultCompany?.id || null,
              },
              include: { cartItems: true },
            })

    if (!customer) {
      return customerError(request, "An account with this email already exists.", 400)
    }

    const profile = mapProfile(customer)
    const otp = shouldExposeCustomerOtp() ? otpCode : undefined
    return customerJson(request, {
      success: true,
      message: "Registration started. Use the OTP to verify your account.",
      data: {
        email,
        otp,
        otp_delivery: otp ? "debug" : "external",
        user: profile,
      },
      user: profile,
    })
  } catch (error) {
    console.error("Customer register error:", error)
    return customerError(request, "Failed to register customer.", 500)
  }
}
