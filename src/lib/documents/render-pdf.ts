import React from "react"
import { pdf } from "@react-pdf/renderer"

import { db } from "@/lib/db"
import InvoicePDF from "@/components/documents/InvoicePDF"
import SalesOrderPDF from "@/components/documents/SalesOrderPDF"
import CustomerStatementPDF from "@/components/documents/CustomerStatementPDF"
import { buildCustomerStatement } from "@/lib/customer-statements"

/**
 * The entity a document belongs to.
 *
 * Every renderer here used to fetch `company.findFirst()` alongside the
 * document, ignoring the document's own `companyId`. On a group billing from
 * more than one entity that prints the wrong company's name, ABN and **bank
 * details** — so an invoice raised by the retail arm asked customers to pay the
 * manufacturing arm's account. The fallback stays for records predating
 * multi-entity, but the document's own company wins.
 */
async function companyForDocument(companyId: string | null | undefined) {
  if (companyId) {
    const owned = await db.company.findUnique({ where: { id: companyId } })
    if (owned) return owned
  }

  return db.company.findFirst({ orderBy: { createdAt: "asc" } })
}

export async function renderInvoicePdfBuffer(invoiceIdOrNumber: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  const invoice = await db.invoice.findFirst({
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
    })

  if (!invoice) {
    return null
  }

  const company = await companyForDocument(invoice.companyId)

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
  const order = await db.salesOrder.findFirst({
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
    })

  if (!order) {
    return null
  }

  const company = await companyForDocument(order.companyId)

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
  const customer = await db.customer.findFirst({
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
    })

  if (!customer) {
    return null
  }

  const company = await companyForDocument(customer.companyId)

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

export async function renderCustomReportPdfBuffer(options: {
  title: string
  subtitle?: string
  headers: string[]
  rows: Array<Array<string | number | boolean | null>>
  summaryCards?: Array<{ label: string; value: string | number }>
  fileName?: string
  /**
   * Whose report this is. Without it the renderer took `findFirst()`, so on a
   * group with more than one entity a report from the retail arm printed the
   * manufacturing arm's name — the wrong company on a document sent outside.
   */
  companyId?: string | null
}): Promise<{ buffer: Buffer; fileName: string }> {
  const company = options.companyId
    ? await db.company.findUnique({ where: { id: options.companyId } })
    : await db.company.findFirst({ orderBy: { createdAt: "asc" } })

  const CustomReportPDF = (await import("@/components/documents/CustomReportPDF")).default

  const docElement = React.createElement(CustomReportPDF, {
    title: options.title,
    subtitle: options.subtitle,
    headers: options.headers,
    rows: options.rows,
    summaryCards: options.summaryCards,
    // No product name standing in for a business. A report headed with the
    // software's name rather than the company's looks like a demo.
    companyName: company?.name ?? "",
  })

  const blob = await pdf(docElement as any).toBlob()
  const arrayBuffer = await blob.arrayBuffer()
  const cleanFileName = options.fileName
    ? (options.fileName.endsWith(".pdf") ? options.fileName : `${options.fileName}.pdf`)
    : `${options.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pdf`

  return {
    buffer: Buffer.from(arrayBuffer),
    fileName: cleanFileName,
  }
}
