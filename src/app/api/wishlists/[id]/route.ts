import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params
    const wishlist = await db.customerWishlist.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!wishlist) {
      return NextResponse.json({ success: false, error: "Wishlist not found." }, { status: 404 })
    }

    await db.customerWishlist.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Admin wishlist delete error:", error)
    return NextResponse.json({ success: false, error: "Failed to delete wishlist." }, { status: 500 })
  }
}
