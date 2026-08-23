import { tool } from "ai"
import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { processDocumentOcr } from "@/lib/ocr/engine"

export function buildOcrTools(principal: AgentPrincipal) {
  // Staff members can scan supplier invoices, delivery dockets, BOLs and receipts
  if (principal.kind !== "staff") {
    return {}
  }

  return {
    scanDocument: tool({
      description:
        "Extracts structured data (vendor, invoice/docket number, date, line items, quantities, prices, GST, totals) from an image, PDF or raw text of an invoice, receipt, delivery docket, or bill of lading.",
      inputSchema: z.object({
        imageUrl: z
          .string()
          .optional()
          .describe("Publicly reachable HTTPS URL of the document image or PDF"),
        imageBase64: z
          .string()
          .optional()
          .describe("Base64-encoded image data of the document"),
        mimeType: z
          .string()
          .optional()
          .describe("MIME type of the document (e.g. image/jpeg, image/png, application/pdf)"),
        rawText: z
          .string()
          .optional()
          .describe("Raw text content of the document if already extracted"),
      }),
      execute: async (input) => {
        try {
          const doc = await processDocumentOcr({
            imageUrl: input.imageUrl,
            imageBase64: input.imageBase64,
            mimeType: input.mimeType,
            rawText: input.rawText,
          })

          return {
            ok: true,
            documentType: doc.documentType,
            vendorName: doc.vendorName,
            vendorAbn: doc.vendorAbn,
            documentNumber: doc.documentNumber,
            documentDate: doc.documentDate,
            dueDate: doc.dueDate,
            subtotal: doc.subtotal,
            taxAmount: doc.taxAmount,
            totalAmount: doc.totalAmount,
            itemCount: doc.items.length,
            items: doc.items,
            matchedSupplier: doc.matchedSupplierName || null,
            matchedPurchaseOrder: doc.matchedPurchaseOrderNumber || null,
          }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Failed to scan document",
          }
        }
      },
    }),
  }
}
