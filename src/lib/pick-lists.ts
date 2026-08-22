import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

const COMPLETED_ORDER_STATUSES = new Set(["packed", "dispatched", "delivered", "invoiced"])

export async function resolveDefaultWarehouseId(db: DbClient, companyId?: string | null) {
  const existingWarehouse = await db.warehouse.findFirst({
    where: companyId
      ? {
          companyId,
        }
      : undefined,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  })

  if (existingWarehouse) {
    return existingWarehouse.id
  }

  const warehouseCount = await db.warehouse.count()
  const warehouse = await db.warehouse.create({
    data: {
      name: "Main Warehouse",
      code: `WH-${String(warehouseCount + 1).padStart(3, "0")}`,
      location: "Main Warehouse",
      status: "active",
      isDefault: true,
      companyId: companyId || null,
    },
  })

  return warehouse.id
}

export async function ensurePickListForOrder(db: DbClient, orderId: string) {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      pickList: {
        include: {
          items: true,
        },
      },
    },
  })

  if (!order) {
    return null
  }

  const warehouseId = order.warehouseId || await resolveDefaultWarehouseId(db, order.companyId)

  if (!order.warehouseId) {
    await db.salesOrder.update({
      where: { id: order.id },
      data: { warehouseId },
    })
  }

  const items = await Promise.all(
    order.items.map(async (item) => {
      const inventory = await db.inventory.findFirst({
        where: {
          productId: item.productId,
          warehouseId,
        },
      })

      return {
        productId: item.productId,
        location: inventory?.location || null,
        requiredQty: item.quantity,
        pickedQty: item.pickedQty,
        status: item.pickedQty >= item.quantity ? "picked" : "pending",
      }
    })
  )

  const allPicked = items.every((item) => item.pickedQty >= item.requiredQty)
  const anyPicked = items.some((item) => item.pickedQty > 0)
  const nextStatus = allPicked || COMPLETED_ORDER_STATUSES.has(order.status)
    ? "completed"
    : anyPicked || order.status === "picking"
      ? "in_progress"
      : "pending"

  if (order.pickList) {
    const existingProductIds = new Set(order.pickList.items.map((item) => item.productId))
    const missingItems = items.filter((item) => !existingProductIds.has(item.productId))
    const obsoletePickItemIds = order.pickList.items
      .filter((item) => !order.items.some((orderItem) => orderItem.productId === item.productId))
      .map((item) => item.id)

    await db.pickList.update({
      where: { id: order.pickList.id },
      data: {
        status: nextStatus,
        startedAt: anyPicked || order.status === "picking" ? order.pickList.startedAt || new Date() : null,
        completedAt: allPicked || COMPLETED_ORDER_STATUSES.has(order.status) ? new Date() : null,
        items:
          obsoletePickItemIds.length || missingItems.length
            ? {
                ...(obsoletePickItemIds.length
                  ? {
                      deleteMany: {
                        id: {
                          in: obsoletePickItemIds,
                        },
                      },
                    }
                  : {}),
                ...(missingItems.length
                  ? {
                      create: missingItems,
                    }
                  : {}),
              }
            : undefined,
      },
    })

    await Promise.all(
      order.pickList.items.map((pickItem) => {
        const orderItem = order.items.find((item) => item.productId === pickItem.productId)
        if (!orderItem) return Promise.resolve(null)

        return db.pickListItem.update({
          where: { id: pickItem.id },
          data: {
            requiredQty: orderItem.quantity,
            pickedQty: orderItem.pickedQty,
            status: orderItem.pickedQty >= orderItem.quantity ? "picked" : "pending",
          },
        })
      })
    )

    return db.pickList.findUnique({
      where: { id: order.pickList.id },
      include: { items: true },
    })
  }

  const pickCount = await db.pickList.count()

  return db.pickList.create({
    data: {
      pickNumber: `PK-${new Date().getFullYear()}-${String(pickCount + 1).padStart(5, "0")}`,
      orderId: order.id,
      warehouseId,
      status: nextStatus,
      startedAt: anyPicked || order.status === "picking" ? new Date() : null,
      completedAt: allPicked || COMPLETED_ORDER_STATUSES.has(order.status) ? new Date() : null,
      items: {
        create: items,
      },
    },
    include: {
      items: true,
    },
  })
}
