import { NextRequest } from "next/server"

import { getCommerceChannelFromRequest } from "@/lib/commerce"
import { sendSalesOrderEmail } from "@/lib/communications"
import { db } from "@/lib/db"
import { getCustomerOrderBlockReason } from "@/lib/customer-access"
import { ensurePickListForOrder, resolveDefaultWarehouseId } from "@/lib/pick-lists"
import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"
import { getStripeClient, isStripeConfigured, resolveStripeReturnOrigin } from "@/lib/stripe"
import { nextDocumentNumber } from "@/lib/numbering"

const prisma = db as any

async function nextOrderNumber() {
  const currentYear = new Date().getFullYear()
  const prefix = `SO-${currentYear}-`
  const lastOrder = await prisma.salesOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: { orderNumber: true },
  })

  let orderNum = 1001
  if (lastOrder?.orderNumber) {
    const parts = lastOrder.orderNumber.split("-")
    if (parts[2]) {
      orderNum = Number(parts[2]) + 1
    }
  }

  return `${prefix}${String(orderNum).padStart(5, "0")}`
}

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const body = await request.json()
    const addressId = String(body.address || "").trim()
    if (!addressId) {
      return customerError(request, "A delivery address is required.", 400)
    }

    const [address, cartItems] = await Promise.all([
      prisma.customerLocation.findFirst({
        where: { id: addressId, customerId: customer.id },
      }),
      prisma.customerCartItem.findMany({
        where: { customerId: customer.id },
        include: {
          product: true,
          variant: true,
        },
      }),
    ])

    if (!address) {
      return customerError(request, "Delivery address not found.", 404)
    }

    if (cartItems.length === 0) {
      return customerError(request, "Cart is empty.", 400)
    }

    const subtotal = cartItems.reduce((sum, item) => {
      const unitPrice = item.variant?.wholesalePrice ?? item.product.wholesalePrice
      return sum + unitPrice * item.quantity
    }, 0)
    const taxAmount = cartItems.reduce((sum, item) => {
      const unitPrice = item.variant?.wholesalePrice ?? item.product.wholesalePrice
      return sum + unitPrice * item.quantity * ((item.product.gstRate || 0) / 100)
    }, 0)
    const totalAmount = subtotal + taxAmount
    const warehouseId = await resolveDefaultWarehouseId(db, customer.companyId)
    const sourceChannel = getCommerceChannelFromRequest(request)
    const commerceSettings = await prisma.commerceSettings.findFirst({
      orderBy: { createdAt: "asc" },
    })

    if (commerceSettings?.maintenanceMode) {
      return customerError(request, "Customer commerce is temporarily in maintenance mode.", 503)
    }

    if (sourceChannel === "customer_web" && commerceSettings?.websiteEnabled === false) {
      return customerError(request, "Customer website ordering is currently disabled.", 403)
    }

    if (sourceChannel === "customer_app" && commerceSettings?.mobileAppEnabled === false) {
      return customerError(request, "Customer mobile app ordering is currently disabled.", 403)
    }

    if (commerceSettings?.minimumOrderAmount && totalAmount < commerceSettings.minimumOrderAmount) {
      return customerError(
        request,
        `Minimum order amount is ${commerceSettings.minimumOrderAmount.toFixed(2)}.`,
        400
      )
    }

    const orderBlockReason = getCustomerOrderBlockReason(customer, totalAmount)
    if (orderBlockReason) {
      return customerError(request, orderBlockReason, 403)
    }

    const orderStatus = commerceSettings?.autoApproveOrders === false ? "pending_approval" : "approved"

    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: await nextDocumentNumber("salesOrder", {
          db,
          legacy: nextOrderNumber,
        }),
        customerId: customer.id,
        locationId: address.id,
        companyId: customer.companyId || null,
        status: orderStatus,
        requiredDate: body.delivery_date ? new Date(body.delivery_date) : null,
        customerNotes: body.notes || null,
        deliveryInstructions: body.delivery_type || null,
        warehouseId,
        sourceChannel,
        subtotal,
        taxAmount,
        totalAmount,
        items: {
          create: cartItems.map((item) => {
            const unitPrice = item.variant?.wholesalePrice ?? item.product.wholesalePrice
            const lineSubtotal = unitPrice * item.quantity
            const lineTax = lineSubtotal * ((item.product.gstRate || 0) / 100)
            return {
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice,
              taxRate: item.product.gstRate || 0,
              taxAmount: lineTax,
              total: lineSubtotal + lineTax,
              warehouseId,
            }
          }),
        },
        statusLogs: {
          create: {
            status: orderStatus,
            notes: `Customer checkout created from ${sourceChannel === "customer_app" ? "mobile app" : "website"} flow.`,
          },
        },
      },
      include: {
        items: true,
      },
    })

    if (orderStatus === "approved") {
      await ensurePickListForOrder(prisma, order.id)
    }
    try {
      await sendSalesOrderEmail(order.id, orderStatus === "approved" ? "confirmed" : "created")
    } catch (error) {
      console.error("Failed to send customer checkout email:", error)
    }
    await prisma.customerCartItem.deleteMany({
      where: { customerId: customer.id },
    })

    let checkoutUrl: string | null = null
    const wantsOnlinePayment = String(body.payment_method || "online").toLowerCase() !== "credit"

    if (wantsOnlinePayment && isStripeConfigured()) {
      const stripe = getStripeClient()
      const origin = resolveStripeReturnOrigin(request)

      if (stripe) {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: order.items.map((item) => ({
            quantity: item.quantity,
            price_data: {
              currency: "aud",
              product_data: {
                name: `Order item ${item.productId}`,
              },
              unit_amount: Math.round(item.unitPrice * 100),
            },
          })),
          metadata: {
            flow: "customer_order",
            orderId: order.id,
            customerId: customer.id,
          },
          success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
          cancel_url: `${origin}/cancel?order_id=${order.id}`,
        })

        checkoutUrl = session.url || null
      }
    }

    return customerJson(request, {
      success: true,
      message: "Order placed successfully.",
      data: {
        order_id: order.id,
        checkout_url: checkoutUrl,
        payment_provider: checkoutUrl ? "stripe" : null,
        payment_status: checkoutUrl ? "pending_redirect" : "offline",
      },
    })
  } catch (error) {
    console.error("Customer checkout error:", error)
    return customerError(request, "Failed to create checkout session.", 500)
  }
}
