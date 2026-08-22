import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"
import { resolveDefaultWarehouseId } from "@/lib/pick-lists"
import { ROLE_SETS } from "@/lib/permissions"

/** The entity the request is acting as, not merely the first row. */
async function getDefaultCompanyId(request: NextRequest) {
  return getActiveCompanyId(request)
}

async function generatePurchaseOrderNumber() {
  const currentYear = new Date().getFullYear()
  const prefix = `PO-${currentYear}-`
  const lastOrder = await db.purchaseOrder.findFirst({
    where: { poNumber: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: { poNumber: true },
  })

  let nextNumber = 1001
  if (lastOrder) {
    const parts = lastOrder.poNumber.split("-")
    if (parts.length >= 3) {
      nextNumber = Number.parseInt(parts[2], 10) + 1
    }
  }

  return `${prefix}${nextNumber.toString().padStart(5, "0")}`
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.staff)
    if (!auth.user) return auth.response

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || ""

    const purchaseOrders = await db.purchaseOrder.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { poNumber: { contains: search, mode: "insensitive" } },
                  { supplier: { name: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {},
          status ? { status } : {},
        ],
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                costPrice: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: purchaseOrders })
  } catch (error) {
    console.error("Error fetching purchase orders:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch purchase orders" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.operations)
    if (!auth.user) return auth.response

    const body = await request.json()
    const { supplierId, expectedDate, notes, items } = body

    if (!supplierId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const supplier = await db.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, companyId: true },
    })

    if (!supplier) {
      return NextResponse.json({ success: false, error: "Supplier not found" }, { status: 404 })
    }

    let subtotal = 0
    let taxAmount = 0
    const orderItems: Array<{
      productId: string
      quantity: number
      receivedQty: number
      unitCost: number
      taxRate: number
      taxAmount: number
      total: number
    }> = []

    for (const item of items) {
      const product = await db.product.findUnique({
        where: { id: item.productId },
        select: { id: true, costPrice: true },
      })

      if (!product) {
        return NextResponse.json(
          { success: false, error: `Product ${item.productId} not found` },
          { status: 400 }
        )
      }

      const quantity = Number(item.quantity) || 0
      const unitCost = Number(item.unitCost) || product.costPrice || 0
      const lineTaxRate = Number(item.taxRate) || 0
      const lineSubtotal = quantity * unitCost
      const lineTaxAmount = lineSubtotal * (lineTaxRate / 100)

      subtotal += lineSubtotal
      taxAmount += lineTaxAmount

      orderItems.push({
        productId: product.id,
        quantity,
        receivedQty: Number(item.receivedQty) || 0,
        unitCost,
        taxRate: lineTaxRate,
        taxAmount: lineTaxAmount,
        total: lineSubtotal + lineTaxAmount,
      })
    }

    const purchaseOrder = await db.purchaseOrder.create({
      data: {
        poNumber: await generatePurchaseOrderNumber(),
        supplierId,
        companyId: supplier.companyId || (await getDefaultCompanyId(request)),
        warehouseId: await resolveDefaultWarehouseId(db as any, supplier.companyId || null),
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        subtotal,
        taxAmount,
        totalAmount: subtotal + taxAmount,
        notes: notes || null,
        items: {
          create: orderItems,
        },
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                costPrice: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ success: true, data: purchaseOrder })
  } catch (error) {
    console.error("Error creating purchase order:", error)
    return NextResponse.json({ success: false, error: "Failed to create purchase order" }, { status: 500 })
  }
}
