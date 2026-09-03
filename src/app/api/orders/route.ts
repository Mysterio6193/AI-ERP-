import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"
import { normalizeCommerceChannel } from "@/lib/commerce"
import { createSalesOrder } from "@/lib/sales-orders"

// GET /api/orders - List all sales orders
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse", "accounts", "driver"])
    if (auth.response) {
      return auth.response
    }

    const companyId = await getActiveCompanyId(request)
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

    // Matches the page/pageSize convention already used by src/app/api/crm/route.ts
    // rather than inventing a new one.
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 50, 1), 100)

    const where = {
      AND: [
        companyId ? { companyId } : {},
        search
          ? {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" as const } },
              { customer: { name: { contains: search, mode: "insensitive" as const } } },
            ],
          }
          : {},
        status ? { status } : {},
        customerId ? { customerId } : {},
        sourceFilter,
      ],
    }

    const [orders, total] = await Promise.all([
      db.salesOrder.findMany({
        where,
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.salesOrder.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: orders,
      meta: { total, page, pageSize, pageCount: Math.ceil(total / pageSize) },
    })
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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request payload" },
        { status: 400 }
      )
    }

    const { customerId, locationId, deliveryDate, notes, items, warehouseId } = body

    if (!customerId || typeof customerId !== "string" || !customerId.trim()) {
      return NextResponse.json(
        { success: false, error: "Customer ID is required" },
        { status: 400 }
      )
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one order item is required" },
        { status: 400 }
      )
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item || typeof item !== "object") {
        return NextResponse.json(
          { success: false, error: `Invalid item format at line ${i + 1}` },
          { status: 400 }
        )
      }

      if (!item.productId || typeof item.productId !== "string" || !item.productId.trim()) {
        return NextResponse.json(
          { success: false, error: `Product ID is required for item at line ${i + 1}` },
          { status: 400 }
        )
      }

      const qty = Number(item.quantity)
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          { success: false, error: `Item quantity must be a positive number at line ${i + 1}` },
          { status: 400 }
        )
      }

      if (item.unitPrice !== undefined && item.unitPrice !== null) {
        const price = Number(item.unitPrice)
        if (!Number.isFinite(price) || price < 0) {
          return NextResponse.json(
            { success: false, error: `Unit price must be a non-negative number at line ${i + 1}` },
            { status: 400 }
          )
        }
      }

      if (item.discount !== undefined && item.discount !== null) {
        const disc = Number(item.discount)
        if (!Number.isFinite(disc) || disc < 0 || disc > 100) {
          return NextResponse.json(
            { success: false, error: `Discount must be between 0 and 100 at line ${i + 1}` },
            { status: 400 }
          )
        }
      }
    }

    if (deliveryDate) {
      const parsedDate = new Date(deliveryDate)
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { success: false, error: "Invalid delivery date format" },
          { status: 400 }
        )
      }
    }

    const sanitizedItems = items.map((item) => ({
      productId: String(item.productId).trim(),
      quantity: Number(item.quantity),
      unitPrice: item.unitPrice !== undefined && item.unitPrice !== null ? Number(item.unitPrice) : undefined,
      discount: item.discount !== undefined && item.discount !== null ? Number(item.discount) : undefined,
    }))

    const result = await createSalesOrder({
      customerId: customerId.trim(),
      locationId: locationId ? String(locationId).trim() : undefined,
      warehouseId: warehouseId ? String(warehouseId).trim() : undefined,
      deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
      notes: notes ? String(notes).trim() : undefined,
      items: sanitizedItems,
      sourceChannel: "admin",
    })

    if (!result.ok) {
      const status = result.code === "customer_not_found" || result.code === "product_not_found" ? 404 : 400
      return NextResponse.json({ success: false, error: result.error }, { status })
    }

    return NextResponse.json({ success: true, data: result.order }, { status: 201 })
  } catch (error) {
    console.error("Error creating order:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create order" },
      { status: 500 }
    )
  }
}
