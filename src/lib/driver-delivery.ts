import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

const FINISHED_STATUSES = new Set(["delivered", "failed", "returned"])
const ACTIVE_STATUSES = new Set(["en_route", "arrived", "delivered", "failed", "returned", "in_transit"])

export function normalizeDeliveryStatus(status: string) {
  if (status === "in_transit") return "en_route"
  return status
}

export function isStartedDeliveryStatus(status: string) {
  return ACTIVE_STATUSES.has(normalizeDeliveryStatus(status))
}

export function isFinishedDeliveryStatus(status: string) {
  return FINISHED_STATUSES.has(normalizeDeliveryStatus(status))
}

export function getOrderStatusForDelivery(status: string) {
  const normalized = normalizeDeliveryStatus(status)
  if (normalized === "delivered") return "delivered"
  if (normalized === "en_route" || normalized === "arrived") return "dispatched"
  return null
}

export async function buildRoutePayloads(
  db: DbClient,
  filters?: {
    status?: string
    driverId?: string
    routeId?: string
  }
) {
  const routes = await db.deliveryRoute.findMany({
    where: {
      AND: [
        filters?.status ? { status: filters.status } : {},
        filters?.driverId ? { driverId: filters.driverId } : {},
        filters?.routeId ? { id: filters.routeId } : {},
      ],
    },
    include: {
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          avatar: true,
          vehicleId: true,
        },
      },
      warehouse: {
        select: {
          id: true,
          name: true,
        },
      },
      deliveries: {
        orderBy: { sequenceNo: "asc" },
      },
    },
    orderBy: [{ routeDate: "asc" }, { createdAt: "asc" }],
  })

  const orderIds = [...new Set(routes.flatMap((route) => route.deliveries.map((delivery) => delivery.orderId).filter(Boolean)))] as string[]
  const customerIds = [...new Set(routes.flatMap((route) => route.deliveries.map((delivery) => delivery.customerId)))]
  const locationIds = [...new Set(routes.flatMap((route) => route.deliveries.map((delivery) => delivery.locationId).filter(Boolean)))] as string[]

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

  const customers = customerIds.length
    ? await db.customer.findMany({
        where: { id: { in: customerIds } },
        select: {
          id: true,
          name: true,
          contactPerson: true,
          phone: true,
          email: true,
        },
      })
    : []

  const locations = locationIds.length
    ? await db.customerLocation.findMany({
        where: { id: { in: locationIds } },
        select: {
          id: true,
          contactName: true,
          phone: true,
          email: true,
          address: true,
          city: true,
          state: true,
          postcode: true,
          deliveryNotes: true,
          latitude: true,
          longitude: true,
        },
      })
    : []

  const ordersById = new Map(orders.map((order) => [order.id, order]))
  const customersById = new Map(customers.map((customer) => [customer.id, customer]))
  const locationsById = new Map(locations.map((location) => [location.id, location]))

  return routes.map((route) => {
    const stops = route.deliveries.map((delivery) => {
      const order = delivery.orderId ? ordersById.get(delivery.orderId) : null
      const customer = customersById.get(delivery.customerId)
      const location = delivery.locationId ? locationsById.get(delivery.locationId) : null
      const itemCount = order?.items.reduce((sum, item) => sum + item.quantity, 0) || 0
      const weight = order?.items.reduce((sum, item) => sum + (item.product.weight || 1) * item.quantity, 0) || 0
      const normalizedStatus = normalizeDeliveryStatus(delivery.status)

      return {
        id: delivery.id,
        deliveryNumber: delivery.deliveryNumber,
        orderId: delivery.orderId,
        orderNumber: order?.orderNumber || "Unlinked Order",
        customerName: customer?.name || "Unknown Customer",
        customerEmail: customer?.email || null,
        address: location?.address || "Address pending",
        city: location?.city || "",
        state: location?.state || "",
        postcode: location?.postcode || "",
        contactName: location?.contactName || customer?.contactPerson || customer?.name || null,
        contactPhone: location?.phone || customer?.phone || null,
        contactEmail: location?.email || customer?.email || null,
        status: normalizedStatus,
        scheduledDate: delivery.scheduledDate,
        scheduledTime: delivery.scheduledTime,
        etaLabel: delivery.scheduledTime || `Stop ${delivery.sequenceNo}`,
        receivedBy: delivery.receivedBy,
        codAmount: delivery.codAmount,
        codCollected: delivery.codCollected,
        notes: delivery.notes,
        photoUrl: delivery.photoUrl,
        signatureUrl: delivery.signatureUrl,
        exceptionReason: delivery.exceptionReason,
        exceptionPhotoUrl: delivery.exceptionPhotoUrl,
        rescheduleRequested: delivery.rescheduleRequested,
        deliveryInstructions: location?.deliveryNotes || order?.deliveryInstructions || null,
        items: itemCount,
        weight,
        sequence: delivery.sequenceNo,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        enRouteAt: delivery.enRouteAt,
        arrivedAt: delivery.arrivedAt,
        deliveredAt: delivery.deliveredAt,
        failedAt: delivery.failedAt,
      }
    })

    const nextStop = stops.find((stop) => !isFinishedDeliveryStatus(stop.status)) || stops[0] || null
    const failedStops = stops.filter((stop) => stop.status === "failed").length
    const outstandingCod = stops.reduce((sum, stop) => {
      return stop.codAmount > 0 && !stop.codCollected ? sum + stop.codAmount : sum
    }, 0)
    const recentActivity = stops
      .flatMap((stop) => {
        const events = [
          stop.deliveredAt
            ? { at: stop.deliveredAt, label: `${stop.customerName} delivered` }
            : null,
          stop.failedAt
            ? { at: stop.failedAt, label: `${stop.customerName} marked failed` }
            : null,
          stop.arrivedAt
            ? { at: stop.arrivedAt, label: `${stop.customerName} arrived` }
            : null,
          stop.enRouteAt
            ? { at: stop.enRouteAt, label: `${stop.customerName} en route` }
            : null,
        ].filter(Boolean)

        return events
      })
      .sort((left, right) => +new Date(right!.at) - +new Date(left!.at))
      .slice(0, 5)

    return {
      id: route.id,
      routeNumber: route.routeNumber,
      name: route.name,
      routeDate: route.routeDate,
      driverId: route.driverId,
      driverName: route.driver?.name || "Unassigned Driver",
      driverPhone: route.driver?.phone || null,
      driverAvatar: route.driver?.avatar || null,
      vehicle: route.vehicle || route.driver?.vehicleId || "Vehicle not set",
      warehouseName: route.warehouse?.name || "No warehouse",
      status: route.status,
      startTime: route.startTime,
      endTime: route.endTime,
      totalStops: route.totalStops,
      completedStops: route.completedStops,
      failedStops,
      remainingStops: stops.filter((stop) => !isFinishedDeliveryStatus(stop.status)).length,
      totalDistance: route.totalDistance || 0,
      totalWeight: route.totalWeight || 0,
      progress: route.totalStops > 0 ? Math.round((route.completedStops / route.totalStops) * 100) : 0,
      nextStopId: nextStop?.id || null,
      outstandingCod,
      recentActivity,
      stops,
    }
  })
}

export async function getDriverActiveRoute(db: DbClient, driverId: string) {
  const routes = await buildRoutePayloads(db, { driverId })
  return (
    routes.find((route) => route.status === "in_progress") ||
    routes.find((route) => route.status === "planned" && route.remainingStops > 0) ||
    routes.find((route) => route.remainingStops > 0) ||
    routes[0] ||
    null
  )
}

export async function getDriverStopDetail(db: DbClient, deliveryId: string) {
  const delivery = await db.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      customer: true,
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          avatar: true,
          vehicleId: true,
        },
      },
      route: {
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  })

  if (!delivery) return null

  const order = delivery.orderId
    ? await db.salesOrder.findUnique({
        where: { id: delivery.orderId },
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
    : null

  const location = delivery.locationId
    ? await db.customerLocation.findUnique({
        where: { id: delivery.locationId },
      })
    : null

  const items = order?.items.reduce((sum, item) => sum + item.quantity, 0) || 0
  const weight = order?.items.reduce((sum, item) => sum + (item.product.weight || 1) * item.quantity, 0) || 0

  return {
    id: delivery.id,
    routeId: delivery.routeId,
    routeNumber: delivery.route?.routeNumber || null,
    routeName: delivery.route?.name || null,
    routeStatus: delivery.route?.status || null,
    routeDate: delivery.route?.routeDate || null,
    warehouseName: delivery.route?.warehouse?.name || null,
    driverId: delivery.driverId,
    driverName: delivery.driver?.name || "Delivery Driver",
    driverPhone: delivery.driver?.phone || null,
    driverAvatar: delivery.driver?.avatar || null,
    vehicle: delivery.driver?.vehicleId || delivery.route?.vehicle || null,
    deliveryNumber: delivery.deliveryNumber,
    orderId: delivery.orderId,
    orderNumber: order?.orderNumber || "Unlinked Order",
    customerName: delivery.customer.name,
    customerEmail: delivery.customer.email,
    contactName: location?.contactName || delivery.customer.contactPerson || delivery.customer.name,
    contactPhone: location?.phone || delivery.customer.phone,
    contactEmail: location?.email || delivery.customer.email,
    address: location?.address || "Address pending",
    city: location?.city || "",
    state: location?.state || "",
    postcode: location?.postcode || "",
    latitude: location?.latitude || null,
    longitude: location?.longitude || null,
    deliveryInstructions: location?.deliveryNotes || order?.deliveryInstructions || null,
    status: normalizeDeliveryStatus(delivery.status),
    scheduledDate: delivery.scheduledDate,
    scheduledTime: delivery.scheduledTime,
    items,
    weight,
    codAmount: delivery.codAmount,
    codCollected: delivery.codCollected,
    receivedBy: delivery.receivedBy,
    notes: delivery.notes,
    photoUrl: delivery.photoUrl,
    signatureUrl: delivery.signatureUrl,
    exceptionReason: delivery.exceptionReason,
    exceptionPhotoUrl: delivery.exceptionPhotoUrl,
    rescheduleRequested: delivery.rescheduleRequested,
    enRouteAt: delivery.enRouteAt,
    arrivedAt: delivery.arrivedAt,
    deliveredAt: delivery.deliveredAt,
    failedAt: delivery.failedAt,
    etaLabel: delivery.scheduledTime || `Stop ${delivery.sequenceNo}`,
    sequence: delivery.sequenceNo,
  }
}
