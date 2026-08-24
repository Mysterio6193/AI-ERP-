import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { getActiveCompanyId } from "@/lib/active-company"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"
import { getSettings } from "@/lib/settings/service"
import { computeLineTax } from "@/lib/tax"
import { nextDocumentNumber } from "@/lib/numbering"
import { resolveLinePrice } from "@/lib/pricing"

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
    const auth = await requireAdminUser(request, ROLE_SETS.staff)
    if (!auth.user) return auth.response

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || ""

    const quotes = await db.quote.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { quoteNumber: { contains: search, mode: "insensitive" } },
                  { customer: { name: { contains: search, mode: "insensitive" } } },
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
    const auth = await requireAdminUser(request, ROLE_SETS.commercial)
    if (!auth.user) return auth.response

    const body = await request.json()
    const { customerId, validUntil, customerNotes, internalNotes, items } = body

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true, companyId: true, customerType: true, priceListId: true },
    })

    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
    }

    const productIds = Array.from(
      new Set(
        items
          .map((item: any) => String(item.productId || "").trim())
          .filter(Boolean)
      )
    )

    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true, wholesalePrice: true, retailPrice: true, gstRate: true, gstExempt: true,
        // A named rate wins over the bare percentage.
        taxRate: { select: { rate: true, status: true, taxType: true } },
      },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    const quoteCompanyId = customer.companyId || (await getDefaultCompanyId(request))
    const taxSettings = await getSettings("tax", { companyId: quoteCompanyId })
    const quoteCompany = quoteCompanyId
      ? await db.company.findUnique({
          where: { id: quoteCompanyId },
          select: { gstRate: true, country: true },
        })
      : null

    const pricingSettings = await getSettings("pricing", { companyId: quoteCompanyId })

    const priceLists = pricingSettings.enablePriceLists
      ? await db.priceList.findMany({
          select: {
            id: true,
            isDefault: true,
            type: true,
            status: true,
            validFrom: true,
            validTo: true,
            createdAt: true,
          },
        })
      : []

    const priceListItems = pricingSettings.enablePriceLists
      ? await db.priceListItem.findMany({
          where: { productId: { in: productIds } },
          select: {
            id: true,
            priceListId: true,
            productId: true,
            price: true,
            minQty: true,
            maxQty: true,
            discountPercent: true,
            discountFlat: true,
          },
        })
      : []

    let subtotal = 0
    let discountAmount = 0
    let taxAmount = 0

    const quoteItems: Array<{
      priceListItemId: string | null
      priceSource: string
      productId: string
      quantity: number
      unitPrice: number
      discount: number
      taxRate: number
      taxAmount: number
      total: number
    }> = []

    for (const item of items) {
      const product = productMap.get(item.productId)

      if (!product) {
        return NextResponse.json(
          { success: false, error: `Product ${item.productId} not found` },
          { status: 400 }
        )
      }

      const quantity = Number(item.quantity) || 0

      // `Number(item.unitPrice) || product.wholesalePrice` both discarded a
      // deliberate zero and skipped the customer's contract list.
      const priced = resolveLinePrice(
        {
          quantity,
          unitPriceOverride:
            item.unitPrice === undefined || item.unitPrice === null
              ? null
              : Number(item.unitPrice),
          product: { wholesalePrice: product.wholesalePrice, retailPrice: product.retailPrice },
          customer,
          items: priceListItems.filter((entry) => entry.productId === product.id),
          lists: priceLists,
        },
        pricingSettings
      )

      const unitPrice = priced.unitPrice
      const discount = Number(item.discount) || 0
      const lineSubtotal = quantity * unitPrice
      const lineDiscount = lineSubtotal * (discount / 100)
      const netAmount = lineSubtotal - lineDiscount
      // `Number(item.taxRate) || ...` treated a deliberate 0% line as absent
      // and silently reinstated the product's rate.
      const rawLineRate = item.taxRate === undefined || item.taxRate === null
        ? null
        : Number(item.taxRate)

      const lineTax = computeLineTax(
        netAmount,
        {
          lineRate: rawLineRate,
          product: { gstRate: product.gstRate, gstExempt: product.gstExempt, taxRate: product.taxRate },
          customer,
          company: quoteCompany,
        },
        taxSettings
      )

      const lineTaxRate = lineTax.rate
      const lineTaxAmount = lineTax.taxAmount
      const total = lineTax.total

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
        priceListItemId: priced.priceListItemId,
        priceSource: priced.source,
      })
    }

    const quote = await db.quote.create({
      data: {
        quoteNumber: await nextDocumentNumber("quote", {
          db,
          companyId: quoteCompanyId,
          legacy: generateQuoteNumber,
        }),
        customerId,
        companyId: quoteCompanyId,
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
