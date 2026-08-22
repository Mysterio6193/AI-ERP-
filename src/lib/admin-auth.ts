import { compare, hash } from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import {
  ADMIN_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  isAuthBypassEnabled,
  normalizeRole,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session-token"
import { type UserRole } from "@/lib/types"
import { verifyDriverSessionToken } from "@/lib/driver-auth"

export { ADMIN_SESSION_COOKIE, isAuthBypassEnabled }

export interface AdminUserSession {
  id: string
  name: string
  email: string
  role: UserRole
  status: string
  avatar?: string | null
}

interface AdminSessionTokenPayload {
  sub: string
  email: string
  name: string
  role: UserRole
}

async function getAuthBypassUser(): Promise<AdminUserSession | null> {
  const user =
    (await db.user.findFirst({
      where: { role: "admin", status: "active" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, status: true, avatar: true },
    })) ??
    (await db.user.findFirst({
      where: { status: "active" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, status: true, avatar: true },
    }))

  if (!user) {
    return null
  }

  return { ...user, role: normalizeRole(user.role) } satisfies AdminUserSession
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function signAdminSessionToken(user: AdminUserSession) {
  return signSessionToken(user)
}

export async function verifyAdminSessionToken(token: string) {
  return verifySessionToken(token)
}

export function attachAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
}

export async function getAdminUserFromRequest(request: NextRequest) {
  const token =
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value ||
    request.headers.get("x-admin-session")
  const session = token ? await verifyAdminSessionToken(token) : null

  let userId = session?.id

  if (!userId) {
    const driverToken =
      request.headers.get("x-driver-session") ||
      request.cookies.get("driver_session")?.value
    if (driverToken) {
      const driverPayload = verifyDriverSessionToken(driverToken)
      if (driverPayload?.sub) {
        userId = driverPayload.sub
      }
    }
  }

  if (!userId) {
    if (isAuthBypassEnabled()) {
      return getAuthBypassUser()
    }

    return null
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      avatar: true,
    },
  })

  if (!user || user.status !== "active") {
    return null
  }

  return {
    ...user,
    role: normalizeRole(user.role),
  } satisfies AdminUserSession
}

export function hasRole(user: Pick<AdminUserSession, "role"> | null, roles: UserRole[]) {
  if (!user) {
    return false
  }

  return roles.includes(user.role)
}

export function authError(message = "Unauthorized", status = 401) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function requireAdminUser(
  request: NextRequest,
  allowedRoles?: UserRole[]
) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return { user: null, response: authError() }
  }

  if (allowedRoles && !hasRole(user, allowedRoles)) {
    return { user: null, response: authError("Forbidden", 403) }
  }

  return { user, response: null }
}

export async function authenticateAdminCredentials(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      role: true,
      status: true,
      avatar: true,
    },
  })

  if (!user) {
    return null
  }

  const isValid = await compare(password, user.password)
  if (!isValid || user.status !== "active") {
    return null
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    status: user.status,
    avatar: user.avatar,
  } satisfies AdminUserSession
}

export async function getAdminSetupState() {
  const userCount = await db.user.count()
  const adminCount = await db.user.count({
    where: { role: "admin" },
  })

  return {
    needsSetup: adminCount === 0,
    userCount,
    adminCount,
  }
}

async function getOrCreateDefaultCompanyId(companyName: string) {
  const existingCompany = await db.company.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })

  if (existingCompany) {
    return existingCompany.id
  }

  const company = await db.company.create({
    data: {
      name: companyName.trim() || "SupplySure OS",
      tradingName: companyName.trim() || "SupplySure OS",
    },
    select: { id: true },
  })

  return company.id
}

export async function createInitialAdmin(input: {
  companyName: string
  name: string
  email: string
  password: string
}) {
  const setupState = await getAdminSetupState()
  if (!setupState.needsSetup) {
    throw new Error("Initial setup has already been completed")
  }

  const companyId = await getOrCreateDefaultCompanyId(input.companyName)
  const user = await db.user.create({
    data: {
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      password: await hash(input.password, 10),
      role: "admin",
      status: "active",
      companyId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      avatar: true,
    },
  })

  return {
    ...user,
    role: normalizeRole(user.role),
  } satisfies AdminUserSession
}
