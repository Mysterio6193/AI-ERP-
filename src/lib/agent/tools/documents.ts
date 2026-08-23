import { z } from "zod"

import { db } from "@/lib/db"
import {
  renderInvoicePdfBuffer,
  renderSalesOrderPdfBuffer,
  renderCustomerStatementPdfBuffer,
} from "@/lib/documents/render-pdf"
import { sendTelegramDocument, sendUploadDocumentAction } from "../channels/telegram"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/** Document and PDF generation tools. */

export function buildDocumentTools(principal: AgentPrincipal, channel?: string) {
  return {
    sendDocument: defineTool({
      description:
        "Generate and send a PDF document (Tax Invoice, Sales Order confirmation, or Customer Statement) directly to the user in this chat/channel.",
      inputSchema: z.object({
        documentType: z
          .enum(["invoice", "order", "statement"])
          .describe("Type of document: invoice (tax invoice), order (order confirmation), statement (customer account statement)"),
        reference: z
          .string()
          .describe("The invoice number (e.g. INV-2024-1001), sales order number (e.g. SO-2024-1008), or customer name/ID"),
        caption: z.string().optional().describe("Optional message caption to accompany the document"),
      }),
      execute: async ({ documentType, reference, caption }) => {
        let pdfResult: { buffer: Buffer; fileName: string } | null = null

        if (documentType === "invoice") {
          pdfResult = await renderInvoicePdfBuffer(reference)
          // If invoice does not exist by that number, check if reference is an order with an invoice
          if (!pdfResult) {
            const order = await db.salesOrder.findFirst({
              where: { OR: [{ id: reference }, { orderNumber: reference }] },
              include: { invoice: true },
            })
            if (order?.invoice) {
              pdfResult = await renderInvoicePdfBuffer(order.invoice.id)
            } else if (order) {
              // Fallback to generating order confirmation if invoice not raised yet
              pdfResult = await renderSalesOrderPdfBuffer(order.id)
            }
          }
        } else if (documentType === "order") {
          pdfResult = await renderSalesOrderPdfBuffer(reference)
        } else if (documentType === "statement") {
          pdfResult = await renderCustomerStatementPdfBuffer(reference)
        }

        if (!pdfResult) {
          return {
            ok: false as const,
            error: `Could not find or generate ${documentType} for "${reference}". Please verify the reference number or customer name.`,
          }
        }

        // If in Telegram channel, find recipient Telegram chatId and dispatch document
        if (channel === "telegram") {
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
            const sent = await sendTelegramDocument(
              targetChatId,
              pdfResult.buffer,
              pdfResult.fileName,
              caption || `Attached: ${pdfResult.fileName}`
            )
            if (sent) {
              return {
                ok: true as const,
                fileName: pdfResult.fileName,
                delivered: true,
                message: `Successfully generated and sent "${pdfResult.fileName}" directly to this chat.`,
              }
            }
          }
        }

        return {
          ok: true as const,
          fileName: pdfResult.fileName,
          sizeBytes: pdfResult.buffer.length,
          delivered: false,
          message: `Generated PDF document "${pdfResult.fileName}" (${(pdfResult.buffer.length / 1024).toFixed(1)} KB).`,
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
