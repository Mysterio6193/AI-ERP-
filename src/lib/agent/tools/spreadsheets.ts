import { z } from "zod"

import { db } from "@/lib/db"
import { sendTelegramDocument, sendUploadDocumentAction } from "../channels/telegram"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Spreadsheet & Tabular Data Tools.
 *
 * Hermes-grade data processing: Generate CSV spreadsheets, export ERP reports,
 * parse tabular data, and compute column summaries with direct file delivery.
 */

function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return ""
  const str = String(val)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

async function dispatchTelegramCsv(
  principal: AgentPrincipal,
  channel: string | undefined,
  fileName: string,
  csvContent: string,
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
      Buffer.from(csvContent, "utf-8"),
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
        "Generate a formatted CSV spreadsheet from column headers and rows of data. Automatically computes column totals and delivers the file directly to the chat.",
      inputSchema: z.object({
        filename: z.string().describe("Filename for the spreadsheet (e.g. 'sales_summary.csv')"),
        headers: z.array(z.string()).describe("Column header names"),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
          .describe("Array of row data matching the headers"),
        includeSummaryRow: z.boolean().optional().default(true).describe("Include a summary total/average row for numeric columns"),
      }),
      execute: async ({ filename, headers, rows, includeSummaryRow }) => {
        const cleanFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`

        // Check which columns are numeric
        const numericColumns = new Set<number>()
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const isNumeric = rows.length > 0 && rows.every((r) => {
            const val = r[colIdx]
            return val === null || val === "" || typeof val === "number" || (!isNaN(Number(val)) && typeof val === "string")
          })
          if (isNumeric) numericColumns.add(colIdx)
        }

        const csvLines: string[] = []
        // Header
        csvLines.push(headers.map(escapeCsvValue).join(","))

        // Data rows
        for (const row of rows) {
          csvLines.push(row.map(escapeCsvValue).join(","))
        }

        // Summary row
        if (includeSummaryRow && numericColumns.size > 0 && rows.length > 0) {
          const summaryRow: string[] = []
          for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            if (colIdx === 0) {
              summaryRow.push("TOTAL / SUMMARY")
            } else if (numericColumns.has(colIdx)) {
              const sum = rows.reduce((acc, r) => {
                const val = Number(r[colIdx])
                return acc + (isNaN(val) ? 0 : val)
              }, 0)
              summaryRow.push(sum.toFixed(2))
            } else {
              summaryRow.push("")
            }
          }
          csvLines.push(summaryRow.map(escapeCsvValue).join(","))
        }

        const csvContent = csvLines.join("\n")

        const delivered = await dispatchTelegramCsv(
          principal,
          channel,
          cleanFilename,
          csvContent,
          `📊 Generated spreadsheet: ${cleanFilename} (${rows.length} rows)`
        )

        return {
          ok: true as const,
          filename: cleanFilename,
          rowCount: rows.length,
          columnCount: headers.length,
          deliveredToTelegram: delivered,
          csvContent,
          preview: csvLines.slice(0, 15).join("\n"),
          message: delivered
            ? `Successfully generated and sent "${cleanFilename}" as an attachment in this chat.`
            : `Generated spreadsheet "${cleanFilename}" with ${rows.length} rows and ${headers.length} columns.`,
        }
      },
    }),

    exportReportToCsv: defineTool({
      description:
        "Extract live ERP business data into a downloadable CSV spreadsheet. Supports: 'sales_orders', 'invoices', 'inventory', 'customers', 'suppliers', 'leads', 'batches', and 'delivery_routes'.",
      inputSchema: z.object({
        dataset: z.enum([
          "sales_orders", "invoices", "inventory",
          "customers", "suppliers", "leads", "batches", "delivery_routes",
        ]).describe("The ERP dataset to export"),
        limit: z.number().optional().default(100).describe("Max records to export (default 100)"),
      }),
      execute: async ({ dataset, limit }) => {
        let headers: string[] = []
        let rows: Array<Array<string | number>> = []
        const nowStr = new Date().toISOString().split("T")[0]

        switch (dataset) {
          case "sales_orders": {
            headers = ["Order Number", "Date", "Customer", "Status", "Items", "Subtotal", "GST", "Total Amount"]
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
            headers = ["Invoice Number", "Date", "Due Date", "Customer", "Status", "Total Amount", "Paid Amount", "Outstanding"]
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
            headers = ["SKU", "Product Name", "Category", "Quantity on Hand", "Unit", "Cost Price", "Sell Price", "Total Valuation"]
            const inventory = await db.inventory.findMany({
              take: limit,
              orderBy: { product: { name: "asc" } },
              // `category` is a relation, not a column, so it has to be
              // included to be read.
              include: { product: { include: { category: true } } },
            })
            rows = inventory.map((inv) => [
              inv.product.sku,
              inv.product.name,
              inv.product.category?.name || "General",
              inv.quantity,
              // The unit column is `baseUnit`; the sell price is
              // `wholesalePrice`. There is no `unit` or `basePrice`.
              inv.product.baseUnit || "unit",
              money(inv.product.costPrice || 0),
              money(inv.product.wholesalePrice),
              money(inv.quantity * (inv.product.costPrice || inv.product.wholesalePrice)),
            ])
            break
          }
          case "customers": {
            headers = ["Business Name", "Contact", "Phone", "Email", "Payment Terms", "Credit Limit", "Status"]
            const customers = await db.customer.findMany({
              take: limit,
              orderBy: { name: "asc" },
            })
            rows = customers.map((c) => [
              c.name,
              c.contactPerson || "N/A",
              c.phone || "N/A",
              c.email || "N/A",
              `${c.paymentTerms || 30} days`,
              money(c.creditLimit || 0),
              c.status,
            ])
            break
          }
          case "suppliers": {
            headers = ["Supplier Name", "ABN", "Contact Person", "Phone", "Email", "Payment Terms", "Status"]
            const suppliers = await db.supplier.findMany({
              take: limit,
              orderBy: { name: "asc" },
            })
            rows = suppliers.map((s) => [
              s.name,
              // Supplier has no code; the ABN is the identifier it carries.
              // Lead time is per product-supplier link, not per supplier.
              s.abn || "N/A",
              s.contactPerson || "N/A",
              s.phone || "N/A",
              s.email || "N/A",
              `${s.paymentTerms || 30} days`,
              s.status,
            ])
            break
          }
          case "leads": {
            headers = ["Business Name", "Contact", "Email", "Phone", "Status", "Estimated Monthly Value", "Source", "Created Date"]
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
            headers = ["Batch Code", "Product Name", "SKU", "On Hand", "Reserved", "Expiry Date", "Supplier", "Status"]
            const batches = await db.inventoryBatch.findMany({
              take: limit,
              orderBy: { expiryDate: "asc" },
            })

            // InventoryBatch carries productId and supplierId but has no
            // relation to either, so the names are resolved in two queries
            // rather than joined per row.
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

            const productById = new Map(batchProducts.map((x) => [x.id, x]))
            const supplierById = new Map(batchSuppliers.map((x) => [x.id, x]))

            rows = batches.map((b) => [
              // The column is batchCode, the quantity is `quantity`, and
              // quarantine is a value of `status`, not a boolean.
              b.batchCode,
              productById.get(b.productId)?.name || "N/A",
              productById.get(b.productId)?.sku || "N/A",
              b.quantity,
              b.reserved,
              b.expiryDate ? b.expiryDate.toISOString().split("T")[0] : "N/A",
              (b.supplierId && supplierById.get(b.supplierId)?.name) || "N/A",
              b.status === "quarantined" ? "QUARANTINED" : b.status,
            ])
            break
          }
          case "delivery_routes": {
            headers = ["Route Number", "Route Name", "Date", "Driver", "Vehicle", "Total Deliveries", "Status"]
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

        const csvLines = [headers.map(escapeCsvValue).join(",")]
        for (const row of rows) {
          csvLines.push(row.map(escapeCsvValue).join(","))
        }
        const csvContent = csvLines.join("\n")
        const filename = `${dataset}_export_${nowStr}.csv`

        const delivered = await dispatchTelegramCsv(
          principal,
          channel,
          filename,
          csvContent,
          `📊 Exported ${rows.length} ${dataset.replace(/_/g, " ")} records (${filename})`
        )

        return {
          ok: true as const,
          dataset,
          filename,
          recordCount: rows.length,
          deliveredToTelegram: delivered,
          csvContent,
          preview: csvLines.slice(0, 10).join("\n"),
          message: delivered
            ? `Successfully exported and sent "${filename}" as an attachment in this chat.`
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
