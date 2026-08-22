import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { buildCustomerStatement } from "@/lib/customer-statements"
import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const statementCustomer = await db.customer.findUnique({
      where: { id: customer.id },
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

    if (!statementCustomer) {
      return customerError(request, "Customer account not found.", 404)
    }

    return customerJson(request, {
      success: true,
      message: "Statement fetched successfully.",
      data: buildCustomerStatement(statementCustomer),
    })
  } catch (error) {
    console.error("Customer statement error:", error)
    return customerError(request, "Failed to fetch statement.", 500)
  }
}
