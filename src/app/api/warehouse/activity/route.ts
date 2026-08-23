import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse", "driver"])
    if (auth.response) {
      return auth.response
    }

    const companyId = await getActiveCompanyId(request)
    const { searchParams } = new URL(request.url)
    const limit = Number(searchParams.get("limit")) || 50

    // 1. Inbound Received Goods History
    const receivedPOs = await db.purchaseOrder.findMany({
      where: {
        AND: [
          companyId ? { companyId } : {},
          {
            items: {
              some: {
                receivedQty: { gt: 0 },
              },
            },
          },
        ],
      },
      include: {
        supplier: true,
        items: {
          where: { receivedQty: { gt: 0 } },
          include: {
            product: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    })

    const receivedGoods = receivedPOs.flatMap((po) =>
      po.items.map((item) => ({
        id: `${po.id}-${item.id}`,
        poId: po.id,
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        orderedQty: item.quantity,
        receivedQty: item.receivedQty,
        unitCost: item.unitCost,
        totalCost: item.total || item.unitCost * item.receivedQty,
        receivedAt: po.updatedAt,
        status: po.status,
      }))
    )

    // 2. Outbound Dispatched Goods History
    const dispatchedSalesOrders = await db.salesOrder.findMany({
      where: {
        AND: [
          companyId ? { companyId } : {},
          {
            status: {
              in: ["dispatched", "delivered", "invoiced"],
            },
          },
        ],
      },
      include: {
        customer: {
          include: {
            locations: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    })

    const dispatchedGoods = dispatchedSalesOrders.map((order) => {
      const totalWeight = order.items.reduce((s, it) => s + it.quantity * 1.5, 0)
      const totalCartons = Math.ceil(order.items.reduce((s, it) => s + it.quantity, 0) / 10) || 1
      const defaultLoc = order.customer.locations.find((l) => l.isShipping || l.isDefault) || order.customer.locations[0]
      const customerAddress = defaultLoc
        ? [defaultLoc.address, defaultLoc.city, defaultLoc.state, defaultLoc.postcode].filter(Boolean).join(", ")
        : "Sydney DC / Customer Address"

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer.name,
        customerAddress,
        status: order.status,
        dispatchedAt: order.updatedAt,
        requiredDate: order.requiredDate,
        totalCartons,
        totalWeight: Math.round(totalWeight * 10) / 10,
        carrierName: "Direct Freight / 3PL Logistics",
        consignmentNumber: `CON-${order.orderNumber.replace(/[^0-9]/g, "") || "9910"}`,
        items: order.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          productName: it.product.name,
          sku: it.product.sku,
          quantity: it.quantity,
          pickedQty: it.pickedQty,
          unitPrice: it.unitPrice,
          totalPrice: it.total || it.unitPrice * it.quantity,
        })),
      }
    })

    // 3. Stock Movements Audit Ledger
    const stockMovements = await db.stockMovement.findMany({
      include: {
        product: true,
        warehouse: true,
        user: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    const movementLedger = stockMovements.map((mov) => ({
      id: mov.id,
      productId: mov.productId,
      productName: mov.product.name,
      sku: mov.product.sku,
      warehouseName: mov.warehouse.name,
      type: mov.type,
      quantity: mov.quantity,
      reason: mov.reason || "Operational Transfer / Adjustment",
      reference: mov.reference || mov.referenceType || "N/A",
      referenceType: mov.referenceType || "adjustment",
      userName: mov.user?.name || "Warehouse System",
      createdAt: mov.createdAt,
    }))

    // 4. Summary Metrics
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayReceivedUnits = receivedGoods
      .filter((g) => new Date(g.receivedAt) >= today)
      .reduce((sum, g) => sum + g.receivedQty, 0)

    const todayDispatchedCartons = dispatchedGoods
      .filter((g) => new Date(g.dispatchedAt) >= today)
      .reduce((sum, g) => sum + g.totalCartons, 0)

    const todayDispatchedWeight = dispatchedGoods
      .filter((g) => new Date(g.dispatchedAt) >= today)
      .reduce((sum, g) => sum + g.totalWeight, 0)

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          todayReceivedUnits,
          todayDispatchedCartons,
          todayDispatchedWeight,
          totalReceivedRecords: receivedGoods.length,
          totalDispatchedRecords: dispatchedGoods.length,
          totalMovementsCount: movementLedger.length,
        },
        receivedGoods,
        dispatchedGoods,
        movementLedger,
      },
    })
  } catch (error) {
    console.error("Error fetching warehouse activity:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch warehouse activity" },
      { status: 500 }
    )
  }
}
