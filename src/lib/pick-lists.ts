import type { Prisma, PrismaClient } from "@prisma/client"
import { nextDocumentNumber } from "@/lib/numbering"

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

  const productIds = Array.from(new Set(order.items.map((item) => item.productId)))
  const inventories = productIds.length > 0
    ? await db.inventory.findMany({
        where: {
          productId: { in: productIds },
          warehouseId,
        },
        select: {
          productId: true,
          location: true,
        },
      })
    : []

  const locationByProductId = new Map(inventories.map((inv) => [inv.productId, inv.location]))

  const items = order.items.map((item) => {
    return {
      productId: item.productId,
      location: locationByProductId.get(item.productId) || null,
      requiredQty: item.quantity,
      pickedQty: item.pickedQty,
      status: item.pickedQty >= item.quantity ? "picked" : "pending",
    }
  })

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

    // Each row gets a different requiredQty/pickedQty/status, so this can't
    // be a single `updateMany`. Batched into one `$transaction` instead of a
    // `Promise.all` of individually-awaited updates so the writes are sent
    // together and applied atomically rather than sequentially one by one.
    const pickItemUpdates = order.pickList.items.flatMap((pickItem) => {
      const orderItem = order.items.find((item) => item.productId === pickItem.productId)
      if (!orderItem) return []

      return [
        db.pickListItem.update({
          where: { id: pickItem.id },
          data: {
            requiredQty: orderItem.quantity,
            pickedQty: orderItem.pickedQty,
            status: orderItem.pickedQty >= orderItem.quantity ? "picked" : "pending",
          },
        }),
      ]
    })

    if (pickItemUpdates.length > 0) {
      // `db` here may already be a `Prisma.TransactionClient` (nested
      // transactions aren't supported, and `TransactionClient` has no
      // `$transaction`), so only batch via `$transaction` when we hold the
      // top-level client. When we're already inside a transaction, the
      // writes are awaited sequentially but are still part of, and atomic
      // with, that outer transaction.
      if ("$transaction" in db) {
        await db.$transaction(pickItemUpdates)
      } else {
        for (const update of pickItemUpdates) {
          await update
        }
      }
    }

    return db.pickList.findUnique({
      where: { id: order.pickList.id },
      include: { items: true },
    })
  }

  const pickCount = await db.pickList.count()

  return db.pickList.create({
    data: {
      pickNumber: await nextDocumentNumber("pickList", {
        db,
        legacy: async () =>
          `PK-${new Date().getFullYear()}-${String(pickCount + 1).padStart(5, "0")}`,
      }),
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
