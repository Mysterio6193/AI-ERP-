import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { buildCustomerStatement, formatStatementNumber } from "@/lib/customer-statements"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId") || ""
    const search = searchParams.get("search") || ""

    if (customerId) {
      const customer = await db.customer.findUnique({
        where: { id: customerId },
        include: {
          invoices: {
            orderBy: { invoiceDate: "desc" },
            take: 50,
          },
          creditTransactions: {
            orderBy: { createdAt: "desc" },
            take: 100,
          },
        },
      })

      if (!customer) {
        return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
      }

      return NextResponse.json({ success: true, data: buildCustomerStatement(customer) })
    }

    const customers = await db.customer.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : undefined,
      include: {
        invoices: {
          where: {
            status: { in: ["unpaid", "partial", "overdue", "sent"] },
          },
          orderBy: { dueDate: "asc" },
          take: 20,
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    const statementSummaries = customers.map((customer) => {
      const outstandingBalance = customer.invoices.reduce((sum, invoice) => sum + invoice.outstandingAmt, 0)
      const nextDueDate = customer.invoices[0]?.dueDate || null

      return {
        customerId: customer.id,
        customerName: customer.name,
        email: customer.email,
        phone: customer.phone,
        statementNumber: formatStatementNumber(customer.name),
        creditLimit: customer.creditLimit,
        creditBalance: customer.creditBalance,
        creditStatus: customer.creditStatus,
        paymentTerms: customer.paymentTerms,
        openInvoiceCount: customer.invoices.length,
        outstandingBalance,
        nextDueDate,
      }
    })

    return NextResponse.json({ success: true, data: statementSummaries })
  } catch (error) {
    console.error("Error fetching customer statements:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch customer statements" },
      { status: 500 }
    )
  }
}
