import type { Prisma, PrismaClient } from "@prisma/client"
import { commitStockForOrder, ensureInvoiceForOrder } from "@/lib/order-fulfillment"
import { recordPayment } from "@/lib/payments"
import { syncRouteMetrics } from "@/lib/delivery-routes"
import { getOrderStatusForDelivery, normalizeDeliveryStatus } from "@/lib/driver-delivery"

type DbClient = PrismaClient | Prisma.TransactionClient

export type DeliveryStopUpdateInput = {
  status?: string
  notes?: string
  receivedBy?: string
  photoUrl?: string
  signatureUrl?: string
  codCollected?: boolean
  exceptionReason?: string
  exceptionPhotoUrl?: string
  rescheduleRequested?: boolean
}

export class DeliveryStopValidationError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = "DeliveryStopValidationError"
    this.statusCode = statusCode
  }
}

export async function updateDeliveryStop(
  db: DbClient,
  deliveryId: string,
  input: DeliveryStopUpdateInput
) {
  const delivery = await db.delivery.findUnique({
    where: { id: deliveryId },
  })

  if (!delivery) {
    throw new DeliveryStopValidationError("Delivery not found", 404)
  }

  const nextStatus = input.status ? normalizeDeliveryStatus(input.status) : normalizeDeliveryStatus(delivery.status)
  const nextReceivedBy = input.receivedBy !== undefined ? input.receivedBy.trim() : delivery.receivedBy || ""
  const nextCodCollected = input.codCollected !== undefined ? Boolean(input.codCollected) : delivery.codCollected
  const nextExceptionReason = input.exceptionReason !== undefined ? input.exceptionReason.trim() : delivery.exceptionReason || ""

  if (nextStatus === "delivered" && !nextReceivedBy) {
    throw new DeliveryStopValidationError("Recipient name is required to complete the stop.")
  }

  if (nextStatus === "delivered" && delivery.codAmount > 0 && !nextCodCollected) {
    throw new DeliveryStopValidationError("Cash on delivery must be confirmed before completing the stop.")
  }

  if (nextStatus === "failed" && !nextExceptionReason) {
    throw new DeliveryStopValidationError("An exception reason is required for failed stops.")
  }

  const updatedDelivery = await db.delivery.update({
    where: { id: deliveryId },
    data: {
      status: nextStatus,
      notes: input.notes !== undefined ? input.notes || null : delivery.notes,
      receivedBy: input.receivedBy !== undefined ? input.receivedBy || null : delivery.receivedBy,
      photoUrl: input.photoUrl !== undefined ? input.photoUrl || null : delivery.photoUrl,
      signatureUrl: input.signatureUrl !== undefined ? input.signatureUrl || null : delivery.signatureUrl,
      codCollected: nextCodCollected,
      exceptionReason:
        input.exceptionReason !== undefined
          ? input.exceptionReason || null
          : nextStatus === "failed" || nextStatus === "returned"
            ? delivery.exceptionReason
            : null,
      exceptionPhotoUrl:
        input.exceptionPhotoUrl !== undefined
          ? input.exceptionPhotoUrl || null
          : nextStatus === "failed" || nextStatus === "returned"
            ? delivery.exceptionPhotoUrl
            : null,
      rescheduleRequested:
        input.rescheduleRequested !== undefined
          ? Boolean(input.rescheduleRequested)
          : delivery.rescheduleRequested,
      enRouteAt:
        nextStatus === "en_route"
          ? delivery.enRouteAt || new Date()
          : nextStatus === "pending"
            ? null
            : delivery.enRouteAt,
      arrivedAt:
        nextStatus === "arrived"
          ? delivery.arrivedAt || new Date()
          : nextStatus === "pending" || nextStatus === "failed" || nextStatus === "returned"
            ? null
            : delivery.arrivedAt,
      deliveredAt:
        nextStatus === "delivered"
          ? delivery.deliveredAt || new Date()
          : nextStatus === "pending" || nextStatus === "failed" || nextStatus === "returned"
            ? null
            : delivery.deliveredAt,
      failedAt:
        nextStatus === "failed" || nextStatus === "returned"
          ? delivery.failedAt || new Date()
          : nextStatus === "pending" || nextStatus === "delivered"
            ? null
            : delivery.failedAt,
    },
  })

  if (delivery.orderId) {
    const nextOrderStatus = getOrderStatusForDelivery(nextStatus)

    if (nextOrderStatus) {
      const existingOrder = await db.salesOrder.findUnique({
        where: { id: delivery.orderId },
        select: { status: true },
      })

      if (existingOrder && existingOrder.status !== nextOrderStatus) {
        await db.salesOrder.update({
          where: { id: delivery.orderId },
          data: { status: nextOrderStatus },
        })

        await db.salesOrderStatusLog.create({
          data: {
            orderId: delivery.orderId,
            status: nextOrderStatus,
            notes:
              nextOrderStatus === "delivered"
                ? `Delivery ${delivery.deliveryNumber} completed`
                : `Delivery ${delivery.deliveryNumber} is now ${nextStatus.replace(/_/g, " ")}`,
          },
        })
      }

      if (nextOrderStatus === "delivered") {
        // Stock first: the goods left on this truck. Idempotent, so an order
        // already dispatched through the admin path is not decremented twice.
        await commitStockForOrder(db, delivery.orderId)
        const invoice = await ensureInvoiceForOrder(db, delivery.orderId)

        // Cash on delivery was confirmed above but never booked, so the driver
        // came back with money the ledger did not know about. The delivery id
        // is the idempotency key.
        if (invoice && nextCodCollected && delivery.codAmount > 0) {
          const booked = await recordPayment(
            {
              invoiceId: invoice.id,
              amount: delivery.codAmount,
              method: "cash",
              externalId: `cod:${delivery.id}`,
              notes: `Cash collected on delivery ${delivery.deliveryNumber}`,
            },
            db
          )

          if (!booked.ok) {
            console.error(`COD for delivery ${delivery.deliveryNumber} not booked:`, booked.error)
          }
        }
      }
    }
  }

  if (delivery.routeId) {
    await syncRouteMetrics(db, delivery.routeId)
  }

  return updatedDelivery
}
