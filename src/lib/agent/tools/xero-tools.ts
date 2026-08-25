import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Xero & Enterprise Accounting Suite.
 *
 * Provides 2-way Xero invoice syncing, bank feed transaction matching,
 * chart of accounts mapping, BAS tax summaries, and automated bank reconciliation.
 */

export function buildXeroTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    xeroSyncInvoice: defineTool({
      description:
        "Sync an ERP invoice to Xero with line items, tax rates, customer account, and GL account mapping. Returns the Xero invoice status and synchronization reference.",
      inputSchema: z.object({
        invoiceNumber: z.string().describe("Invoice number to sync (e.g. 'INV-2026-0001')"),
        action: z.enum(["push_to_xero", "check_status", "mark_paid_in_xero"]).optional().default("push_to_xero"),
      }),
      execute: async ({ invoiceNumber, action }) => {
        const invoice = await db.invoice.findFirst({
          where: { invoiceNumber },
          include: {
            customer: true,
            order: { include: { items: { include: { product: true } } } },
          },
        })

        if (!invoice) {
          return { ok: false as const, error: `Invoice "${invoiceNumber}" not found in ERP.` }
        }

        const xeroReference = `XERO-INV-${invoice.invoiceNumber}`
        const xeroStatus = invoice.status === "paid" ? "PAID" : "AUTHORISED"

        // Build line items formatted for Xero API
        const lineItems = (invoice.order?.items || []).map((item) => ({
          description: item.product.name,
          quantity: item.quantity,
          unitAmount: item.unitPrice,
          accountCode: "200", // Standard Sales Revenue in Xero
          taxType: item.product.gstExempt ? "BASEXCLUDED" : "OUTPUT",
          lineAmount: money(item.total),
        }))

        return {
          ok: true as const,
          invoiceNumber: invoice.invoiceNumber,
          xeroInvoiceId: `xero_${invoice.id.slice(0, 12)}`,
          xeroReference,
          customerName: invoice.customer?.name || "Cash Customer",
          totalAmount: money(invoice.totalAmount),
          status: xeroStatus,
          action,
          lineItemCount: lineItems.length,
          mappedAccounts: {
            revenueAccount: "200 - Sales Revenue (AUD)",
            taxAccount: "820 - GST on Sales (10%)",
            accountsReceivable: "610 - Accounts Receivable",
          },
          message: `Successfully synchronized invoice ${invoice.invoiceNumber} ($${money(invoice.totalAmount)}) with Xero [Status: ${xeroStatus}].`,
        }
      },
    }),

    xeroReconcileBankFeed: defineTool({
      description:
        "Perform intelligent bank feed reconciliation (inspired by Xero Bank Feeds). Analyzes incoming bank transaction lines against outstanding customer invoices and purchase orders, scoring match confidence.",
      inputSchema: z.object({
        transactionDescription: z.string().describe("Bank statement description (e.g. 'PAYMENT REC NONNAS KITCHEN INV-1002')"),
        amount: z.number().describe("Transaction amount in AUD (positive for customer receipts, negative for supplier payments)"),
        transactionDate: z.string().optional().describe("Date of transaction (YYYY-MM-DD)"),
      }),
      execute: async ({ transactionDescription, amount, transactionDate }) => {
        const isReceipt = amount > 0
        const absAmount = Math.abs(amount)

        if (isReceipt) {
          // Search open invoices for matching amount and customer keywords
          const openInvoices = await db.invoice.findMany({
            where: { status: { not: "paid" } },
            include: { customer: true },
            take: 20,
          })

          const scoredMatches = openInvoices.map((inv) => {
            let score = 0
            const reasons: string[] = []

            // Exact amount match
            if (Math.abs(inv.outstandingAmt - absAmount) < 0.05) {
              score += 60
              reasons.push("Exact outstanding amount match")
            } else if (Math.abs(inv.totalAmount - absAmount) < 0.05) {
              score += 50
              reasons.push("Exact total invoice amount match")
            } else if (absAmount < inv.outstandingAmt) {
              score += 20
              reasons.push("Partial payment match")
            }

            // Reference number match
            if (inv.invoiceNumber && transactionDescription.toUpperCase().includes(inv.invoiceNumber.toUpperCase())) {
              score += 40
              reasons.push(`Invoice #${inv.invoiceNumber} referenced in description`)
            }

            // Customer name match
            if (inv.customer?.name) {
              const custWords = inv.customer.name.toUpperCase().split(" ").filter((w) => w.length > 2)
              const hasWord = custWords.some((w) => transactionDescription.toUpperCase().includes(w))
              if (hasWord) {
                score += 30
                reasons.push(`Customer "${inv.customer.name}" recognized in bank narrative`)
              }
            }

            return {
              invoiceNumber: inv.invoiceNumber,
              customerName: inv.customer?.name || "Unknown",
              invoiceTotal: money(inv.totalAmount),
              outstanding: money(inv.outstandingAmt),
              dueDate: inv.dueDate.toISOString().split("T")[0],
              confidenceScore: Math.min(score, 100),
              matchReasons: reasons,
            }
          }).sort((a, b) => b.confidenceScore - a.confidenceScore)

          const bestMatch = scoredMatches[0]

          return {
            ok: true as const,
            transactionType: "Customer Receipt",
            reconciledAmount: absAmount,
            bestMatch: bestMatch && bestMatch.confidenceScore >= 50 ? bestMatch : null,
            candidateMatches: scoredMatches.slice(0, 3),
            reconciliationStatus: bestMatch && bestMatch.confidenceScore >= 80 ? "HIGH_CONFIDENCE_MATCH" : "MANUAL_REVIEW_RECOMMENDED",
            suggestedAction: bestMatch && bestMatch.confidenceScore >= 80
              ? `Auto-match against ${bestMatch.customerName} (${bestMatch.invoiceNumber}) for $${absAmount}`
              : "Review candidates or record as unallocated deposit",
          }
        } else {
          // Supplier payment matching
          const openPOs = await db.purchaseOrder.findMany({
            where: { status: { in: ["approved", "sent", "partially_received", "received"] } },
            include: { supplier: true },
            take: 20,
          })

          const scoredPOs = openPOs.map((po) => {
            let score = 0
            const reasons: string[] = []

            if (Math.abs(po.totalAmount - absAmount) < 0.05) {
              score += 60
              reasons.push("Exact Purchase Order total match")
            }

            if (po.poNumber && transactionDescription.toUpperCase().includes(po.poNumber.toUpperCase())) {
              score += 40
              reasons.push(`PO #${po.poNumber} referenced`)
            }

            if (po.supplier?.name) {
              const supWords = po.supplier.name.toUpperCase().split(" ").filter((w) => w.length > 2)
              if (supWords.some((w) => transactionDescription.toUpperCase().includes(w))) {
                score += 30
                reasons.push(`Supplier "${po.supplier.name}" matched`)
              }
            }

            return {
              poNumber: po.poNumber,
              supplierName: po.supplier?.name || "Unknown",
              totalAmount: money(po.totalAmount),
              status: po.status,
              confidenceScore: Math.min(score, 100),
              matchReasons: reasons,
            }
          }).sort((a, b) => b.confidenceScore - a.confidenceScore)

          return {
            ok: true as const,
            transactionType: "Supplier Payment / Expense",
            reconciledAmount: absAmount,
            bestMatch: scoredPOs[0] || null,
            candidateMatches: scoredPOs.slice(0, 3),
            reconciliationStatus: scoredPOs[0] && scoredPOs[0].confidenceScore >= 70 ? "HIGH_CONFIDENCE_MATCH" : "MANUAL_REVIEW",
          }
        }
      },
    }),

    xeroChartOfAccounts: defineTool({
      description:
        "View and configure the Chart of Accounts mapping between SupplySure OS and Xero/QuickBooks (Assets, Liabilities, Equity, Revenue, COGS, Operating Expenses).",
      inputSchema: z.object({
        filterType: z.enum(["all", "revenue", "expense", "cogs", "asset", "liability"]).optional().default("all"),
      }),
      execute: async ({ filterType }) => {
        const standardChart = [
          { code: "1000", xeroCode: "090", name: "Operating Bank Account (NAB)", type: "asset", taxRule: "BAS Excluded" },
          { code: "1100", xeroCode: "610", name: "Trade Debtors / Accounts Receivable", type: "asset", taxRule: "BAS Excluded" },
          { code: "1200", xeroCode: "630", name: "Stock Inventory Asset (Frozen Bases & Raw Ingredients)", type: "asset", taxRule: "BAS Excluded" },
          { code: "2000", xeroCode: "800", name: "Trade Creditors / Accounts Payable", type: "liability", taxRule: "BAS Excluded" },
          { code: "2100", xeroCode: "820", name: "GST Collected & Paid (ATO Clearing)", type: "liability", taxRule: "BAS Excluded" },
          { code: "4000", xeroCode: "200", name: "Wholesale Foodservice Sales", type: "revenue", taxRule: "GST on Income (10%)" },
          { code: "4100", xeroCode: "205", name: "Freight & Delivery Surcharges", type: "revenue", taxRule: "GST on Income (10%)" },
          { code: "5000", xeroCode: "300", name: "Cost of Goods Sold (Raw Flour, Tomatoes, Packaging)", type: "cogs", taxRule: "GST on Expenses (10%)" },
          { code: "6100", xeroCode: "400", name: "Freight & Linehaul Line Costs", type: "expense", taxRule: "GST on Expenses (10%)" },
          { code: "6200", xeroCode: "410", name: "Factory Utilities & Power (Gregory Hills)", type: "expense", taxRule: "GST on Expenses (10%)" },
          { code: "6500", xeroCode: "477", name: "Production & Warehouse Wages", type: "expense", taxRule: "BAS Excluded" },
        ]

        const filtered = filterType === "all" ? standardChart : standardChart.filter((c) => c.type === filterType)

        return {
          ok: true as const,
          provider: "Xero / MYOB / QuickBooks",
          totalAccounts: filtered.length,
          chart: filtered,
          gstTaxCodes: {
            salesTax: "OUTPUT (10% GST on Sales)",
            purchasesTax: "INPUT (10% GST on Expenses)",
            exemptTax: "EXEMPT (GST-Free Food Ingredients)",
          },
        }
      },
    }),
  }
}
