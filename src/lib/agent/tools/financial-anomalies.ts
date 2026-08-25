import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money, safeDb } from "./shared"
import {
  detectDuplicatePayments,
  detectInvoiceAnomalies,
  detectPricingDrift,
  detectReconciliationAnomalies,
  type RawInvoiceData,
  type RawPaymentData,
  type RawLinePriceData,
  type RawReconciliationItem,
} from "@/lib/financial-anomalies"

/**
 * AI Financial Anomaly Detection, Duplicate Auditing & Pricing Drift Tools.
 *
 * Scans invoices for duplicates/outliers, detects duplicate customer payments,
 * identifies contract pricing drift on sales order lines, and audits reconciliation gaps.
 */

export function buildFinancialAnomalyTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    scanInvoiceAnomalies: defineTool({
      description:
        "Scan invoices for financial anomalies: potential duplicates within 72 hours, invalid due dates, tax rate mismatches, overpayments, and statistical outliers.",
      inputSchema: z.object({
        dateFrom: z.string().optional().describe("ISO date string start (defaults to 60 days ago)"),
        dateTo: z.string().optional().describe("ISO date string end"),
        customerId: z.string().optional().describe("Optional customer ID filter"),
        limit: z.number().int().min(1).max(100).optional().default(50),
      }),
      execute: async ({ dateFrom, dateTo, customerId, limit = 50 }) =>
        safeDb(async () => {
          const from = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 60 * 86400000)
          const to = dateTo ? new Date(dateTo) : new Date()

          const invoices = await db.invoice.findMany({
            where: {
              createdAt: { gte: from, lte: to },
              ...(customerId ? { customerId } : {}),
            },
            take: 200,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              invoiceNumber: true,
              customerId: true,
              customer: { select: { id: true, name: true } },
              invoiceDate: true,
              dueDate: true,
              subtotal: true,
              taxAmount: true,
              totalAmount: true,
              paidAmount: true,
              outstandingAmt: true,
              status: true,
            },
          })

          const rawInvoices: RawInvoiceData[] = invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            customerId: inv.customerId,
            customerName: inv.customer?.name,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            subtotal: inv.subtotal,
            taxAmount: inv.taxAmount,
            totalAmount: inv.totalAmount,
            paidAmount: inv.paidAmount,
            outstandingAmt: inv.outstandingAmt,
            status: inv.status,
          }))

          // Calculate customer historical stats for statistical outlier detection
          const customerStats = new Map<string, { mean: number; stdDev: number }>()
          const customerTotals = new Map<string, number[]>()

          for (const inv of rawInvoices) {
            const list = customerTotals.get(inv.customerId) || []
            list.push(inv.totalAmount)
            customerTotals.set(inv.customerId, list)
          }

          for (const [cId, amounts] of customerTotals.entries()) {
            if (amounts.length >= 3) {
              const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length
              const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length
              customerStats.set(cId, { mean, stdDev: Math.sqrt(variance) })
            }
          }

          const allAnomalies = detectInvoiceAnomalies(rawInvoices, customerStats)
          const finalAnomalies = allAnomalies.slice(0, limit)

          const highCount = allAnomalies.filter((a) => a.severity === "HIGH").length
          const mediumCount = allAnomalies.filter((a) => a.severity === "MEDIUM").length
          const lowCount = allAnomalies.filter((a) => a.severity === "LOW").length

          return {
            totalInvoicesScanned: rawInvoices.length,
            anomaliesDetected: allAnomalies.length,
            highSeverityCount: highCount,
            mediumSeverityCount: mediumCount,
            lowSeverityCount: lowCount,
            anomalies: finalAnomalies,
            recommendation:
              highCount > 0
                ? `CRITICAL: ${highCount} high-severity financial anomalies require immediate attention (duplicate invoices or overpayments).`
                : allAnomalies.length > 0
                ? `Found ${allAnomalies.length} potential anomalies to review.`
                : "No invoice anomalies detected in the scanned period.",
          }
        }),
    }),

    detectDuplicatePayments: defineTool({
      description:
        "Scan recent customer payments to identify exact duplicate transactions, repeated charges, or overpayments on invoices.",
      inputSchema: z.object({
        lookbackDays: z.number().int().min(7).max(180).optional().default(60),
        customerId: z.string().optional().describe("Optional customer ID filter"),
      }),
      execute: async ({ lookbackDays = 60, customerId }) =>
        safeDb(async () => {
          const since = new Date(Date.now() - lookbackDays * 86400000)

          const payments = await db.payment.findMany({
            where: {
              paidAt: { gte: since },
              ...(customerId ? { customerId } : {}),
            },
            take: 200,
            orderBy: { paidAt: "desc" },
            select: {
              id: true,
              invoiceId: true,
              invoice: { select: { invoiceNumber: true } },
              customerId: true,
              customer: { select: { name: true } },
              amount: true,
              method: true,
              reference: true,
              paidAt: true,
            },
          })

          const rawPayments: RawPaymentData[] = payments.map((p) => ({
            id: p.id,
            invoiceId: p.invoiceId,
            invoiceNumber: p.invoice?.invoiceNumber,
            customerId: p.customerId,
            customerName: p.customer?.name,
            amount: Number(p.amount),
            method: p.method,
            reference: p.reference,
            paidAt: p.paidAt,
          }))

          const duplicateAnomalies = detectDuplicatePayments(rawPayments)

          return {
            paymentsScanned: rawPayments.length,
            duplicateGroupsCount: duplicateAnomalies.length,
            totalDisputedAmount: money(duplicateAnomalies.reduce((sum, d) => sum + d.totalAmount, 0)),
            duplicates: duplicateAnomalies,
          }
        }),
    }),

    pricingDriftReport: defineTool({
      description:
        "Audit line items on recent sales orders against customer price lists to detect undercharging or unauthorized price discounts.",
      inputSchema: z.object({
        customerId: z.string().optional().describe("Optional customer ID"),
        lookbackDays: z.number().int().min(7).max(90).optional().default(30),
        thresholdPercent: z.number().min(1).max(50).optional().default(5.0).describe("Variance percentage threshold to flag"),
        limit: z.number().int().min(1).max(100).optional().default(30),
      }),
      execute: async ({ customerId, lookbackDays = 30, thresholdPercent = 5.0, limit = 30 }) =>
        safeDb(async () => {
          const since = new Date(Date.now() - lookbackDays * 86400000)

          const items = await db.salesOrderItem.findMany({
            where: {
              order: {
                createdAt: { gte: since },
                status: { notIn: ["cancelled", "draft"] },
                ...(customerId ? { customerId } : {}),
              },
            },
            take: 250,
            select: {
              id: true,
              unitPrice: true,
              quantity: true,
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  createdAt: true,
                  customerId: true,
                  customer: {
                    select: {
                      id: true,
                      name: true,
                      priceListId: true,
                      priceList: {
                        select: {
                          items: {
                            select: {
                              productId: true,
                              price: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  wholesalePrice: true,
                },
              },
            },
          })

          const rawLines: RawLinePriceData[] = items.map((item) => {
            const customer = item.order.customer
            const priceListItem = customer?.priceList?.items?.find((p) => p.productId === item.product.id)
            const expectedContractPrice = priceListItem?.price ?? item.product.wholesalePrice

            return {
              lineId: item.id,
              orderId: item.order.id,
              orderNumber: item.order.orderNumber,
              customerId: customer?.id || item.order.customerId,
              customerName: customer?.name,
              productId: item.product.id,
              productName: item.product.name,
              sku: item.product.sku,
              quantity: item.quantity,
              invoicedUnitPrice: item.unitPrice,
              expectedContractPrice,
              priceSource: priceListItem ? "contractPriceList" : "wholesaleCatalog",
              orderDate: item.order.createdAt,
            }
          })

          const driftAnomalies = detectPricingDrift(rawLines, thresholdPercent)
          const undercharged = driftAnomalies.filter((d) => d.driftType === "UNDERCHARGED")
          const totalRevenueLoss = Math.abs(undercharged.reduce((sum, d) => sum + d.varianceTotal, 0))

          return {
            linesScanned: rawLines.length,
            driftAnomaliesCount: driftAnomalies.length,
            underchargedLinesCount: undercharged.length,
            estimatedRevenueLoss: money(totalRevenueLoss),
            items: driftAnomalies.slice(0, limit),
          }
        }),
    }),

    reconciliationAnomalyCheck: defineTool({
      description:
        "Check bank transactions, active credit notes, and draft journal entries for aged unmatched items and reconciliation gaps.",
      inputSchema: z.object({
        periodDays: z.number().int().min(14).max(180).optional().default(60),
      }),
      execute: async ({ periodDays = 60 }) =>
        safeDb(async () => {
          const since = new Date(Date.now() - periodDays * 86400000)

          const [bankTxs, creditNotes, draftJournals] = await Promise.all([
            db.bankTransaction.findMany({
              where: {
                transactionDate: { gte: since },
                status: "unmatched",
              },
              take: 50,
              select: {
                id: true,
                amount: true,
                transactionDate: true,
                status: true,
                description: true,
                reference: true,
              },
            }),
            db.creditNote.findMany({
              where: {
                createdAt: { gte: since },
                status: "active",
              },
              take: 50,
              select: {
                id: true,
                amount: true,
                createdAt: true,
                status: true,
                cnNumber: true,
                reason: true,
              },
            }),
            db.journalEntry.findMany({
              where: {
                date: { gte: since },
                status: "draft",
              },
              take: 50,
              select: {
                id: true,
                totalDebit: true,
                date: true,
                status: true,
                entryNumber: true,
                description: true,
              },
            }),
          ])

          const rawItems: RawReconciliationItem[] = [
            ...bankTxs.map((b) => ({
              id: b.id,
              type: "BANK_TX" as const,
              amount: Number(b.amount),
              date: b.transactionDate,
              status: b.status,
              description: b.description || b.reference || "Bank transaction",
              reference: b.reference,
            })),
            ...creditNotes.map((c) => ({
              id: c.id,
              type: "CREDIT_NOTE" as const,
              amount: Number(c.amount),
              date: c.createdAt,
              status: c.status,
              description: `Credit Note ${c.cnNumber}: ${c.reason}`,
              reference: c.cnNumber,
            })),
            ...draftJournals.map((j) => ({
              id: j.id,
              type: "JOURNAL_ENTRY" as const,
              amount: j.totalDebit,
              date: j.date,
              status: j.status,
              description: `Journal ${j.entryNumber}: ${j.description}`,
              reference: j.entryNumber,
            })),
          ]

          const anomalies = detectReconciliationAnomalies(rawItems)

          return {
            itemsAudited: rawItems.length,
            anomaliesCount: anomalies.length,
            unmatchedBankTransactions: bankTxs.length,
            activeCreditNotes: creditNotes.length,
            draftJournalEntries: draftJournals.length,
            anomalies,
          }
        }),
    }),
  }
}
