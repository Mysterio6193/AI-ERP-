import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { normalizeCommerceChannel } from "@/lib/commerce"
import { createSalesOrder } from "@/lib/sales-orders"

// GET /api/orders - List all sales orders
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse", "accounts"])
    if (auth.response) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || ""
    const customerId = searchParams.get("customerId") || ""
    const source = searchParams.get("source") || ""

    const sourceFilter =
      source === "customer"
        ? {
            OR: [{ sourceChannel: "customer_web" }, { sourceChannel: "customer_app" }],
          }
        : source
          ? { sourceChannel: normalizeCommerceChannel(source) }
          : {}

    const orders = await db.salesOrder.findMany({
      where: {
        AND: [
          search
            ? {
              OR: [
                { orderNumber: { contains: search, mode: "insensitive" } },
                { customer: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
            : {},
          status ? { status } : {},
          customerId ? { customerId } : {},
          sourceFilter,
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
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                baseUnit: true,
                wholesalePrice: true,
                gstRate: true,
              }
            },
          },
        },
        statusLogs: {
          orderBy: { timestamp: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: orders })
  } catch (error) {
    console.error("Error fetching orders:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch orders" },
      { status: 500 }
    )
  }
}

// POST /api/orders - Create a new sales order
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales"])
    if (auth.response) {
      return auth.response
    }

    const body = await request.json()
    const { customerId, locationId, deliveryDate, notes, items, warehouseId } = body

    const result = await createSalesOrder({
      customerId,
      locationId,
      warehouseId,
      deliveryDate,
      notes,
      items,
      sourceChannel: "admin",
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result.order })
  } catch (error) {
    console.error("Error creating order:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create order" },
      { status: 500 }
    )
  }
}
