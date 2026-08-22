import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { resolveDefaultWarehouseId } from "@/lib/pick-lists"
import { ROLE_SETS } from "@/lib/permissions"

async function generateOrderNumber() {
  const currentYear = new Date().getFullYear()
  const prefix = `SO-${currentYear}-`
  const lastOrder = await db.salesOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: { orderNumber: true },
  })

  let nextNumber = 1001
  if (lastOrder) {
    const parts = lastOrder.orderNumber.split("-")
    if (parts.length >= 3) {
      nextNumber = Number.parseInt(parts[2], 10) + 1
    }
  }

  return `${prefix}${nextNumber.toString().padStart(5, "0")}`
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.commercial)
    if (!auth.user) return auth.response

    const { id } = await params
    const body = await request.json()
    const { status, action } = body

    const quote = await db.quote.findUnique({
      where: { id },
      include: {
        customer: true,
        items: true,
      },
    })

    if (!quote) {
      return NextResponse.json({ success: false, error: "Quote not found" }, { status: 404 })
    }

    if (action === "convert") {
      if (quote.salesOrderId) {
        const existingOrder = await db.salesOrder.findUnique({
          where: { id: quote.salesOrderId },
        })
        return NextResponse.json({ success: true, data: existingOrder })
      }

      const warehouseId = await resolveDefaultWarehouseId(db, quote.customer.companyId || null)

      const order = await db.$transaction(async (tx) => {
        const salesOrder = await tx.salesOrder.create({
          data: {
            orderNumber: await generateOrderNumber(),
            customerId: quote.customerId,
            locationId: quote.locationId,
            quoteId: quote.id,
            companyId: quote.companyId,
            status: "draft",
            warehouseId,
            subtotal: quote.subtotal,
            discountAmount: quote.discountAmount,
            taxAmount: quote.taxAmount,
            totalAmount: quote.totalAmount,
            customerNotes: quote.customerNotes,
            internalNotes: quote.internalNotes,
            sourceChannel: "admin",
            items: {
              create: quote.items.map((item) => ({
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discount: item.discount,
                taxRate: item.taxRate,
                taxAmount: item.taxAmount,
                total: item.total,
              })),
            },
            statusLogs: {
              create: {
                status: "draft",
                notes: `Created from quote ${quote.quoteNumber}`,
              },
            },
          },
        })

        await tx.quote.update({
          where: { id: quote.id },
          data: {
            status: "converted",
            salesOrderId: salesOrder.id,
          },
        })

        return salesOrder
      })

      return NextResponse.json({ success: true, data: order })
    }

    const updatedQuote = await db.quote.update({
      where: { id },
      data: {
        status: status || quote.status,
      },
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                wholesalePrice: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ success: true, data: updatedQuote })
  } catch (error) {
    console.error("Error updating quote:", error)
    return NextResponse.json({ success: false, error: "Failed to update quote" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.commercial)
    if (!auth.user) return auth.response

    const { id } = await params

    const quote = await db.quote.findUnique({
      where: { id },
      select: { id: true, salesOrderId: true },
    })

    if (!quote) {
      return NextResponse.json({ success: false, error: "Quote not found" }, { status: 404 })
    }

    if (quote.salesOrderId) {
      return NextResponse.json(
        { success: false, error: "Cannot delete a quote that has been converted to an order" },
        { status: 400 }
      )
    }

    await db.quote.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting quote:", error)
    return NextResponse.json({ success: false, error: "Failed to delete quote" }, { status: 500 })
  }
}
