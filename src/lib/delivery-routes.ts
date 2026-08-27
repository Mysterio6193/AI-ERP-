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

/**
 * Which day a delivery belongs on.
 *
 * A requested delivery date wins over the date the customer needs it by, which
 * wins over the day they ordered. Falling through to the order date is what
 * stops an order with no dates disappearing from every run — it lands today
 * rather than nowhere.
 */
export function getRouteDate(order: { deliveryDate?: Date | null; requiredDate?: Date | null; orderDate: Date }) {
  return startOfDay(order.deliveryDate || order.requiredDate || order.orderDate)
}

/**
 * Where to actually deliver.
 *
 * An explicit location wins, then the shipping address, then the default, then
 * whatever exists. The order matters: billing and delivery addresses differ for
 * most trade customers, and defaulting to the wrong one sends a pallet to an
 * accounts office.
 */
export function pickLocation(
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

/**
 * The delivery's state, derived from the order's.
 *
 * Anything not yet dispatched is pending — deliberately conservative, because
 * marking a delivery further along than the goods actually are is how a driver
 * is sent for stock still on the shelf.
 */
export function deriveDeliveryStatusFromOrder(status: string) {
  if (status === "delivered") return "delivered"
  if (status === "dispatched") return "en_route"
  return "pending"
}

/** What a run is called on a manifest a driver reads. */
export function buildRouteName(routeDate: Date, warehouseName?: string | null) {
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

/** Exported so a route can be opened deliberately, not only as a side effect. */
export async function ensureRouteForOrder(
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

/**
 * Create the deliveries that historical orders never got.
 *
 * This used to run inside `GET /api/routes`, so a read created data: every
 * page load scanned every packed, dispatched and delivered order in the
 * business, and a delivery existed only because somebody happened to open the
 * routes screen. New orders now get theirs on the pack path, so this is a
 * repair tool for the backlog rather than the mechanism.
 *
 * Reports what it did, because a repair that runs silently cannot be checked.
 */
export async function backfillDeliveryRoutes(db: DbClient) {
  // `SalesOrder` has no delivery relation — `Delivery.orderId` points back —
  // so the ones already covered are excluded explicitly. The old version
  // re-ensured every order on every request.
  const covered = await db.delivery.findMany({
    where: { orderId: { not: null } },
    select: { orderId: true },
  })

  const orders = await db.salesOrder.findMany({
    where: {
      status: { in: ["packed", "dispatched", "delivered"] },
      id: { notIn: covered.map((row) => row.orderId!).filter(Boolean) },
    },
    select: { id: true },
  })

  let created = 0
  for (const order of orders) {
    const delivery = await ensureDeliveryForOrder(db, order.id)
    if (delivery) created += 1
  }

  return { scanned: orders.length, created }
}
