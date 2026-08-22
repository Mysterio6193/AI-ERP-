import { randomInt, randomUUID } from "crypto"
import bcrypt from "bcryptjs"

import { db } from "@/lib/db"

const prisma = db as any

const ACCESS_TTL_MS = 1000 * 60 * 60 * 24
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || ""
}

export function generateOtp() {
  return String(randomInt(100000, 999999))
}

export function otpExpiresAt() {
  return new Date(Date.now() + 1000 * 60 * 10)
}

export function shouldExposeCustomerOtp() {
  return process.env.CUSTOMER_OTP_EXPOSE !== "false"
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, passwordHash?: string | null) {
  if (!passwordHash) {
    return false
  }

  return bcrypt.compare(password, passwordHash)
}

export function extractBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") || ""
  return authHeader.replace(/^Bearer\s+/i, "").trim() || null
}

export async function getCustomerFromAccessToken(accessToken?: string | null) {
  if (!accessToken) {
    return null
  }

  const session = await prisma.customerSession.findUnique({
    where: { accessToken },
    include: {
      customer: {
        include: {
          locations: true,
          cartItems: true,
          wishlists: true,
        },
      },
    },
  })

  if (!session || session.accessExpiresAt < new Date()) {
    return null
  }

  return session.customer
}

export async function requireCustomer(request: Request) {
  const token = extractBearerToken(request)
  return getCustomerFromAccessToken(token)
}

export async function createCustomerSession(customerId: string) {
  const accessToken = randomUUID()
  const refreshToken = randomUUID()

  const session = await prisma.customerSession.create({
    data: {
      customerId,
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_MS),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  })

  return {
    access: session.accessToken,
    refresh: session.refreshToken,
  }
}

export async function refreshCustomerSession(refreshToken?: string | null) {
  if (!refreshToken) {
    return null
  }

  const existing = await prisma.customerSession.findUnique({
    where: { refreshToken },
  })

  if (!existing || existing.refreshExpiresAt < new Date()) {
    return null
  }

  const nextAccess = randomUUID()
  const nextRefresh = randomUUID()

  const session = await prisma.customerSession.update({
    where: { id: existing.id },
    data: {
      accessToken: nextAccess,
      refreshToken: nextRefresh,
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_MS),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  })

  return {
    access: session.accessToken,
    refresh: session.refreshToken,
  }
}
