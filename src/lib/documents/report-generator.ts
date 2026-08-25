import * as XLSX from "xlsx"
import { db } from "@/lib/db"
import {
  renderInvoicePdfBuffer,
  renderSalesOrderPdfBuffer,
  renderCustomerStatementPdfBuffer,
  renderCustomReportPdfBuffer,
} from "./render-pdf"

export interface ReportGenerationOptions {
  documentType:
    | "leads"
    | "inventory"
    | "suppliers"
    | "customers"
    | "routes"
    | "batches"
    | "invoice"
    | "order"
    | "statement"
    | "custom"
  reference?: string
  format?: "pdf" | "xlsx" | "csv"
  title?: string
  subtitle?: string
  headers?: string[]
  rows?: Array<Array<string | number | boolean | null>>
  summaryCards?: Array<{ label: string; value: string | number }>
  fileName?: string
}

export interface GeneratedDocument {
  buffer: Buffer
  fileName: string
  mimeType: string
  title: string
  recordCount: number
}

function buildSpreadsheetBuffer(
  sheetName: string,
  headers: string[],
  rows: Array<Array<unknown>>,
  format: "xlsx" | "csv"
): Buffer {
  const aoa = [headers, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  const colWidths = headers.map((header, colIdx) => {
    let maxLen = header.length
    for (const row of rows) {
      const cellVal = row[colIdx]
      if (cellVal !== null && cellVal !== undefined) {
        maxLen = Math.max(maxLen, String(cellVal).length)
      }
    }
    return { wch: Math.min(maxLen + 4, 50) }
  })
  worksheet["!cols"] = colWidths

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))

  if (format === "xlsx") {
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
  }
  return Buffer.from(XLSX.utils.sheet_to_csv(worksheet), "utf-8")
}

export async function generateDocumentReport(
  options: ReportGenerationOptions
): Promise<GeneratedDocument | null> {
  const format = options.format || "pdf"
  const docType = options.documentType

  // 1. Single-entity PDF documents (invoice, order, statement)
  if (docType === "invoice") {
    const ref = options.reference || ""
    const pdfRes = await renderInvoicePdfBuffer(ref)
    if (!pdfRes) {
      const order = await db.salesOrder.findFirst({
        where: { OR: [{ id: ref }, { orderNumber: ref }] },
        include: { invoice: true },
      })
      if (order?.invoice) {
        const invRes = await renderInvoicePdfBuffer(order.invoice.id)
        if (invRes) {
          return {
            buffer: invRes.buffer,
            fileName: invRes.fileName,
            mimeType: "application/pdf",
            title: `Invoice ${order.invoice.invoiceNumber}`,
            recordCount: 1,
          }
        }
      }
      return null
    }
    return {
      buffer: pdfRes.buffer,
      fileName: pdfRes.fileName,
      mimeType: "application/pdf",
      title: `Invoice ${options.reference}`,
      recordCount: 1,
    }
  }

  if (docType === "order") {
    const pdfRes = await renderSalesOrderPdfBuffer(options.reference || "")
    if (!pdfRes) return null
    return {
      buffer: pdfRes.buffer,
      fileName: pdfRes.fileName,
      mimeType: "application/pdf",
      title: `Sales Order ${options.reference}`,
      recordCount: 1,
    }
  }

  if (docType === "statement") {
    const pdfRes = await renderCustomerStatementPdfBuffer(options.reference || "")
    if (!pdfRes) return null
    return {
      buffer: pdfRes.buffer,
      fileName: pdfRes.fileName,
      mimeType: "application/pdf",
      title: `Account Statement ${options.reference}`,
      recordCount: 1,
    }
  }

  // 2. Tabular Entity Reports (leads, inventory, suppliers, customers, routes, batches, custom)
  let title = options.title || ""
  let subtitle = options.subtitle || ""
  let headers: string[] = options.headers || []
  let rows: Array<Array<unknown>> = options.rows || []
  let summaryCards: Array<{ label: string; value: string | number }> = options.summaryCards || []
  let defaultFileName = options.fileName || ""

  if (docType === "leads") {
    const ref = (options.reference || "").toLowerCase().trim()
    const leads = await db.lead.findMany({
      where: ref
        ? {
            OR: [
              { businessName: { contains: ref, mode: "insensitive" } },
              { contactName: { contains: ref, mode: "insensitive" } },
              { suburb: { contains: ref, mode: "insensitive" } },
              { source: { contains: ref, mode: "insensitive" } },
              { notes: { contains: ref, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ status: "asc" }, { businessName: "asc" }],
      take: 150,
    })

    title = title || (ref ? `Hospitality Leads Register (${ref.toUpperCase()})` : "Fine Foods Hospitality Leads Register 2025")
    subtitle = subtitle || `RDM Pizza Australia Commercial Pipeline • Total Leads: ${leads.length}`
    headers = ["Business / Venue Name", "Contact Person", "Phone", "Email", "State/Suburb", "Status", "Notes / Requirements"]
    rows = leads.map((l) => [
      l.businessName,
      l.contactName || "—",
      l.phone || "—",
      l.email || "—",
      l.suburb || "QLD",
      l.status.toUpperCase(),
      (l.notes || "—").replace(/\n+/g, " | ").slice(0, 75),
    ])

    const convertedCount = leads.filter((l) => l.status === "customer" || l.status === "converted").length
    const newCount = leads.filter((l) => l.status === "new" || l.status === "reachable").length

    summaryCards = [
      { label: "Total Prospect Leads", value: leads.length },
      { label: "New / Reachable", value: newCount },
      { label: "Converted to Trade Accounts", value: convertedCount },
      { label: "Target State", value: "QLD & NSW" },
    ]
    defaultFileName = defaultFileName || "rdm_pizza_hospitality_leads_2025"
  } else if (docType === "inventory") {
    const inventory = await db.inventory.findMany({
      take: 100,
      orderBy: { product: { name: "asc" } },
      include: { product: { include: { category: true } } },
    })

    title = title || "Warehouse Inventory Valuation & Stock Register"
    subtitle = subtitle || `RDM Manufacturing Gregory Hills Facility • ${inventory.length} Tracked SKUs`
    headers = ["SKU", "Product Description", "Category", "Quantity On Hand", "Base Unit", "Unit Cost", "Wholesale Price"]
    rows = inventory.map((inv) => [
      inv.product.sku,
      inv.product.name,
      inv.product.category?.name || "General",
      inv.quantity,
      inv.product.baseUnit || "unit",
      `$${Number(inv.product.costPrice || 0).toFixed(2)}`,
      `$${Number(inv.product.wholesalePrice || 0).toFixed(2)}`,
    ])

    const totalUnits = inventory.reduce((sum, i) => sum + i.quantity, 0)
    summaryCards = [
      { label: "Tracked SKUs", value: inventory.length },
      { label: "Total Units On Hand", value: totalUnits },
      { label: "Storage Facility", value: "Gregory Hills NSW" },
    ]
    defaultFileName = defaultFileName || "rdm_inventory_stock_report"
  } else if (docType === "suppliers") {
    const suppliers = await db.supplier.findMany({
      orderBy: { name: "asc" },
      take: 100,
    })

    title = title || "Wholesale Supplier & Ingredients Directory"
    subtitle = subtitle || `Authorized Vendors • Total: ${suppliers.length}`
    headers = ["Supplier Name", "ABN", "Contact Person", "Phone", "Email", "Payment Terms"]
    rows = suppliers.map((s) => [
      s.name,
      s.abn || "N/A",
      s.contactPerson || "—",
      s.phone || "—",
      s.email || "—",
      `${s.paymentTerms || 30} Days Net`,
    ])

    summaryCards = [
      { label: "Total Active Suppliers", value: suppliers.length },
      { label: "Standard Trade Terms", value: "30 Days Net" },
    ]
    defaultFileName = defaultFileName || "rdm_supplier_directory"
  } else if (docType === "customers") {
    const customers = await db.customer.findMany({
      take: 100,
      orderBy: { name: "asc" },
    })

    title = title || "Wholesale Customer Accounts Register"
    subtitle = subtitle || `Active Foodservice Clients • Total: ${customers.length}`
    headers = ["Business Name", "Contact", "Phone", "Email", "Payment Terms", "Status"]
    rows = customers.map((c) => [
      c.name,
      c.contactPerson || "—",
      c.phone || "—",
      c.email || "—",
      `${c.paymentTerms || 30} Days Net`,
      c.status.toUpperCase(),
    ])

    summaryCards = [
      { label: "Total Trade Accounts", value: customers.length },
      { label: "Terms", value: "Standard Net 30" },
    ]
    defaultFileName = defaultFileName || "rdm_customer_trade_register"
  } else if (docType === "routes") {
    const routes = await db.deliveryRoute.findMany({
      take: 50,
      orderBy: { routeDate: "desc" },
      include: { driver: { select: { name: true } }, deliveries: true },
    })

    title = title || "Fleet Delivery Runsheets & Route Schedules"
    subtitle = subtitle || "Scheduled Distribution Runs"
    headers = ["Route #", "Route Name", "Date", "Driver", "Vehicle", "Stops", "Status"]
    rows = routes.map((r) => [
      r.routeNumber,
      r.name,
      r.routeDate.toISOString().split("T")[0],
      r.driver?.name || "Unassigned",
      r.vehicle || "Refrigerated Van",
      r.deliveries.length,
      r.status.toUpperCase(),
    ])

    summaryCards = [
      { label: "Scheduled Routes", value: routes.length },
      { label: "Fleet Status", value: "Active" },
    ]
    defaultFileName = defaultFileName || "rdm_delivery_routes"
  } else if (docType === "batches") {
    const batches = await db.inventoryBatch.findMany({
      take: 100,
      orderBy: { expiryDate: "asc" },
    })

    const [batchProducts, batchSuppliers] = await Promise.all([
      db.product.findMany({
        where: { id: { in: batches.map((b) => b.productId) } },
        select: { id: true, name: true, sku: true },
      }),
      db.supplier.findMany({
        where: { id: { in: batches.map((b) => b.supplierId).filter(Boolean) as string[] } },
        select: { id: true, name: true },
      }),
    ])

    const batchProductById = new Map(batchProducts.map((x) => [x.id, x]))
    const batchSupplierById = new Map(batchSuppliers.map((x) => [x.id, x]))

    title = title || "HACCP Food Safety Batch Traceability Register"
    subtitle = subtitle || `Production Lots & Expiry Audit • Total Batches: ${batches.length}`
    headers = ["Batch Code", "Product Description", "SKU", "On Hand", "Expiry Date", "Supplier", "Safety Status"]
    rows = batches.map((b) => [
      b.batchCode,
      batchProductById.get(b.productId)?.name || "—",
      batchProductById.get(b.productId)?.sku || "—",
      b.quantity,
      b.expiryDate ? b.expiryDate.toISOString().split("T")[0] : "—",
      (b.supplierId && batchSupplierById.get(b.supplierId)?.name) || "—",
      b.status === "quarantined" ? "QUARANTINED" : b.status.toUpperCase(),
    ])

    summaryCards = [
      { label: "Total Batches", value: batches.length },
      { label: "Compliance Standard", value: "HACCP Certified" },
    ]
    defaultFileName = defaultFileName || "rdm_batch_traceability_register"
  } else if (docType === "custom") {
    title = title || "Custom Operational Analysis Report"
    subtitle = subtitle || `Generated on ${new Date().toLocaleDateString("en-AU")}`
    defaultFileName = defaultFileName || "custom_report"
  }

  if (format === "xlsx" || format === "csv") {
    const ext = format === "xlsx" ? ".xlsx" : ".csv"
    const finalFileName = defaultFileName.endsWith(ext) ? defaultFileName : `${defaultFileName}${ext}`
    const buffer = buildSpreadsheetBuffer("Report", headers, rows, format)
    return {
      buffer,
      fileName: finalFileName,
      mimeType: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv",
      title,
      recordCount: rows.length,
    }
  }

  // Format is PDF
  const finalPdfName = defaultFileName.endsWith(".pdf") ? defaultFileName : `${defaultFileName}.pdf`
  const pdfRes = await renderCustomReportPdfBuffer({
    title,
    subtitle,
    headers,
    rows: rows as any,
    summaryCards,
    fileName: finalPdfName,
  })

  return {
    buffer: pdfRes.buffer,
    fileName: pdfRes.fileName,
    mimeType: "application/pdf",
    title,
    recordCount: rows.length,
  }
}
