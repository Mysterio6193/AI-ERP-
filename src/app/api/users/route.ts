import { NextRequest, NextResponse } from "next/server"
import { hash } from "bcryptjs"

import { requireAdminUser } from "@/lib/admin-auth"
import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"

/** The entity the request is acting as, not merely the first row. */
async function getDefaultCompanyId(request: NextRequest) {
  return getActiveCompanyId(request)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin"])
    if (auth.response) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const role = searchParams.get("role") || ""
    const status = searchParams.get("status") || ""

    const users = await db.user.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search, mode: "insensitive" } },
                ],
              }
            : {},
          role ? { role } : {},
          status ? { status } : {},
        ],
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        phone: true,
        avatar: true,
        licenseNumber: true,
        vehicleId: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ success: true, data: users })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin"])
    if (auth.response) {
      return auth.response
    }

    const body = await request.json()
    const name = String(body.name || "").trim()
    const email = String(body.email || "").trim().toLowerCase()
    const password = String(body.password || "")

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, error: "Name, email, and password are required" },
        { status: 400 }
      )
    }

    const existingUser = await db.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "A user with this email already exists" },
        { status: 400 }
      )
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        password: await hash(password, 10),
        role: body.role || "sales",
        status: body.status || "active",
        phone: body.phone?.trim() || null,
        avatar: body.avatar?.trim() || null,
        licenseNumber: body.licenseNumber?.trim() || null,
        vehicleId: body.vehicleId?.trim() || null,
        companyId: await getDefaultCompanyId(request),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        phone: true,
        avatar: true,
        licenseNumber: true,
        vehicleId: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ success: true, data: user }, { status: 201 })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json({ success: false, error: "Failed to create user" }, { status: 500 })
  }
}
