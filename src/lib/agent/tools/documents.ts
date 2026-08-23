import { z } from "zod"

import { db } from "@/lib/db"
import {
  renderInvoicePdfBuffer,
  renderSalesOrderPdfBuffer,
  renderCustomerStatementPdfBuffer,
  renderCustomReportPdfBuffer,
} from "@/lib/documents/render-pdf"
import { sendTelegramDocument, sendUploadDocumentAction } from "../channels/telegram"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Document and PDF Generation Suite.
 *
 * Hermes-grade document engine: Generate pixel-perfect Invoices, Orders,
 * Customer Statements, and arbitrary Custom Report PDFs (Suppliers, Inventory,
 * Logistics, Analytics) with direct chat & Telegram attachment dispatch.
 */

async function dispatchTelegramPdf(
  principal: AgentPrincipal,
  channel: string | undefined,
  pdfResult: { buffer: Buffer; fileName: string },
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
      pdfResult.buffer,
      pdfResult.fileName,
      caption || `📄 Attached: ${pdfResult.fileName}`
    )
  }
  return false
}

export function buildDocumentTools(principal: AgentPrincipal, channel?: string) {
  return {
    sendDocument: defineTool({
      description:
        "Generate and send a professional PDF document directly into this chat/Telegram channel. Supports Invoices, Sales Orders, Customer Statements, Supplier Directories, Inventory Reports, and Delivery Runsheets.",
      inputSchema: z.object({
        documentType: z
          .enum(["invoice", "order", "statement", "suppliers", "inventory", "customers", "routes", "batches"])
          .describe("Type of document or report to generate"),
        reference: z
          .string()
          .optional()
          .describe("For invoice/order/statement: invoice number, sales order number, or customer name. For reports: optional title or filter query."),
        caption: z.string().optional().describe("Optional message caption to accompany the document"),
      }),
      execute: async ({ documentType, reference, caption }) => {
        let pdfResult: { buffer: Buffer; fileName: string } | null = null

        if (documentType === "invoice") {
          const ref = reference || ""
          pdfResult = await renderInvoicePdfBuffer(ref)
          if (!pdfResult) {
            const order = await db.salesOrder.findFirst({
              where: { OR: [{ id: ref }, { orderNumber: ref }] },
              include: { invoice: true },
            })
            if (order?.invoice) {
              pdfResult = await renderInvoicePdfBuffer(order.invoice.id)
            } else if (order) {
              pdfResult = await renderSalesOrderPdfBuffer(order.id)
            }
          }
        } else if (documentType === "order") {
          pdfResult = await renderSalesOrderPdfBuffer(reference || "")
        } else if (documentType === "statement") {
          pdfResult = await renderCustomerStatementPdfBuffer(reference || "")
        } else if (documentType === "suppliers") {
          const suppliers = await db.supplier.findMany({
            orderBy: { name: "asc" },
            take: 50,
          })
          const headers = ["Supplier Name", "ABN", "Contact Person", "Phone", "Email", "Payment Terms"]
          const rows = suppliers.map((s) => [
            s.name,
            // Supplier has no code; the ABN is the identifier it carries.
            s.abn || "N/A",
            s.contactPerson || "N/A",
            s.phone || "N/A",
            s.email || "N/A",
            // Lead time is per product-supplier link, not per supplier.
            `${s.paymentTerms || 30} days`,
          ])
          pdfResult = await renderCustomReportPdfBuffer({
            title: "Wholesale Supplier Directory",
            subtitle: `Active Vendors List • Total: ${suppliers.length}`,
            headers,
            rows,
            summaryCards: [
              { label: "Total Suppliers", value: suppliers.length },
              { label: "Standard Terms", value: "30 Days Net" },
            ],
            fileName: "supplier_directory.pdf",
          })
        } else if (documentType === "inventory") {
          const inventory = await db.inventory.findMany({
            take: 50,
            orderBy: { product: { name: "asc" } },
            // `category` is a relation, not a column.
            include: { product: { include: { category: true } } },
          })
          const headers = ["SKU", "Product Name", "Category", "Quantity on Hand", "Unit", "Cost Price", "Sell Price"]
          const rows = inventory.map((inv) => [
            inv.product.sku,
            inv.product.name,
            inv.product.category?.name || "General",
            inv.quantity,
            // The unit column is `baseUnit`; the sell price is `wholesalePrice`.
            inv.product.baseUnit || "unit",
            `$${money(inv.product.costPrice || 0)}`,
            `$${money(inv.product.wholesalePrice)}`,
          ])
          const totalUnits = inventory.reduce((sum, i) => sum + i.quantity, 0)
          pdfResult = await renderCustomReportPdfBuffer({
            title: "Warehouse Inventory Valuation Report",
            subtitle: `Stock on Hand Summary • ${inventory.length} SKUs`,
            headers,
            rows,
            summaryCards: [
              { label: "Tracked SKUs", value: inventory.length },
              { label: "Total Units on Hand", value: totalUnits },
            ],
            fileName: "inventory_report.pdf",
          })
        } else if (documentType === "customers") {
          const customers = await db.customer.findMany({
            take: 50,
            orderBy: { name: "asc" },
          })
          const headers = ["Business Name", "Contact", "Phone", "Email", "Payment Terms", "Status"]
          const rows = customers.map((c) => [
            c.name,
            c.contactPerson || "N/A",
            c.phone || "N/A",
            c.email || "N/A",
            `${c.paymentTerms || 30} days`,
            c.status,
          ])
          pdfResult = await renderCustomReportPdfBuffer({
            title: "Customer Trade Accounts Register",
            subtitle: `Active Wholesale Clients • Total: ${customers.length}`,
            headers,
            rows,
            summaryCards: [
              { label: "Total Accounts", value: customers.length },
              { label: "Trade Terms", value: "Standard Net 30" },
            ],
            fileName: "customer_register.pdf",
          })
        } else if (documentType === "routes") {
          const routes = await db.deliveryRoute.findMany({
            take: 20,
            orderBy: { routeDate: "desc" },
            include: { driver: { select: { name: true } }, deliveries: true },
          })
          const headers = ["Route #", "Route Name", "Date", "Driver", "Vehicle", "Stops", "Status"]
          const rows = routes.map((r) => [
            r.routeNumber,
            r.name,
            r.routeDate.toISOString().split("T")[0],
            r.driver?.name || "Unassigned",
            r.vehicle || "Standard Van",
            r.deliveries.length,
            r.status,
          ])
          pdfResult = await renderCustomReportPdfBuffer({
            title: "Fleet Logistics & Delivery Runsheets",
            subtitle: `Scheduled Distribution Runs`,
            headers,
            rows,
            summaryCards: [
              { label: "Active Routes", value: routes.length },
              { label: "Fleet Status", value: "Operational" },
            ],
            fileName: "delivery_routes.pdf",
          })
        } else if (documentType === "batches") {
          const batches = await db.inventoryBatch.findMany({
            take: 50,
            orderBy: { expiryDate: "asc" },
          })

          // InventoryBatch carries productId and supplierId but has no
          // relation to either, so the names are resolved separately.
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

          const headers = ["Batch Code", "Product Name", "SKU", "On Hand", "Expiry Date", "Supplier", "Status"]
          const rows = batches.map((b) => [
            // The column is batchCode, the quantity is `quantity`, and
            // quarantine is a value of `status`, not a boolean.
            b.batchCode,
            batchProductById.get(b.productId)?.name || "N/A",
            batchProductById.get(b.productId)?.sku || "N/A",
            b.quantity,
            b.expiryDate ? b.expiryDate.toISOString().split("T")[0] : "N/A",
            (b.supplierId && batchSupplierById.get(b.supplierId)?.name) || "N/A",
            b.status === "quarantined" ? "QUARANTINED" : b.status,
          ])
          pdfResult = await renderCustomReportPdfBuffer({
            title: "HACCP Batch Traceability & Expiry Register",
            subtitle: `Food Safety Lot Audit`,
            headers,
            rows,
            summaryCards: [
              { label: "Total Batches", value: batches.length },
              { label: "Compliance Status", value: "HACCP Verified" },
            ],
            fileName: "batch_register.pdf",
          })
        }

        if (!pdfResult) {
          return {
            ok: false as const,
            error: `Could not find or generate ${documentType} for "${reference || ""}". Please check reference or record existence.`,
          }
        }

        const delivered = await dispatchTelegramPdf(principal, channel, pdfResult, caption)

        return {
          ok: true as const,
          fileName: pdfResult.fileName,
          sizeBytes: pdfResult.buffer.length,
          deliveredToTelegram: delivered,
          message: delivered
            ? `Successfully generated and sent "${pdfResult.fileName}" directly as an attachment in this chat.`
            : `Generated PDF document "${pdfResult.fileName}" (${(pdfResult.buffer.length / 1024).toFixed(1)} KB).`,
        }
      },
    }),

    generateReportPdf: defineTool({
      description:
        "Generate and send a custom PDF report for any arbitrary table, custom analysis, or business summary. Renders a publication-quality PDF with company branding and delivers it directly to the chat/Telegram.",
      inputSchema: z.object({
        title: z.string().describe("Main title of the report (e.g. 'Top 10 High-Margin Products', 'Supplier Audit')"),
        subtitle: z.string().optional().describe("Subtitle or date description"),
        headers: z.array(z.string()).describe("Column header names"),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
          .describe("Array of table row values matching headers"),
        summaryCards: z.array(z.object({
          label: z.string(),
          value: z.union([z.string(), z.number()]),
        })).optional().describe("Optional key highlight metric badges shown at top"),
        filename: z.string().optional().describe("Filename for the PDF (e.g. 'custom_audit.pdf')"),
      }),
      execute: async ({ title, subtitle, headers, rows, summaryCards, filename }) => {
        const pdfResult = await renderCustomReportPdfBuffer({
          title,
          subtitle,
          headers,
          rows,
          summaryCards,
          fileName: filename || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pdf`,
        })

        const delivered = await dispatchTelegramPdf(
          principal,
          channel,
          pdfResult,
          `📄 ${pdfResult.fileName}`
        )

        return {
          ok: true as const,
          fileName: pdfResult.fileName,
          sizeBytes: pdfResult.buffer.length,
          deliveredToTelegram: delivered,
          message: delivered
            ? `Successfully generated and sent "${pdfResult.fileName}" (${(pdfResult.buffer.length / 1024).toFixed(1)} KB) directly as an attachment in this chat.`
            : `Generated PDF report "${pdfResult.fileName}" (${(pdfResult.buffer.length / 1024).toFixed(1)} KB).`,
        }
      },
    }),

    generateDocumentPdf: defineTool({
      description:
        "Generate a PDF document buffer for an invoice, sales order, or customer statement, confirming validity and size.",
      inputSchema: z.object({
        documentType: z.enum(["invoice", "order", "statement"]),
        reference: z.string().describe("Invoice number, order number, or customer name/ID"),
      }),
      execute: async ({ documentType, reference }) => {
        let pdfResult: { buffer: Buffer; fileName: string } | null = null

        if (documentType === "invoice") {
          pdfResult = await renderInvoicePdfBuffer(reference)
        } else if (documentType === "order") {
          pdfResult = await renderSalesOrderPdfBuffer(reference)
        } else if (documentType === "statement") {
          pdfResult = await renderCustomerStatementPdfBuffer(reference)
        }

        if (!pdfResult) {
          return {
            ok: false as const,
            error: `Could not find or render ${documentType} for "${reference}".`,
          }
        }

        return {
          ok: true as const,
          fileName: pdfResult.fileName,
          sizeBytes: pdfResult.buffer.length,
          sizeKb: (pdfResult.buffer.length / 1024).toFixed(1),
          message: `PDF "${pdfResult.fileName}" generated successfully (${(pdfResult.buffer.length / 1024).toFixed(1)} KB).`,
        }
      },
    }),
  }
}
