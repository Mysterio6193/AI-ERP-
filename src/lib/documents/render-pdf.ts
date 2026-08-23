import React from "react"
import { pdf } from "@react-pdf/renderer"

import { db } from "@/lib/db"
import InvoicePDF from "@/components/documents/InvoicePDF"
import SalesOrderPDF from "@/components/documents/SalesOrderPDF"
import CustomerStatementPDF from "@/components/documents/CustomerStatementPDF"

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
        items: {
          include: { product: true },
        },
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
    items: invoice.items && invoice.items.length > 0 ? invoice.items : (invoice.order?.items || []).map((item) => ({
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
        payments: {
          orderBy: { paymentDate: "desc" },
          take: 20,
        },
      },
    }),
    db.company.findFirst(),
  ])

  if (!customer) {
    return null
  }

  const docElement = React.createElement(CustomerStatementPDF, {
    customer,
    invoices: customer.invoices || [],
    payments: customer.payments || [],
    company: company || {},
    statementDate: new Date(),
  })

  const blob = await pdf(docElement as any).toBlob()
  const arrayBuffer = await blob.arrayBuffer()

  return {
    buffer: Buffer.from(arrayBuffer),
    fileName: `statement-${customer.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
  }
}
