import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { hashPassword, normalizeEmail } from "@/lib/customer-auth"

async function calculateOutstanding(customerId: string) {
  const invoices = await db.invoice.findMany({
    where: {
      customerId,
      status: { in: ["unpaid", "partial", "overdue", "sent"] },
    },
    select: { outstandingAmt: true },
  })

  return invoices.reduce((sum, invoice) => sum + invoice.outstandingAmt, 0)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        locations: true,
        priceList: true,
        creditApplications: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: { orders: true, invoices: true, creditApplications: true },
        },
      },
    })

    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
    }

    const outstanding = await calculateOutstanding(customer.id)
    return NextResponse.json({
      success: true,
      data: {
        ...customer,
        outstanding,
      },
    })
  } catch (error) {
    console.error("Error fetching customer:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch customer" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existingCustomer = await db.customer.findUnique({
      where: { id },
      include: {
        locations: true,
        priceList: true,
      },
    })

    if (!existingCustomer) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
    }

    const passwordHash = body.setPassword?.trim()
      ? await hashPassword(body.setPassword.trim())
      : undefined

    const updatedCustomer = await db.customer.update({
      where: { id },
      data: {
        name: body.name?.trim() || existingCustomer.name,
        tradingName: body.tradingName?.trim() || null,
        abn: body.abn?.trim() || null,
        acn: body.acn?.trim() || null,
        contactPerson: body.contactPerson?.trim() || null,
        email: body.email ? normalizeEmail(body.email) : null,
        emailVerifiedAt:
          body.emailVerified === true
            ? existingCustomer.emailVerifiedAt || new Date()
            : body.emailVerified === false
              ? null
              : existingCustomer.emailVerifiedAt,
        phone: body.phone?.trim() || null,
        alternatePhone: body.alternatePhone?.trim() || null,
        website: body.website?.trim() || null,
        creditLimit:
          body.creditLimit !== undefined ? Number(body.creditLimit) || 0 : existingCustomer.creditLimit,
        paymentTerms:
          body.paymentTerms !== undefined ? Number(body.paymentTerms) || 0 : existingCustomer.paymentTerms,
        creditStatus: body.creditStatus || existingCustomer.creditStatus,
        creditRating: body.creditRating?.trim() || null,
        customerType: body.customerType || existingCustomer.customerType,
        industry: body.industry?.trim() || null,
        status: body.status || existingCustomer.status,
        priceListId:
          body.priceListId !== undefined
            ? body.priceListId || null
            : existingCustomer.priceListId,
        passwordHash: passwordHash ?? existingCustomer.passwordHash,
      },
      include: {
        locations: true,
        priceList: true,
        _count: {
          select: { orders: true, invoices: true, creditApplications: true },
        },
      },
    })

    const outstanding = await calculateOutstanding(updatedCustomer.id)
    return NextResponse.json({
      success: true,
      data: {
        ...updatedCustomer,
        outstanding,
      },
    })
  } catch (error) {
    console.error("Error updating customer:", error)
    return NextResponse.json({ success: false, error: "Failed to update customer" }, { status: 500 })
  }
}
