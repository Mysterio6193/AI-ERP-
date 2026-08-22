import { createHmac, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { db } from "@/lib/db"

export const DRIVER_SESSION_COOKIE = "driver_session"
const DRIVER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14

type DriverSessionPayload = {
  sub: string
  email: string
  companyId: string | null
  role: string
  exp: number
}

function getSecret() {
  return process.env.DRIVER_SESSION_SECRET || process.env.NEXTAUTH_SECRET || "driver-session-dev-secret"
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url")
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url")
}

export function createDriverSessionToken(input: Omit<DriverSessionPayload, "exp">) {
  const payload: DriverSessionPayload = {
    ...input,
    exp: Date.now() + DRIVER_SESSION_TTL_MS,
  }
  const encodedPayload = encode(JSON.stringify(payload))
  const signature = sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function verifyDriverSessionToken(token?: string | null): DriverSessionPayload | null {
  if (!token) return null

  const [encodedPayload, providedSignature] = token.split(".")
  if (!encodedPayload || !providedSignature) return null

  const expectedSignature = sign(encodedPayload)
  const expectedBuffer = Buffer.from(expectedSignature)
  const providedBuffer = Buffer.from(providedSignature)

  if (expectedBuffer.length !== providedBuffer.length) return null
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) return null

  try {
    const payload = JSON.parse(decode(encodedPayload)) as DriverSessionPayload
    if (!payload?.sub || payload.exp <= Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export async function getDriverFromSessionToken(token?: string | null) {
  const payload = verifyDriverSessionToken(token)
  if (!payload) return null

  const driver = await db.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      phone: true,
      avatar: true,
      licenseNumber: true,
      vehicleId: true,
      companyId: true,
    },
  })

  if (!driver || !["driver", "warehouse", "admin", "sales"].includes(driver.role) || driver.status !== "active") {
    return null
  }

  return driver
}

export async function requireDriverSession(request: NextRequest) {
  const headerToken =
    request.headers.get("x-driver-session") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.cookies.get(DRIVER_SESSION_COOKIE)?.value ||
    null

  return getDriverFromSessionToken(headerToken)
}

export async function getDriverFromCookies() {
  const cookieStore = await cookies()
  return getDriverFromSessionToken(cookieStore.get(DRIVER_SESSION_COOKIE)?.value || null)
}

export function getDriverSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DRIVER_SESSION_TTL_MS / 1000,
  }
}
