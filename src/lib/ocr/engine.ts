import { generateText } from "ai"
import { db } from "@/lib/db"
import { resolveAgentModel } from "@/lib/agent/model"

export interface ExtractedLineItem {
  description: string
  sku?: string | null
  quantity: number
  unitPrice: number
  taxRate?: number
  lineTotal: number
  matchedProductId?: string | null
  matchedProductName?: string | null
}

export interface ExtractedDocument {
  documentType: "supplier_invoice" | "delivery_docket" | "bill_of_lading" | "receipt" | "purchase_order" | "other"
  confidenceScore: number
  vendorName: string | null
  vendorAbn: string | null
  vendorAddress: string | null
  vendorPhone: string | null
  vendorEmail: string | null
  documentNumber: string | null
  documentDate: string | null
  dueDate: string | null
  currency: string
  subtotal: number | null
  taxAmount: number | null
  totalAmount: number | null
  paymentTerms: string | null
  items: ExtractedLineItem[]
  matchedSupplierId?: string | null
  matchedSupplierName?: string | null
  matchedPurchaseOrderId?: string | null
  matchedPurchaseOrderNumber?: string | null
  rawNotes?: string | null
}

const OCR_SYSTEM_PROMPT = `You are an expert OCR and Document Intelligence system for SupplySure OS, an Australian B2B food distribution enterprise ERP.
Analyze the provided document (invoice, delivery docket, bill of lading, receipt, or purchase order) and extract all structured data with extreme precision.

Return ONLY a valid JSON object matching this schema (do NOT wrap in markdown code blocks or backticks, return pure JSON):
{
  "documentType": "supplier_invoice" | "delivery_docket" | "bill_of_lading" | "receipt" | "purchase_order" | "other",
  "confidenceScore": number between 0 and 1,
  "vendorName": string or null,
  "vendorAbn": string or null,
  "vendorAddress": string or null,
  "vendorPhone": string or null,
  "vendorEmail": string or null,
  "documentNumber": string or null (e.g. Invoice #, Docket #, BOL #),
  "documentDate": "YYYY-MM-DD" or null,
  "dueDate": "YYYY-MM-DD" or null,
  "currency": "AUD" or detected currency,
  "subtotal": number or null,
  "taxAmount": number or null (GST in Australia is usually 10%),
  "totalAmount": number or null,
  "paymentTerms": string or null (e.g. "Net 30", "7 Days", "COD"),
  "items": [
    {
      "description": string,
      "sku": string or null,
      "quantity": number,
      "unitPrice": number,
      "taxRate": number (e.g. 10 or 0),
      "lineTotal": number
    }
  ],
  "rawNotes": string or null
}

Rules:
- Amounts must be numbers (e.g. 145.50 not "$145.50").
- If line items are visible, extract every row with item description, quantity, unit price, and total.
- If quantities or prices are missing from handwritten notes, make reasonable best-effort estimates based on legible characters.
- Detect Australian ABNs (11 digits) if present.
- Strictly output valid JSON only.`

export async function processDocumentOcr(input: {
  imageUrl?: string
  imageBase64?: string
  mimeType?: string
  rawText?: string
  modelOverride?: string
}): Promise<ExtractedDocument> {
  const model = resolveAgentModel({
    model: input.modelOverride,
    purpose: "ocr",
    tier: "chat",
  })

  let promptContent: any

  if (input.imageBase64) {
    const mime = input.mimeType || "image/jpeg"
    // Normalize data URI if prefix is included
    const base64Data = input.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "")
    promptContent = [
      { type: "text", text: "Extract all structured data from this document image." },
      { type: "image", image: `data:${mime};base64,${base64Data}` },
    ]
  } else if (input.imageUrl) {
    promptContent = [
      { type: "text", text: "Extract all structured data from this document." },
      { type: "image", image: new URL(input.imageUrl) },
    ]
  } else if (input.rawText) {
    promptContent = `Extract structured document data from this OCR text:\n\n${input.rawText}`
  } else {
    throw new Error("Either imageUrl, imageBase64, or rawText must be provided for OCR.")
  }

  const result = await generateText({
    model,
    system: OCR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: promptContent,
      },
    ],
    maxOutputTokens: 2500,
  })

  const rawJson = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  let parsed: ExtractedDocument

  try {
    parsed = JSON.parse(rawJson)
  } catch (error) {
    // Fallback parser if output contains wrapping commentary
    const jsonMatch = rawJson.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0])
    } else {
      throw new Error(`Failed to parse OCR response as JSON: ${result.text.slice(0, 200)}...`)
    }
  }

  // Cross-reference with SupplySure database to match suppliers & products
  try {
    if (parsed.vendorName) {
      const vendorClean = parsed.vendorName.trim()
      const supplier = await db.supplier.findFirst({
        where: {
          OR: [
            { name: { contains: vendorClean, mode: "insensitive" } },
            { tradingName: { contains: vendorClean, mode: "insensitive" } },
            ...(parsed.vendorAbn ? [{ abn: { contains: parsed.vendorAbn } }] : []),
          ],
        },
      })

      if (supplier) {
        parsed.matchedSupplierId = supplier.id
        parsed.matchedSupplierName = supplier.name
      }
    }

    if (parsed.documentNumber) {
      const docNumClean = parsed.documentNumber.trim()
      const po = await db.purchaseOrder.findFirst({
        where: {
          poNumber: { contains: docNumClean, mode: "insensitive" },
        },
      })

      if (po) {
        parsed.matchedPurchaseOrderId = po.id
        parsed.matchedPurchaseOrderNumber = po.poNumber
      }
    }

    // Match line items to products
    if (Array.isArray(parsed.items) && parsed.items.length > 0) {
      const allProducts = await db.product.findMany({
        where: { status: "active" },
        select: { id: true, name: true, sku: true },
      })

      for (const item of parsed.items) {
        if (!item.description && !item.sku) continue

        const match = allProducts.find((p) => {
          const nameMatch = item.description && (
            p.name.toLowerCase().includes(item.description.toLowerCase()) ||
            item.description.toLowerCase().includes(p.name.toLowerCase())
          )
          const skuMatch = item.sku && p.sku.toLowerCase() === item.sku.toLowerCase()
          return nameMatch || skuMatch
        })

        if (match) {
          item.matchedProductId = match.id
          item.matchedProductName = match.name
          if (!item.sku) item.sku = match.sku
        }
      }
    }
  } catch (dbError) {
    console.warn("OCR database matching warning:", dbError)
  }

  return parsed
}
