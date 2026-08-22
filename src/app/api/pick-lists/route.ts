import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ensurePickListForOrder } from "@/lib/pick-lists"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const eligibleOrders = await db.salesOrder.findMany({
      where: {
        status: {
          in: ["approved", "picking", "packed", "dispatched", "delivered", "invoiced"],
        },
      },
      select: { id: true },
    })

    for (const order of eligibleOrders) {
      await ensurePickListForOrder(db, order.id)
    }

    const pickLists = await db.pickList.findMany({
      include: {
        order: {
          include: {
            customer: true,
            items: true,
          },
        },
        warehouse: true,
        user: true,
        items: true,
      },
      orderBy: { createdAt: "desc" },
    })

    const productIds = [...new Set(pickLists.flatMap((pickList) => pickList.items.map((item) => item.productId)))]
    const products = productIds.length
      ? await db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true },
        })
      : []

    const productsById = new Map(products.map((product) => [product.id, product]))

    const data = pickLists.map((pickList) => {
      const progressTotal = pickList.items.reduce((sum, item) => sum + item.requiredQty, 0)
      const progressPicked = pickList.items.reduce((sum, item) => sum + item.pickedQty, 0)
      const priority = pickList.order.requiredDate && new Date(pickList.order.requiredDate).getTime() - Date.now() < 24 * 60 * 60 * 1000
        ? "high"
        : "normal"

      return {
        id: pickList.id,
        pickNumber: pickList.pickNumber,
        orderId: pickList.orderId,
        orderNumber: pickList.order.orderNumber,
        customerName: pickList.order.customer.name,
        assignedTo: pickList.user?.name || null,
        assignedToId: pickList.assignedTo || null,
        status: pickList.status,
        priority,
        warehouseName: pickList.warehouse.name,
        createdAt: pickList.createdAt,
        progress: progressTotal > 0 ? Math.round((progressPicked / progressTotal) * 100) : 0,
        items: pickList.items.map((item) => {
          const product = productsById.get(item.productId)

          return {
            id: item.id,
            productId: item.productId,
            productName: product?.name || "Unknown Product",
            sku: product?.sku || "N/A",
            location: item.location || "Unassigned",
            requiredQty: item.requiredQty,
            pickedQty: item.pickedQty,
            status: item.status,
          }
        }),
      }
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error fetching pick lists:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch pick lists" },
      { status: 500 }
    )
  }
}
