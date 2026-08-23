import React from "react"
import { pdf } from "@react-pdf/renderer"

import { db } from "@/lib/db"
import InvoicePDF from "@/components/documents/InvoicePDF"
import SalesOrderPDF from "@/components/documents/SalesOrderPDF"
import CustomerStatementPDF from "@/components/documents/CustomerStatementPDF"
import { buildCustomerStatement } from "@/lib/customer-statements"

export async function renderInvoicePdfBuffer(invoiceIdOrNumber: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  const [invoice, company] = await Promise.all([
    db.invoice.findFirst({
      where: {
        OR: [{ id: invoiceIdOrNumber }, { invoiceNumber: invoiceIdOrNumber }],
      },
      include: {
        customer: {
          include: { locations: true },
        },
        order: {
          include: {
            items: {
              include: { product: true },
            },
          },
        },
        // Invoice has no `items` relation: the lines live on the order it
        // bills, which is already included above.
        payments: true,
      },
    }),
    db.company.findFirst(),
  ])

  if (!invoice) {
    return null
  }

  const populatedInvoice = {
    ...invoice,
    items: (invoice.order?.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      product: item.product,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      notes: null,
    })),
  }

  const docElement = React.createElement(InvoicePDF, {
    invoice: populatedInvoice,
    company: company || {},
  })

  const blob = await pdf(docElement as any).toBlob()
  const arrayBuffer = await blob.arrayBuffer()

  return {
    buffer: Buffer.from(arrayBuffer),
    fileName: `${invoice.invoiceNumber || "invoice"}.pdf`,
  }
}

export async function renderSalesOrderPdfBuffer(orderIdOrNumber: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  const [order, company] = await Promise.all([
    db.salesOrder.findFirst({
      where: {
        OR: [{ id: orderIdOrNumber }, { orderNumber: orderIdOrNumber }],
      },
      include: {
        customer: {
          include: { locations: true },
        },
        items: {
          include: { product: true },
        },
      },
    }),
    db.company.findFirst(),
  ])

  if (!order) {
    return null
  }

  const docElement = React.createElement(SalesOrderPDF, {
    order,
    company: company || {},
  })

  const blob = await pdf(docElement as any).toBlob()
  const arrayBuffer = await blob.arrayBuffer()

  return {
    buffer: Buffer.from(arrayBuffer),
    fileName: `${order.orderNumber || "order"}.pdf`,
  }
}

export async function renderCustomerStatementPdfBuffer(customerIdOrName: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  const [customer, company] = await Promise.all([
    db.customer.findFirst({
      where: {
        OR: [{ id: customerIdOrName }, { name: { contains: customerIdOrName, mode: "insensitive" } }],
      },
      include: {
        locations: true,
        invoices: {
          where: { status: { not: "cancelled" } },
          orderBy: { invoiceDate: "desc" },
          take: 30,
        },
        // buildCustomerStatement derives the ledger from these, so the two
        // statement paths — screen and PDF — produce the same figures.
        creditTransactions: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    }),
    db.company.findFirst(),
  ])

  if (!customer) {
    return null
  }

  // The component takes a built statement, not raw rows. Building it here
  // rather than passing loose arrays means the PDF, the screen and the API all
  // age receivables the same way — which was the point of one bucketise().
  const statement = buildCustomerStatement(customer as never)

  const docElement = React.createElement(CustomerStatementPDF, {
    statement,
    company: company || {},
  })

  const blob = await pdf(docElement as any).toBlob()
  const arrayBuffer = await blob.arrayBuffer()

  return {
    buffer: Buffer.from(arrayBuffer),
    fileName: `statement-${customer.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
  }
}
