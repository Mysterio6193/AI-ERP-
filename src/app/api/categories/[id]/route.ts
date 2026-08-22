import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params
    const body = await request.json()

    const category = await db.category.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        description: body.description !== undefined ? body.description?.trim() || null : undefined,
        parentId: body.parentId !== undefined ? body.parentId || null : undefined,
      },
    })

    return NextResponse.json({ success: true, data: category })
  } catch (error) {
    console.error("Error updating category:", error)
    return NextResponse.json({ success: false, error: "Failed to update category" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(_request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params
    const category = await db.category.findUnique({
      where: { id },
      include: {
        children: true,
        products: { select: { id: true } },
      },
    })

    if (!category) {
      return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 })
    }

    if (category.children.length > 0 || category.products.length > 0) {
      return NextResponse.json(
        { success: false, error: "Remove subcategories and linked products before deleting this category" },
        { status: 400 }
      )
    }

    await db.category.delete({ where: { id } })

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error("Error deleting category:", error)
    return NextResponse.json({ success: false, error: "Failed to delete category" }, { status: 500 })
  }
}
