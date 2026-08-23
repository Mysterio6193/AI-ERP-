import * as XLSX from "xlsx"
import { z } from "zod"

import { db } from "@/lib/db"
import { sendTelegramDocument, sendUploadDocumentAction } from "../channels/telegram"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Spreadsheet & Tabular Data Tools (Excel .xlsx & CSV).
 *
 * Hermes-grade data processing: Generate real .xlsx and .csv spreadsheets,
 * export live ERP reports, parse tabular data, and dispatch real attachments directly.
 */

function buildWorkbookBuffer(
  sheetName: string,
  headers: string[],
  rows: Array<Array<unknown>>,
  format: "xlsx" | "csv"
): { buffer: Buffer; csvText: string } {
  const aoa: Array<Array<unknown>> = [headers, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(aoa)

  // Auto-fit column widths
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

  const csvText = XLSX.utils.sheet_to_csv(worksheet)
  const buffer = format === "xlsx"
    ? (XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer)
    : Buffer.from(csvText, "utf-8")

  return { buffer, csvText }
}

async function dispatchTelegramFile(
  principal: AgentPrincipal,
  channel: string | undefined,
  fileName: string,
  fileBuffer: Buffer,
  caption?: string
): Promise<boolean> {
  if (channel !== "telegram") return false

  let targetChatId: string | null = null
  if (principal.kind === "staff") {
    const channelId = await db.channelIdentity.findFirst({
      where: { channel: "telegram", userId: principal.userId, status: "active" },
      select: { externalId: true },
    })
    targetChatId = channelId?.externalId || null
  } else {
    const channelId = await db.channelIdentity.findFirst({
      where: { channel: "telegram", customerId: principal.customerId, status: "active" },
      select: { externalId: true },
    })
    targetChatId = channelId?.externalId || null
  }

  if (targetChatId) {
    await sendUploadDocumentAction(targetChatId)
    return sendTelegramDocument(
      targetChatId,
      fileBuffer,
      fileName,
      caption || `📊 ${fileName}`
    )
  }
  return false
}

export function buildSpreadsheetTools(principal: AgentPrincipal, channel?: string) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    generateSpreadsheet: defineTool({
      description:
        "Generate and send a real Excel (.xlsx) or CSV spreadsheet from column headers and data rows. The platform compiles and delivers the real file directly into this chat/Telegram channel.",
      inputSchema: z.object({
        filename: z.string().describe("Filename for the spreadsheet (e.g. 'sales_summary.xlsx' or 'suppliers.csv')"),
        format: z.enum(["xlsx", "csv"]).optional().default("xlsx").describe("Spreadsheet format: 'xlsx' (Excel workbook) or 'csv'"),
        sheetName: z.string().optional().default("Data").describe("Name of the Excel sheet (default 'Data')"),
        headers: z.array(z.string()).describe("Column header names"),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
          .describe("Array of row data matching the headers"),
        includeSummaryRow: z.boolean().optional().default(true).describe("Include a summary total row for numeric columns"),
      }),
      execute: async ({ filename, format, sheetName, headers, rows, includeSummaryRow }) => {
        const ext = format === "xlsx" ? ".xlsx" : ".csv"
        const cleanFilename = filename.endsWith(".xlsx") || filename.endsWith(".csv")
          ? filename
          : `${filename}${ext}`

        // Check numeric columns for summary row
        const numericColumns = new Set<number>()
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const isNumeric = rows.length > 0 && rows.every((r) => {
            const val = r[colIdx]
            return val === null || val === "" || typeof val === "number" || (!isNaN(Number(val)) && typeof val === "string")
          })
          if (isNumeric) numericColumns.add(colIdx)
        }

        const dataRows: Array<Array<unknown>> = [...rows]

        if (includeSummaryRow && numericColumns.size > 0 && rows.length > 0) {
          const summaryRow: unknown[] = []
          for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            if (colIdx === 0) {
              summaryRow.push("TOTAL / SUMMARY")
            } else if (numericColumns.has(colIdx)) {
              const sum = rows.reduce((acc, r) => {
                const val = Number(r[colIdx])
                return acc + (isNaN(val) ? 0 : val)
              }, 0)
              summaryRow.push(Number(sum.toFixed(2)))
            } else {
              summaryRow.push("")
            }
          }
          dataRows.push(summaryRow)
        }

        const { buffer, csvText } = buildWorkbookBuffer(sheetName, headers, dataRows, format)

        const delivered = await dispatchTelegramFile(
          principal,
          channel,
          cleanFilename,
          buffer,
          `📊 Generated spreadsheet: ${cleanFilename} (${rows.length} rows)`
        )

        return {
          ok: true as const,
          filename: cleanFilename,
          format,
          rowCount: rows.length,
          columnCount: headers.length,
          deliveredToTelegram: delivered,
          fileSizeBytes: buffer.length,
          preview: csvText.split("\n").slice(0, 10).join("\n"),
          message: delivered
            ? `Successfully generated and sent "${cleanFilename}" (${(buffer.length / 1024).toFixed(1)} KB) directly as an attachment in this chat.`
            : `Generated spreadsheet "${cleanFilename}" with ${rows.length} rows and ${headers.length} columns.`,
        }
      },
    }),

    exportReportToCsv: defineTool({
      description:
        "Extract live ERP business data into a downloadable Excel (.xlsx) or CSV spreadsheet and deliver it directly to the chat. Supports: 'sales_orders', 'invoices', 'inventory', 'customers', 'suppliers', 'leads', 'batches', and 'delivery_routes'.",
      inputSchema: z.object({
        dataset: z.enum([
          "sales_orders", "invoices", "inventory",
          "customers", "suppliers", "leads", "batches", "delivery_routes",
        ]).describe("The ERP dataset to export"),
        format: z.enum(["xlsx", "csv"]).optional().default("xlsx").describe("Spreadsheet format: 'xlsx' (Excel) or 'csv'"),
        limit: z.number().optional().default(100).describe("Max records to export (default 100)"),
      }),
      execute: async ({ dataset, format, limit }) => {
        let headers: string[] = []
        let rows: Array<Array<string | number>> = []
        const nowStr = new Date().toISOString().split("T")[0]
        let sheetTitle = dataset.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

        switch (dataset) {
          case "sales_orders": {
            headers = ["Order Number", "Date", "Customer", "Status", "Items", "Subtotal ($)", "GST ($)", "Total Amount ($)"]
            const orders = await db.salesOrder.findMany({
              take: limit,
              orderBy: { createdAt: "desc" },
              include: { customer: { select: { name: true } }, items: true },
            })
            rows = orders.map((o) => [
              o.orderNumber,
              o.createdAt.toISOString().split("T")[0],
              o.customer?.name || "N/A",
              o.status,
              o.items.length,
              money(o.subtotal),
              money(o.taxAmount),
              money(o.totalAmount),
            ])
            break
          }
          case "invoices": {
            headers = ["Invoice Number", "Date", "Due Date", "Customer", "Status", "Total Amount ($)", "Paid Amount ($)", "Outstanding ($)"]
            const invoices = await db.invoice.findMany({
              take: limit,
              orderBy: { createdAt: "desc" },
              include: { customer: { select: { name: true } } },
            })
            rows = invoices.map((inv) => [
              inv.invoiceNumber,
              inv.createdAt.toISOString().split("T")[0],
              inv.dueDate.toISOString().split("T")[0],
              inv.customer?.name || "N/A",
              inv.status,
              money(inv.totalAmount),
              money(inv.paidAmount),
              money(inv.outstandingAmt),
            ])
            break
          }
          case "inventory": {
            headers = ["SKU", "Product Name", "Category", "Qty on Hand", "Unit", "Cost Price ($)", "Sell Price ($)", "Total Value ($)"]
            const inventory = await db.inventory.findMany({
              take: limit,
              orderBy: { product: { name: "asc" } },
              include: { product: true },
            })
            rows = inventory.map((inv) => [
              inv.product.sku,
              inv.product.name,
              inv.product.category || "General",
              inv.quantity,
              inv.product.unit || "unit",
              money(inv.product.costPrice || 0),
              money(inv.product.basePrice),
              money(inv.quantity * (inv.product.costPrice || inv.product.basePrice)),
            ])
            break
          }
          case "customers": {
            headers = ["Account Code", "Business Name", "Contact", "Phone", "Email", "Payment Terms", "Credit Limit ($)", "Status"]
            const customers = await db.customer.findMany({
              take: limit,
              orderBy: { name: "asc" },
            })
            rows = customers.map((c) => [
              c.code || "N/A",
              c.name,
              c.contactName || "N/A",
              c.phone || "N/A",
              c.email || "N/A",
              `${c.paymentTermsDays || 30} days`,
              money(c.creditLimit || 0),
              c.status,
            ])
            break
          }
          case "suppliers": {
            headers = ["Supplier Name", "Code", "Contact Person", "Phone", "Email", "Payment Terms", "Lead Time (Days)", "Status"]
            const suppliers = await db.supplier.findMany({
              take: limit,
              orderBy: { name: "asc" },
            })
            rows = suppliers.map((s) => [
              s.name,
              s.code || "N/A",
              s.contactName || "N/A",
              s.phone || "N/A",
              s.email || "N/A",
              `${s.paymentTermsDays || 30} days`,
              s.leadTimeDays || 3,
              s.status,
            ])
            break
          }
          case "leads": {
            headers = ["Business Name", "Contact", "Email", "Phone", "Status", "Estimated Value ($)", "Source", "Created Date"]
            const leads = await db.lead.findMany({
              take: limit,
              orderBy: { createdAt: "desc" },
            })
            rows = leads.map((l) => [
              l.businessName,
              l.contactName || "N/A",
              l.email || "N/A",
              l.phone || "N/A",
              l.status,
              money(l.estimatedValue || 0),
              l.source || "Direct",
              l.createdAt.toISOString().split("T")[0],
            ])
            break
          }
          case "batches": {
            headers = ["Batch Number", "Product Name", "SKU", "Initial Qty", "Current Qty", "Expiry Date", "Supplier", "Status"]
            const batches = await db.batch.findMany({
              take: limit,
              orderBy: { expiryDate: "asc" },
              include: { product: true, supplier: true },
            })
            rows = batches.map((b) => [
              b.batchNumber,
              b.product?.name || "N/A",
              b.product?.sku || "N/A",
              b.initialQty,
              b.currentQty,
              b.expiryDate ? b.expiryDate.toISOString().split("T")[0] : "N/A",
              b.supplier?.name || "N/A",
              b.isQuarantined ? "QUARANTINED" : "Active",
            ])
            break
          }
          case "delivery_routes": {
            headers = ["Route Number", "Route Name", "Date", "Driver", "Vehicle", "Total Stops", "Status"]
            const routes = await db.deliveryRoute.findMany({
              take: limit,
              orderBy: { routeDate: "desc" },
              include: { driver: { select: { name: true } }, deliveries: true },
            })
            rows = routes.map((r) => [
              r.routeNumber,
              r.name,
              r.routeDate.toISOString().split("T")[0],
              r.driver?.name || "Unassigned",
              r.vehicle || "Standard Van",
              r.deliveries.length,
              r.status,
            ])
            break
          }
        }

        const ext = format === "xlsx" ? ".xlsx" : ".csv"
        const filename = `${dataset}_export_${nowStr}${ext}`
        const { buffer, csvText } = buildWorkbookBuffer(sheetTitle, headers, rows, format)

        const delivered = await dispatchTelegramFile(
          principal,
          channel,
          filename,
          buffer,
          `📊 Exported ${rows.length} ${dataset.replace(/_/g, " ")} records (${filename})`
        )

        return {
          ok: true as const,
          dataset,
          format,
          filename,
          recordCount: rows.length,
          deliveredToTelegram: delivered,
          fileSizeBytes: buffer.length,
          preview: csvText.split("\n").slice(0, 10).join("\n"),
          message: delivered
            ? `Successfully exported and sent "${filename}" (${(buffer.length / 1024).toFixed(1)} KB) directly as an attachment in this chat.`
            : `Exported ${rows.length} ${dataset.replace(/_/g, " ")} records to ${filename}.`,
        }
      },
    }),

    parseSpreadsheet: defineTool({
      description:
        "Parse raw CSV or tab-delimited text into structured JSON objects. Useful for importing external price lists, product catalogs, or customer data.",
      inputSchema: z.object({
        csvText: z.string().describe("The raw CSV or TSV text content"),
        delimiter: z.enum([",", "\t", ";", "|"]).optional().default(","),
      }),
      execute: async ({ csvText, delimiter }) => {
        const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0)
        if (lines.length === 0) {
          return { ok: false as const, error: "Empty CSV text provided." }
        }

        const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""))
        const records: Array<Record<string, string | number>> = []

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, ""))
          const record: Record<string, string | number> = {}
          for (let j = 0; j < headers.length; j++) {
            const key = headers[j] || `col_${j}`
            const rawVal = values[j] !== undefined ? values[j] : ""
            const num = Number(rawVal)
            record[key] = !isNaN(num) && rawVal !== "" ? num : rawVal
          }
          records.push(record)
        }

        return {
          ok: true as const,
          headers,
          recordCount: records.length,
          records: records.slice(0, 50),
          message: `Parsed ${records.length} records across ${headers.length} columns.`,
        }
      },
    }),
  }
}
