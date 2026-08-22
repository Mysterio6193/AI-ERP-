import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * This route existed nowhere while the UI called it: every supplier edit
 * 404'd and the failure was swallowed client-side.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.operations)
    if (!auth.user) return auth.response

    const { id } = await context.params

    const supplier = await db.supplier.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true, purchaseOrders: true } },
      },
    })

    if (!supplier) {
      return NextResponse.json(
        { success: false, error: "Supplier not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: supplier })
  } catch (error) {
    console.error("Error fetching supplier:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch supplier" },
      { status: 500 }
    )
  }
}

async function updateSupplier(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.operations)
    if (!auth.user) return auth.response

    const { id } = await context.params
    const body = await request.json()

    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Supplier not found" },
        { status: 404 }
      )
    }

    // Only touched fields change; the form sends everything, API clients may not.
    const data: Record<string, unknown> = {}
    const textFields = [
      "name",
      "tradingName",
      "contactPerson",
      "email",
      "phone",
      "website",
      "address",
      "city",
      "state",
      "postcode",
      "status",
    ] as const
    for (const field of textFields) {
      if (body[field] !== undefined) {
        data[field] = body[field] === "" ? null : body[field]
      }
    }

    if (body.abn !== undefined) {
      data.abn = body.abn ? body.abn.replace(/\s/g, "") : null
    }

    if (body.paymentTerms !== undefined) {
      const parsed = parseInt(body.paymentTerms, 10)
      data.paymentTerms = Number.isFinite(parsed) ? parsed : 30
    }

    if (body.creditLimit !== undefined) {
      const parsed = parseFloat(body.creditLimit)
      data.creditLimit = Number.isFinite(parsed) ? parsed : 0
    }

    if (data.name === null) {
      return NextResponse.json(
        { success: false, error: "Supplier name is required" },
        { status: 400 }
      )
    }

    const supplier = await db.supplier.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, data: supplier })
  } catch (error) {
    console.error("Error updating supplier:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update supplier" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return updateSupplier(request, context)
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return updateSupplier(request, context)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.operations)
    if (!auth.user) return auth.response

    const { id } = await context.params

    const linked =
      (await db.productSupplier.count({ where: { supplierId: id } })) +
      (await db.purchaseOrder.count({ where: { supplierId: id } }))

    if (linked > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supplier has products or purchase orders linked. Deactivate it instead of deleting.",
        },
        { status: 409 }
      )
    }

    await db.supplier.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting supplier:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete supplier" },
      { status: 500 }
    )
  }
}
