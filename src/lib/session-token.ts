import { SignJWT, jwtVerify } from "jose"

import { USER_ROLES, type UserRole } from "@/lib/types"

/**
 * Session token primitives with no database or bcrypt dependency.
 *
 * Middleware runs on every request, so it must not pull Prisma or native
 * crypto into its bundle. `admin-auth` re-exports these for application code.
 */

export const ADMIN_SESSION_COOKIE = "supplysure_admin_session"

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export interface AdminSessionClaims {
  id: string
  email: string
  name: string
  role: UserRole
}

export function normalizeRole(value: string): UserRole {
  return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : "sales"
}

function getSessionSecret() {
  return new TextEncoder().encode(
    process.env.ADMIN_SESSION_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      "supplysure-admin-dev-secret"
  )
}

export async function signSessionToken(user: {
  id: string
  email: string
  name: string
  role: UserRole
}) {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecret())
}

export async function verifySessionToken(token: string): Promise<AdminSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret())
    const userId = String(payload.sub || "")

    if (!userId) {
      return null
    }

    return {
      id: userId,
      email: String(payload.email || ""),
      name: String(payload.name || ""),
      role: normalizeRole(String(payload.role || "sales")),
    }
  } catch {
    return null
  }
}

/** Dev-only escape hatch. Cannot activate in a production build. */
export function isAuthBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_BYPASS === "true"
}
