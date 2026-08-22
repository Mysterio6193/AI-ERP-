import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"
import { db } from "@/lib/db"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const invoices = await db.invoice.findMany({
      where: { customerId: customer.id },
      include: {
        payments: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
      },
      orderBy: { invoiceDate: "desc" },
    })

    return customerJson(request, {
      success: true,
      message: "Invoices fetched successfully.",
      data: invoices.map((invoice) => ({
        id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        invoice_date: invoice.invoiceDate,
        due_date: invoice.dueDate,
        status: invoice.status,
        subtotal: invoice.subtotal,
        tax_amount: invoice.taxAmount,
        total_amount: invoice.totalAmount,
        paid_amount: invoice.paidAmount,
        outstanding_amount: invoice.outstandingAmt,
        order_number: invoice.order?.orderNumber || null,
        payment_count: invoice.payments.length,
      })),
    })
  } catch (error) {
    console.error("Customer invoices error:", error)
    return customerError(request, "Failed to fetch invoices.", 500)
  }
}
