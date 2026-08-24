import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { resolveDefaultWarehouseId } from "@/lib/pick-lists"
import { ROLE_SETS } from "@/lib/permissions"
import { nextDocumentNumber } from "@/lib/numbering"
import { checkCreditForOrder } from "@/lib/credit"

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

      // Converting a quote created the order directly, so it never reached
      // checkCreditForOrder — a customer over their limit or on hold could be
      // let through simply by having their quote converted. Same gate and same
      // wording as createSalesOrder, so the two paths agree.
      const credit = await checkCreditForOrder(quote.customerId, quote.totalAmount)

      if (!credit.ok) {
        return NextResponse.json(
          { success: false, error: credit.reason || "Credit check failed", code: "credit_limit" },
          { status: 409 }
        )
      }

      const warehouseId = await resolveDefaultWarehouseId(db, quote.customer.companyId || null)

      const order = await db.$transaction(async (tx) => {
        const salesOrder = await tx.salesOrder.create({
          data: {
            orderNumber: await nextDocumentNumber("salesOrder", {
              db,
              legacy: generateOrderNumber,
            }),
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
                // Carried across, or the answer to "why was this line $40.48?"
                // is lost at exactly the moment the quote becomes an order.
                priceListItemId: item.priceListItemId,
                priceSource: item.priceSource,
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

    const { validUntil, customerNotes, internalNotes, items } = body

    if (quote.salesOrderId && items !== undefined) {
      return NextResponse.json(
        { success: false, error: "Cannot edit line items of a quote that has been converted to an order" },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status
    if (validUntil !== undefined) updateData.validUntil = validUntil ? new Date(validUntil) : null
    if (customerNotes !== undefined) updateData.customerNotes = customerNotes || null
    if (internalNotes !== undefined) updateData.internalNotes = internalNotes || null

    if (Array.isArray(items)) {
      let subtotal = 0
      let discountAmount = 0
      let taxAmount = 0

      const quoteItems: Array<{
        productId: string
        quantity: number
        unitPrice: number
        discount: number
        taxRate: number
        taxAmount: number
        total: number
      }> = []

      for (const item of items) {
        const product = await db.product.findUnique({
          where: { id: item.productId },
          select: { id: true, wholesalePrice: true, gstRate: true },
        })

        if (!product) {
          return NextResponse.json(
            { success: false, error: `Product ${item.productId} not found` },
            { status: 400 }
          )
        }

        const quantity = Number(item.quantity) || 0
        const unitPrice = Number(item.unitPrice) || product.wholesalePrice
        const discount = Number(item.discount) || 0
        const lineSubtotal = quantity * unitPrice
        const lineDiscount = lineSubtotal * (discount / 100)
        const netAmount = lineSubtotal - lineDiscount
        const lineTaxRate = Number(item.taxRate) || product.gstRate || 0
        const lineTaxAmount = netAmount * (lineTaxRate / 100)
        const total = netAmount + lineTaxAmount

        subtotal += lineSubtotal
        discountAmount += lineDiscount
        taxAmount += lineTaxAmount

        quoteItems.push({
          productId: product.id,
          quantity,
          unitPrice,
          discount,
          taxRate: lineTaxRate,
          taxAmount: lineTaxAmount,
          total,
        })
      }

      updateData.subtotal = subtotal
      updateData.discountAmount = discountAmount
      updateData.taxAmount = taxAmount
      updateData.totalAmount = subtotal - discountAmount + taxAmount

      await db.$transaction(async (tx) => {
        await tx.quoteItem.deleteMany({ where: { quoteId: id } })
        await tx.quote.update({
          where: { id },
          data: {
            ...updateData,
            items: {
              create: quoteItems,
            },
          },
        })
      })
    } else {
      await db.quote.update({
        where: { id },
        data: updateData,
      })
    }

    const updatedQuote = await db.quote.findUnique({
      where: { id },
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
