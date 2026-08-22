import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"

/** The entity the request is acting as, not merely the first row. */
async function getDefaultCompanyId(request: NextRequest) {
  return getActiveCompanyId(request)
}

async function generateQuoteNumber() {
  const currentYear = new Date().getFullYear()
  const prefix = `QT-${currentYear}-`
  const lastQuote = await db.quote.findFirst({
    where: { quoteNumber: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: { quoteNumber: true },
  })

  let nextNumber = 1001
  if (lastQuote) {
    const parts = lastQuote.quoteNumber.split("-")
    if (parts.length >= 3) {
      nextNumber = Number.parseInt(parts[2], 10) + 1
    }
  }

  return `${prefix}${nextNumber.toString().padStart(5, "0")}`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || ""

    const quotes = await db.quote.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { quoteNumber: { contains: search } },
                  { customer: { name: { contains: search } } },
                ],
              }
            : {},
          status ? { status } : {},
        ],
      },
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                wholesalePrice: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: quotes })
  } catch (error) {
    console.error("Error fetching quotes:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch quotes" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerId, validUntil, customerNotes, internalNotes, items } = body

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true, companyId: true },
    })

    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
    }

    let subtotal = 0
    let discountAmount = 0
    let taxAmount = 0

    const quoteItems: Array<{
      productId: string
      quantity: number
      unitPrice: number
      discount: number
      taxRate: number
      taxAmount: number
      total: number
    }> = []
    for (const item of items) {
      const product = await db.product.findUnique({
        where: { id: item.productId },
        select: { id: true, wholesalePrice: true, gstRate: true },
      })

      if (!product) {
        return NextResponse.json(
          { success: false, error: `Product ${item.productId} not found` },
          { status: 400 }
        )
      }

      const quantity = Number(item.quantity) || 0
      const unitPrice = Number(item.unitPrice) || product.wholesalePrice
      const discount = Number(item.discount) || 0
      const lineSubtotal = quantity * unitPrice
      const lineDiscount = lineSubtotal * (discount / 100)
      const netAmount = lineSubtotal - lineDiscount
      const lineTaxRate = Number(item.taxRate) || product.gstRate || 0
      const lineTaxAmount = netAmount * (lineTaxRate / 100)
      const total = netAmount + lineTaxAmount

      subtotal += lineSubtotal
      discountAmount += lineDiscount
      taxAmount += lineTaxAmount

      quoteItems.push({
        productId: product.id,
        quantity,
        unitPrice,
        discount,
        taxRate: lineTaxRate,
        taxAmount: lineTaxAmount,
        total,
      })
    }

    const quote = await db.quote.create({
      data: {
        quoteNumber: await generateQuoteNumber(),
        customerId,
        companyId: customer.companyId || (await getDefaultCompanyId(request)),
        validUntil: validUntil ? new Date(validUntil) : null,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount: subtotal - discountAmount + taxAmount,
        customerNotes: customerNotes || null,
        internalNotes: internalNotes || null,
        items: {
          create: quoteItems,
        },
      },
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                wholesalePrice: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ success: true, data: quote })
  } catch (error) {
    console.error("Error creating quote:", error)
    return NextResponse.json({ success: false, error: "Failed to create quote" }, { status: 500 })
  }
}
