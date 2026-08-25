import { z } from "zod"

import { db } from "@/lib/db"
import {
  renderInvoicePdfBuffer,
  renderSalesOrderPdfBuffer,
  renderCustomerStatementPdfBuffer,
  renderCustomReportPdfBuffer,
} from "@/lib/documents/render-pdf"
import { generateDocumentReport } from "@/lib/documents/report-generator"
import { sendTelegramDocument, sendTelegramMessage, sendUploadDocumentAction } from "../channels/telegram"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Document and PDF Generation Suite.
 *
 * Hermes-grade document engine: Generate pixel-perfect Invoices, Orders,
 * Customer Statements, and arbitrary Custom Report PDFs (Leads, Suppliers, Inventory,
 * Logistics, Analytics) with direct chat & Telegram attachment dispatch.
 */

async function dispatchTelegramPdf(
  principal: AgentPrincipal,
  channel: string | undefined,
  pdfResult: { buffer: Buffer; fileName: string },
  caption?: string,
  recipientStaff?: string
): Promise<boolean> {
  let targetChatIds: string[] = []

  // 1. If recipientStaff is specified, find their Telegram ID
  if (recipientStaff) {
    const staffUser = await db.user.findFirst({
      where: {
        OR: [
          { email: { contains: recipientStaff, mode: "insensitive" } },
          { name: { contains: recipientStaff, mode: "insensitive" } },
          { role: { equals: recipientStaff.toLowerCase() } },
        ],
      },
    })
    if (staffUser) {
      const staffIdentity = await db.channelIdentity.findFirst({
        where: { channel: "telegram", userId: staffUser.id, status: "active" },
      })
      if (staffIdentity?.externalId && !staffIdentity.externalId.startsWith("pending:")) {
        targetChatIds.push(staffIdentity.externalId)
      }
    }
  }

  // 2. Also resolve the current caller's Telegram ID
  if (channel === "telegram") {
    let callerChatId: string | null = null
    if (principal.kind === "staff") {
      const channelId = await db.channelIdentity.findFirst({
        where: { channel: "telegram", userId: principal.userId, status: "active" },
        select: { externalId: true },
      })
      callerChatId = channelId?.externalId || null
    } else {
      const channelId = await db.channelIdentity.findFirst({
        where: { channel: "telegram", customerId: principal.customerId, status: "active" },
        select: { externalId: true },
      })
      callerChatId = channelId?.externalId || null
    }
    if (callerChatId && !targetChatIds.includes(callerChatId)) {
      targetChatIds.push(callerChatId)
    }
  }

  if (targetChatIds.length === 0) return false

  let anyDelivered = false
  for (const chatId of targetChatIds) {
    try {
      await sendUploadDocumentAction(chatId)
      const delivered = await sendTelegramDocument(
        chatId,
        pdfResult.buffer,
        pdfResult.fileName,
        caption || `📄 Attached: ${pdfResult.fileName}`
      )
      if (delivered) anyDelivered = true
    } catch (e) {
      console.error(`Failed to dispatch PDF to ${chatId}:`, e)
    }
  }

  return anyDelivered
}

export function buildDocumentTools(principal: AgentPrincipal, channel?: string) {
  return {
    sendDocument: defineTool({
      description:
        "Generate and send a professional PDF document directly into this chat/Telegram channel or to a staff member. Supports Leads, Invoices, Sales Orders, Customer Statements, Supplier Directories, Inventory Reports, and Delivery Runsheets.",
      inputSchema: z.object({
        documentType: z
          .enum(["invoice", "order", "statement", "suppliers", "inventory", "customers", "routes", "batches", "leads"])
          .describe("Type of document or report to generate"),
        reference: z
          .string()
          .optional()
          .describe("For invoice/order/statement: invoice number, sales order number, or customer name. For reports/leads: optional filter (e.g. 'QLD', 'Fine Foods')."),
        caption: z.string().optional().describe("Optional message caption to accompany the document"),
        recipientStaff: z.string().optional().describe("Optional staff member name/role to deliver to directly (e.g. 'Antonio', 'Tony', 'Maria')"),
      }),
      execute: async ({ documentType, reference, caption, recipientStaff }) => {
        const docResult = await generateDocumentReport({
          documentType,
          reference,
          format: "pdf",
        })

        if (!docResult) {
          return {
            ok: false as const,
            error: `Could not find or generate ${documentType} for "${reference || ""}". Please check reference or record existence.`,
          }
        }

        const delivered = await dispatchTelegramPdf(
          principal,
          channel,
          { buffer: docResult.buffer, fileName: docResult.fileName },
          caption,
          recipientStaff
        )

        return {
          ok: true as const,
          fileName: docResult.fileName,
          sizeBytes: docResult.buffer.length,
          deliveredToTelegram: delivered,
          message: delivered
            ? `Successfully generated and sent "${docResult.fileName}" (${(docResult.buffer.length / 1024).toFixed(1)} KB) directly as an attachment.${recipientStaff ? ` (Dispatched to ${recipientStaff})` : ""}`
            : `Generated PDF document "${docResult.fileName}" (${(docResult.buffer.length / 1024).toFixed(1)} KB).`,
        }
      },
    }),

    generateReportPdf: defineTool({
      description:
        "Generate and send a custom PDF report for any arbitrary table, custom analysis, or business summary. Renders a publication-quality PDF with company branding and delivers it directly to the chat/Telegram or a staff member.",
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
        recipientStaff: z.string().optional().describe("Optional staff member name/role to deliver to directly (e.g. 'Antonio', 'Tony', 'Maria')"),
      }),
      execute: async ({ title, subtitle, headers, rows, summaryCards, filename, recipientStaff }) => {
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
          `📄 ${pdfResult.fileName}`,
          recipientStaff
        )

        return {
          ok: true as const,
          fileName: pdfResult.fileName,
          sizeBytes: pdfResult.buffer.length,
          deliveredToTelegram: delivered,
          message: delivered
            ? `Successfully generated and sent "${pdfResult.fileName}" (${(pdfResult.buffer.length / 1024).toFixed(1)} KB) directly as an attachment.${recipientStaff ? ` (Dispatched to ${recipientStaff})` : ""}`
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
