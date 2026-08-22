import { NextRequest, NextResponse } from "next/server"
import { hash } from "bcryptjs"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ["admin"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params
    const body = await request.json()

    const existingUser = await db.user.findUnique({
      where: { id },
    })

    if (!existingUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const email = body.email ? String(body.email).trim().toLowerCase() : existingUser.email

    if (email !== existingUser.email) {
      const duplicate = await db.user.findUnique({
        where: { email },
        select: { id: true },
      })

      if (duplicate) {
        return NextResponse.json(
          { success: false, error: "Another user already uses this email" },
          { status: 400 }
        )
      }
    }

    const nextPassword = body.password?.trim()
      ? await hash(String(body.password).trim(), 10)
      : existingUser.password

    const user = await db.user.update({
      where: { id },
      data: {
        name: body.name?.trim() || existingUser.name,
        email,
        password: nextPassword,
        role: body.role || existingUser.role,
        status: body.status || existingUser.status,
        phone: body.phone?.trim() || null,
        avatar: body.avatar?.trim() || null,
        licenseNumber: body.licenseNumber?.trim() || null,
        vehicleId: body.vehicleId?.trim() || null,
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

    return NextResponse.json({ success: true, data: user })
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({ success: false, error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ["admin"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params

    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    if (user.role === "admin") {
      const adminCount = await db.user.count({
        where: { role: "admin", status: "active" },
      })

      if (adminCount <= 1) {
        return NextResponse.json(
          { success: false, error: "You must keep at least one active admin user." },
          { status: 400 }
        )
      }
    }

    await db.user.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting user:", error)
    return NextResponse.json({ success: false, error: "Failed to delete user" }, { status: 500 })
  }
}
