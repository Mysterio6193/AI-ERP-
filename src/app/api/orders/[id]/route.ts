import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { sendSalesOrderEmail } from "@/lib/communications"
import { db } from "@/lib/db"
import { ensurePickListForOrder } from "@/lib/pick-lists"
import { recordApproval } from "@/lib/approvals"
import { applyOrderStatus } from "@/lib/order-status"
import { resolveLinePrice } from "@/lib/pricing"
import { getSettings } from "@/lib/settings/service"
import { computeLineTax } from "@/lib/tax"

const LINE_ITEM_EDITABLE_STATUSES = new Set(["draft", "pending_approval", "approved"])

// GET /api/orders/[id] - Get a single order
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse", "accounts", "driver"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params
    const order = await db.salesOrder.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            locations: true,
            priceList: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        statusLogs: {
          orderBy: { timestamp: "desc" },
        },
        // Who signed this off, and what they said. A status log records that
        // the order changed; this records who decided and why.
        approvalActions: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true, role: true } } },
        },
        invoice: true,
      },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: order })
  } catch (error) {
    console.error("Error fetching order:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch order" },
      { status: 500 }
    )
  }
}

// PUT /api/orders/[id] - Update an order (including status changes)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse", "driver"])
    if (auth.response) {
      return auth.response
    }

    const { id } = await params
    const body = await request.json()
    const { status, requiredDate, deliveryDate, notes, internalNotes, userId, items } = body

    const existingOrder = await db.salesOrder.findUnique({
      where: { id },
      include: {
        items: true,
        invoice: true,
      },
    })

    if (!existingOrder) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      )
    }

    const hasItemChanges = items !== undefined

    if (hasItemChanges) {
      if (existingOrder.invoice) {
        return NextResponse.json(
          { success: false, error: "Line items cannot be edited after an invoice has been generated." },
          { status: 400 }
        )
      }

      if (!LINE_ITEM_EDITABLE_STATUSES.has(existingOrder.status)) {
        return NextResponse.json(
          { success: false, error: "Line items can only be edited while the order is in draft, pending approval, or approved status." },
          { status: 400 }
        )
      }

      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { success: false, error: "At least one line item is required." },
          { status: 400 }
        )
      }
    }

    // Update order
    const updateData: Record<string, unknown> = {}
    // Deliberately NOT set here. applyOrderStatus below is what moves the
    // status, and it compares the order's current status to decide whether the
    // move is legal. Writing it first made every transition look like a no-op
    // retry (from === to), which silently disabled the check entirely.
    if (requiredDate !== undefined) updateData.requiredDate = requiredDate ? new Date(requiredDate) : null
    if (deliveryDate !== undefined) updateData.deliveryDate = deliveryDate ? new Date(deliveryDate) : null
    if (notes !== undefined) updateData.customerNotes = notes
    if (internalNotes !== undefined) updateData.internalNotes = internalNotes

    if (hasItemChanges) {
      const incomingItems = items as Array<{
        id?: string
        productId: string
        quantity: number
        unitPrice?: number
        discount?: number
      }>

      const productIds = Array.from(
        new Set(
          incomingItems
            .map((item) => String(item.productId || "").trim())
            .filter(Boolean)
        )
      )

      const products = await db.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
        select: {
          id: true,
          gstRate: true,
          gstExempt: true,
          wholesalePrice: true,
          retailPrice: true,
          taxRate: { select: { rate: true, status: true, taxType: true } },
        },
      })

      const productMap = new Map(products.map((product) => [product.id, product]))

      // Resolved up front: the mapping below is synchronous, and tax now
      // depends on who is buying and which entity is billing.
      const taxSettings = await getSettings("tax", { companyId: existingOrder.companyId })
      const taxCustomer = await db.customer.findUnique({
        where: { id: existingOrder.customerId },
        // priceListId drives contract pricing; omitting it typechecks fine and
        // silently prices every line from the product instead.
        select: { customerType: true, priceListId: true },
      })
      const taxCompany = existingOrder.companyId
        ? await db.company.findUnique({
            where: { id: existingOrder.companyId },
            select: { gstRate: true, country: true },
          })
        : null
      const pricingSettings = await getSettings("pricing", {
        companyId: existingOrder.companyId,
      })

      const priceLists = pricingSettings.enablePriceLists
        ? await db.priceList.findMany({
            select: {
              id: true,
              isDefault: true,
              type: true,
              status: true,
              validFrom: true,
              validTo: true,
              createdAt: true,
            },
          })
        : []

      const priceListItems = pricingSettings.enablePriceLists
        ? await db.priceListItem.findMany({
            where: { productId: { in: productIds } },
            select: {
              id: true,
              priceListId: true,
              productId: true,
              price: true,
              minQty: true,
              maxQty: true,
              discountPercent: true,
              discountFlat: true,
            },
          })
        : []

      const existingItemsById = new Map(existingOrder.items.map((item) => [item.id, item]))

      let subtotal = 0
      let totalDiscountAmount = 0
      let totalTaxAmount = 0
      const normalizedItems = incomingItems.map((item) => {
        const productId = String(item.productId || "").trim()
        const quantity = Number(item.quantity) || 0
        const product = productMap.get(productId)

        if (!product) {
          throw new Error(`Product ${productId} not found`)
        }

        if (quantity <= 0) {
          throw new Error("Each line item must have a quantity greater than 0")
        }

        const priced = resolveLinePrice(
          {
            quantity,
            unitPriceOverride:
              item.unitPrice !== undefined && item.unitPrice !== null
                ? Number(item.unitPrice)
                : null,
            product: {
              wholesalePrice: product.wholesalePrice,
              retailPrice: product.retailPrice,
            },
            customer: taxCustomer,
            items: priceListItems.filter((entry) => entry.productId === productId),
            lists: priceLists,
          },
          pricingSettings
        )

        const unitPrice = priced.unitPrice
        const discount = item.discount !== undefined ? Number(item.discount) || 0 : 0
        const lineSubtotal = unitPrice * quantity
        const discountAmount = lineSubtotal * (discount / 100)
        const lineTax = computeLineTax(
          lineSubtotal - discountAmount,
          {
            product: { gstRate: product.gstRate, gstExempt: product.gstExempt, taxRate: product.taxRate },
            customer: taxCustomer,
            company: taxCompany,
          },
          taxSettings
        )
        const totals = {
          discountAmount,
          taxableSubtotal: lineTax.taxableAmount,
          taxAmount: lineTax.taxAmount,
          total: lineTax.total,
        }
        const existingItem = item.id ? existingItemsById.get(item.id) : null

        subtotal += totals.taxableSubtotal
        totalDiscountAmount += totals.discountAmount
        totalTaxAmount += totals.taxAmount

        return {
          id: item.id,
          productId,
          quantity,
          unitPrice,
          discount,
          taxRate: lineTax.rate,
          priceListItemId: priced.priceListItemId,
          priceSource: priced.source,
          taxAmount: totals.taxAmount,
          total: totals.total,
          pickedQty: existingItem?.pickedQty || 0,
          shippedQty: existingItem?.shippedQty || 0,
          warehouseId: existingItem?.warehouseId || existingOrder.warehouseId || null,
          notes: existingItem?.notes || null,
        }
      })

      updateData.subtotal = subtotal
      updateData.discountAmount = totalDiscountAmount
      updateData.taxAmount = totalTaxAmount
      updateData.totalAmount = subtotal + totalTaxAmount

      await db.$transaction(async (tx) => {
        await tx.salesOrder.update({
          where: { id },
          data: updateData,
        })

        const incomingItemIds = new Set(
          normalizedItems
            .map((item) => item.id)
            .filter((itemId): itemId is string => Boolean(itemId))
        )

        const existingIds = existingOrder.items.map((item) => item.id)
        const itemIdsToDelete = existingIds.filter((itemId) => !incomingItemIds.has(itemId))

        if (itemIdsToDelete.length) {
          await tx.salesOrderItem.deleteMany({
            where: {
              orderId: id,
              id: {
                in: itemIdsToDelete,
              },
            },
          })
        }

        for (const item of normalizedItems) {
          if (item.id && existingItemsById.has(item.id)) {
            await tx.salesOrderItem.update({
              where: { id: item.id },
              data: {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discount: item.discount,
                taxRate: item.taxRate,
                taxAmount: item.taxAmount,
                total: item.total,
                warehouseId: item.warehouseId,
              },
            })
          } else {
            await tx.salesOrderItem.create({
              data: {
                orderId: id,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discount: item.discount,
                taxRate: item.taxRate,
                taxAmount: item.taxAmount,
                total: item.total,
                warehouseId: item.warehouseId,
              },
            })
          }
        }

        await tx.salesOrderStatusLog.create({
          data: {
            orderId: id,
            status: status || existingOrder.status,
            userId,
            notes: "Line items updated by admin",
          },
        })
      })

      if (["approved", "picking", "packed", "dispatched", "delivered", "invoiced"].includes(status || existingOrder.status)) {
        await ensurePickListForOrder(db, id)
      }
    } else {
      await db.salesOrder.update({
        where: { id },
        data: updateData,
      })
    }

    // Status changes go through applyOrderStatus, the same path the agent's
    // updateOrderStatus uses. This block used to be a second, hand-maintained
    // copy of the side effects, which is how the agent path ended up firing
    // none of them.
    if (status && status !== existingOrder.status) {
      const moved = await applyOrderStatus(db, id, status, {
        userId: userId || auth.user?.id || null,
        note: `Status changed from ${existingOrder.status} to ${status}`,
      })

      if (!moved.ok) {
        return NextResponse.json(
          { success: false, error: moved.error || "Could not change the status" },
          { status: 400 }
        )
      }

      // Who made the call, from the session rather than the request body —
      // `userId` above is client-supplied and would be forgeable as an
      // attribution. ApprovalAction was modelled and never written, so an
      // order that went out at an unusual discount could be traced to the
      // moment it changed status and no further.
      if (status === "approved" && existingOrder.status === "pending_approval") {
        await recordApproval(db, {
          entityType: "sales_order",
          entityId: id,
          action: "approved",
          userId: auth.user?.id || "",
          comments: internalNotes ? String(internalNotes) : null,
        })
      }

      if (status === "cancelled" && existingOrder.status === "pending_approval") {
        // Cancelling something awaiting sign-off is a rejection, and reads as
        // one on the document.
        await recordApproval(db, {
          entityType: "sales_order",
          entityId: id,
          action: "rejected",
          userId: auth.user?.id || "",
          comments: internalNotes ? String(internalNotes) : null,
        })
      }

      try {
        if (status === "approved") {
          await sendSalesOrderEmail(id, "confirmed")
        } else if (status === "cancelled") {
          await sendSalesOrderEmail(id, "cancelled")
        }
      } catch (error) {
        console.error("Failed to send order status email:", error)
      }
    }

    const order = await db.salesOrder.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            locations: true,
            priceList: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        statusLogs: {
          orderBy: { timestamp: "desc" },
        },
        invoice: true,
      },
    })

    return NextResponse.json({ success: true, data: order })
  } catch (error) {
    console.error("Error updating order:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update order" },
      { status: 500 }
    )
  }
}

// DELETE /api/orders/[id] - Delete an order
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

    const order = await db.salesOrder.findUnique({
      where: { id },
      include: { invoice: true },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      )
    }

    if (order.invoice) {
      return NextResponse.json(
        { success: false, error: "Cannot delete order with associated invoice" },
        { status: 400 }
      )
    }

    // Delete order items and status logs first
    await db.salesOrderItem.deleteMany({ where: { orderId: id } })
    await db.salesOrderStatusLog.deleteMany({ where: { orderId: id } })

    // Delete the order
    await db.salesOrder.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      message: "Order deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting order:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete order" },
      { status: 500 }
    )
  }
}
