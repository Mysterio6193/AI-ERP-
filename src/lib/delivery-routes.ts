import { hash } from "bcryptjs"
import type { CustomerLocation, Prisma, PrismaClient } from "@prisma/client"
import { nextDocumentNumber } from "@/lib/numbering"
import {
  isFinishedDeliveryStatus,
  isStartedDeliveryStatus,
  normalizeDeliveryStatus,
} from "@/lib/driver-delivery"

type DbClient = PrismaClient | Prisma.TransactionClient

const ELIGIBLE_ORDER_STATUSES = new Set(["packed", "dispatched", "delivered"])
function startOfDay(value: Date) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(value: Date) {
  const next = new Date(value)
  next.setHours(23, 59, 59, 999)
  return next
}

function formatDateToken(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
}

function getRouteDate(order: { deliveryDate?: Date | null; requiredDate?: Date | null; orderDate: Date }) {
  return startOfDay(order.deliveryDate || order.requiredDate || order.orderDate)
}

function pickLocation(
  locations: CustomerLocation[],
  locationId?: string | null
) {
  return (
    locations.find((location) => location.id === locationId) ||
    locations.find((location) => location.isShipping) ||
    locations.find((location) => location.isDefault) ||
    locations[0] ||
    null
  )
}

function deriveDeliveryStatusFromOrder(status: string) {
  if (status === "delivered") return "delivered"
  if (status === "dispatched") return "en_route"
  return "pending"
}

function buildRouteName(routeDate: Date, warehouseName?: string | null) {
  const dateLabel = routeDate.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
  })
  return warehouseName ? `${warehouseName} Run ${dateLabel}` : `Delivery Run ${dateLabel}`
}

async function getNextRouteNumber(db: DbClient, routeDate: Date) {
  const token = formatDateToken(routeDate)
  const prefix = `RT-${token}-`
  const existingCount = await db.deliveryRoute.count({
    where: {
      routeNumber: {
        startsWith: prefix,
      },
    },
  })
  return `${prefix}${String(existingCount + 1).padStart(3, "0")}`
}

async function getNextDeliveryNumber(db: DbClient, scheduledDate: Date) {
  const token = formatDateToken(scheduledDate)
  const prefix = `DL-${token}-`
  const existingCount = await db.delivery.count({
    where: {
      deliveryNumber: {
        startsWith: prefix,
      },
    },
  })
  return `${prefix}${String(existingCount + 1).padStart(5, "0")}`
}

export async function ensureDefaultDriver(db: DbClient, companyId?: string | null) {
  const existingDriver = await db.user.findFirst({
    where: {
      role: "driver",
      status: "active",
      ...(companyId ? { companyId } : {}),
    },
    orderBy: { createdAt: "asc" },
  })

  if (existingDriver) {
    if (!existingDriver.password.startsWith("$2")) {
      return db.user.update({
        where: { id: existingDriver.id },
        data: {
          password: await hash("password123", 10),
        },
      })
    }
    return existingDriver
  }

  const driverCount = await db.user.count({
    where: { role: "driver" },
  })

  return db.user.create({
    data: {
      email: `driver${driverCount + 1}@yourcompany.com`,
      name: "Delivery Driver",
      password: await hash("password123", 10),
      role: "driver",
      status: "active",
      phone: null,
      companyId: companyId || null,
    },
  })
}

export async function syncRouteMetrics(db: DbClient, routeId: string) {
  const route = await db.deliveryRoute.findUnique({
    where: { id: routeId },
    include: {
      deliveries: true,
    },
  })

  if (!route) {
    return null
  }

  const orderIds = route.deliveries.map((delivery) => delivery.orderId).filter(Boolean) as string[]
  const orders = orderIds.length
    ? await db.salesOrder.findMany({
        where: { id: { in: orderIds } },
        include: {
          items: {
            include: {
              product: {
                select: {
                  weight: true,
                },
              },
            },
          },
        },
      })
    : []

  const ordersById = new Map(orders.map((order) => [order.id, order]))
  const totalWeight = route.deliveries.reduce((sum, delivery) => {
    const order = delivery.orderId ? ordersById.get(delivery.orderId) : null
    if (!order) return sum

    const orderWeight = order.items.reduce((itemSum, item) => {
      const unitWeight = item.product.weight || 1
      return itemSum + unitWeight * item.quantity
    }, 0)

    return sum + orderWeight
  }, 0)

  const totalStops = route.deliveries.length
  const completedStops = route.deliveries.filter((delivery) => normalizeDeliveryStatus(delivery.status) === "delivered").length
  const allFinished = totalStops > 0 && route.deliveries.every((delivery) => isFinishedDeliveryStatus(delivery.status))
  const anyStarted = route.deliveries.some((delivery) => isStartedDeliveryStatus(delivery.status))

  return db.deliveryRoute.update({
    where: { id: routeId },
    data: {
      totalStops,
      completedStops,
      totalWeight,
      status: allFinished ? "completed" : anyStarted ? "in_progress" : "planned",
      startTime: anyStarted ? route.startTime || new Date() : null,
      endTime: allFinished ? new Date() : null,
    },
  })
}

async function ensureRouteForOrder(
  db: DbClient,
  input: {
    routeDate: Date
    warehouseId?: string | null
    warehouseName?: string | null
    companyId?: string | null
    driverId?: string | null
  }
) {
  const existingRoute = await db.deliveryRoute.findFirst({
    where: {
      routeDate: {
        gte: startOfDay(input.routeDate),
        lte: endOfDay(input.routeDate),
      },
      warehouseId: input.warehouseId || null,
      companyId: input.companyId || null,
      driverId: input.driverId || null,
    },
    orderBy: { createdAt: "asc" },
  })

  if (existingRoute) {
    return existingRoute
  }

  try {
    return await db.deliveryRoute.create({
      data: {
        routeNumber: await nextDocumentNumber("route", {
          db,
          date: input.routeDate,
          legacy: () => getNextRouteNumber(db, input.routeDate),
        }),
        name: buildRouteName(input.routeDate, input.warehouseName),
        routeDate: input.routeDate,
        warehouseId: input.warehouseId || null,
        driverId: input.driverId || null,
        vehicle: null,
        status: "planned",
        companyId: input.companyId || null,
      },
    })
  } catch (error: any) {
    if (error?.code === "P2002") {
      const existing = await db.deliveryRoute.findFirst({
        where: {
          routeDate: {
            gte: startOfDay(input.routeDate),
            lte: endOfDay(input.routeDate),
          },
          warehouseId: input.warehouseId || null,
          companyId: input.companyId || null,
        },
        orderBy: { createdAt: "desc" },
      })
      if (existing) {
        return existing
      }
    }
    throw error
  }
}

export async function ensureDeliveryForOrder(db: DbClient, orderId: string) {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        include: {
          locations: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              weight: true,
            },
          },
        },
      },
    },
  })

  if (!order || !ELIGIBLE_ORDER_STATUSES.has(order.status)) {
    return null
  }

  const scheduledDate = getRouteDate(order)
  const deliveryStatus = deriveDeliveryStatusFromOrder(order.status)
  const driver = await ensureDefaultDriver(db, order.companyId)
  const warehouse = order.warehouseId
    ? await db.warehouse.findUnique({
        where: { id: order.warehouseId },
        select: { id: true, name: true },
      })
    : null
  const route = await ensureRouteForOrder(db, {
    routeDate: scheduledDate,
    warehouseId: warehouse?.id || null,
    warehouseName: warehouse?.name || null,
    companyId: order.companyId || null,
    driverId: driver.id,
  })

  const location = pickLocation(order.customer.locations, order.locationId)
  const existingDelivery = await db.delivery.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: "asc" },
  })

  if (existingDelivery) {
    const updatedDelivery = await db.delivery.update({
      where: { id: existingDelivery.id },
      data: {
        routeId: route.id,
        customerId: order.customerId,
        locationId: location?.id || null,
        driverId: route.driverId || driver.id,
        scheduledDate,
        status: deliveryStatus,
        notes: order.deliveryInstructions || existingDelivery.notes,
        codAmount: order.customer.paymentTerms === 0 ? order.totalAmount : 0,
        enRouteAt:
          deliveryStatus === "en_route"
            ? existingDelivery.enRouteAt || new Date()
            : existingDelivery.enRouteAt,
        deliveredAt: deliveryStatus === "delivered" ? existingDelivery.deliveredAt || new Date() : null,
      },
    })

    if (order.deliveryId !== updatedDelivery.id) {
      await db.salesOrder.update({
        where: { id: order.id },
        data: {
          deliveryId: updatedDelivery.id,
        },
      })
    }

    await syncRouteMetrics(db, route.id)
    return updatedDelivery
  }

  const sequenceNo = await db.delivery.count({
    where: { routeId: route.id },
  })

  const delivery = await db.delivery.create({
    data: {
      deliveryNumber: await nextDocumentNumber("delivery", {
        db,
        date: scheduledDate,
        legacy: () => getNextDeliveryNumber(db, scheduledDate),
      }),
      routeId: route.id,
      orderId: order.id,
      customerId: order.customerId,
      locationId: location?.id || null,
      sequenceNo: sequenceNo + 1,
      status: deliveryStatus,
      scheduledDate,
      scheduledTime: null,
      notes: order.deliveryInstructions || null,
      codAmount: order.customer.paymentTerms === 0 ? order.totalAmount : 0,
      codCollected: false,
      driverId: route.driverId || driver.id,
      enRouteAt: deliveryStatus === "en_route" ? new Date() : null,
      deliveredAt: deliveryStatus === "delivered" ? new Date() : null,
    },
  })

  await db.salesOrder.update({
    where: { id: order.id },
    data: {
      deliveryId: delivery.id,
    },
  })

  await syncRouteMetrics(db, route.id)
  return delivery
}

export async function backfillDeliveryRoutes(db: DbClient) {
  const orders = await db.salesOrder.findMany({
    where: {
      status: {
        in: ["packed", "dispatched", "delivered"],
      },
    },
    select: { id: true },
  })

  for (const order of orders) {
    await ensureDeliveryForOrder(db, order.id)
  }
}
