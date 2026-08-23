import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Enterprise Financial Analytics, Cashflow Forecasting & Business Intelligence.
 *
 * Hermes-grade analytical engine for dynamic financial statements, RFM segmentation,
 * cashflow projections, and tax/GST summaries.
 */

export function buildAnalyticsTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    cashflowForecast: defineTool({
      description:
        "Generate a 30/60/90-day cashflow forecast. Projects expected cash inflows from outstanding receivables and outflows from supplier purchase orders.",
      inputSchema: z.object({
        daysAhead: z.number().optional().default(30).describe("Forecast horizon: 30, 60, or 90 days"),
      }),
      execute: async ({ daysAhead }) => {
        const now = new Date()
        const targetDate = new Date(now.getTime() + daysAhead * 86400000)

        const [openInvoices, openPos, recentPayments] = await Promise.all([
          db.invoice.findMany({
            where: { status: { not: "paid" } },
            select: { id: true, invoiceNumber: true, outstandingAmt: true, dueDate: true, customer: { select: { name: true } } },
          }),
          db.purchaseOrder.findMany({
            where: { status: { in: ["submitted", "approved", "partial"] } },
            select: { id: true, poNumber: true, totalAmount: true, expectedDate: true, supplier: { select: { name: true } } },
          }),
          db.payment.findMany({
            where: { createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
            select: { amount: true },
          }),
        ])

        const totalReceivables = openInvoices.reduce((sum, i) => sum + i.outstandingAmt, 0)
        const totalPayables = openPos.reduce((sum, p) => sum + p.totalAmount, 0)
        const netCashProjection = totalReceivables - totalPayables
        const historical30DayInflow = recentPayments.reduce((sum, p) => sum + p.amount, 0)

        // Split into aging buckets
        const dueSoonInvoices = openInvoices.filter((i) => i.dueDate <= targetDate)
        const overdueInvoices = openInvoices.filter((i) => i.dueDate < now)
        const dueSoonPos = openPos.filter((p) => !p.expectedDate || p.expectedDate <= targetDate)

        return {
          ok: true as const,
          forecastPeriodDays: daysAhead,
          projectedInflows: {
            totalReceivables: money(totalReceivables),
            receivablesDueInPeriod: money(dueSoonInvoices.reduce((sum, i) => sum + i.outstandingAmt, 0)),
            currentlyOverdue: money(overdueInvoices.reduce((sum, i) => sum + i.outstandingAmt, 0)),
            topDebtors: openInvoices.slice(0, 5).map((i) => `${i.customer.name}: $${money(i.outstandingAmt)} (Due: ${i.dueDate.toISOString().split("T")[0]})`),
          },
          projectedOutflows: {
            totalOpenPOs: money(totalPayables),
            posDueInPeriod: money(dueSoonPos.reduce((sum, p) => sum + p.totalAmount, 0)),
            topPayables: openPos.slice(0, 5).map((p) => `${p.supplier.name}: $${money(p.totalAmount)}`),
          },
          netLiquidityOutlook: {
            netProjectedCash: money(netCashProjection),
            historical30DayCollections: money(historical30DayInflow),
            status: netCashProjection >= 0 ? "SURPLUS" : "DEFICIT_RISK",
            summaryRecommendation: netCashProjection >= 0
              ? "Positive liquidity buffer. Maintain regular collection cadence on aged receivables."
              : `Warning: Projected outflow exceeds receivables by $${money(Math.abs(netCashProjection))}. Prioritize accelerating collections or negotiating supplier credit terms.`,
          },
        }
      },
    }),

    profitAndLossStatement: defineTool({
      description:
        "Generate a real-time Profit & Loss (P&L) statement estimating Gross Revenue, Cost of Goods Sold (COGS), Gross Margin %, and Net Operating Profit.",
      inputSchema: z.object({
        period: z.enum(["today", "this_week", "this_month", "this_quarter", "all_time"]).default("this_month"),
      }),
      execute: async ({ period }) => {
        const now = new Date()
        let startDate = new Date(now.getFullYear(), now.getMonth(), 1)

        if (period === "today") {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        } else if (period === "this_week") {
          const day = now.getDay()
          const diff = now.getDate() - day + (day === 0 ? -6 : 1)
          startDate = new Date(now.setDate(diff))
        } else if (period === "this_quarter") {
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3
          startDate = new Date(now.getFullYear(), quarterMonth, 1)
        } else if (period === "all_time") {
          startDate = new Date(2020, 0, 1)
        }

        const [orders, creditNotes] = await Promise.all([
          db.salesOrder.findMany({
            where: { createdAt: { gte: startDate }, status: { not: "cancelled" } },
            include: { items: { include: { product: true } } },
          }),
          db.creditNote.findMany({
            where: { createdAt: { gte: startDate } },
            select: { totalAmount: true },
          }),
        ])

        let grossRevenue = 0
        let totalCogs = 0
        let totalTaxCollected = 0
        let totalItemsSold = 0

        for (const order of orders) {
          grossRevenue += order.subtotal
          totalTaxCollected += order.taxAmount
          for (const item of order.items) {
            totalItemsSold += item.quantity
            const unitCost = item.product?.costPrice || (item.unitPrice * 0.65)
            totalCogs += unitCost * item.quantity
          }
        }

        const totalReturnsAndCredits = creditNotes.reduce((sum, c) => sum + c.totalAmount, 0)
        const netRevenue = grossRevenue - totalReturnsAndCredits
        const grossProfit = netRevenue - totalCogs
        const grossMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0

        // Estimated delivery/logistics and general overhead (approx 12% of revenue)
        const estimatedOverhead = netRevenue * 0.12
        const estimatedNetProfit = grossProfit - estimatedOverhead
        const netMarginPercent = netRevenue > 0 ? (estimatedNetProfit / netRevenue) * 100 : 0

        return {
          ok: true as const,
          period,
          reportingFrom: startDate.toISOString().split("T")[0],
          reportingTo: now.toISOString().split("T")[0],
          financials: {
            grossRevenue: money(grossRevenue),
            returnsAndCredits: money(totalReturnsAndCredits),
            netRevenue: money(netRevenue),
            costOfGoodsSold: money(totalCogs),
            grossProfit: money(grossProfit),
            grossMarginPercentage: `${grossMarginPercent.toFixed(1)}%`,
            estimatedOperatingOverhead: money(estimatedOverhead),
            estimatedNetProfit: money(estimatedNetProfit),
            netMarginPercentage: `${netMarginPercent.toFixed(1)}%`,
            gstCollected: money(totalTaxCollected),
          },
          orderMetrics: {
            totalOrdersPlaced: orders.length,
            totalUnitsDispatched: totalItemsSold,
            averageOrderValue: orders.length > 0 ? money(netRevenue / orders.length) : 0,
          },
        }
      },
    }),

    customerRfmSegmentation: defineTool({
      description:
        "Perform RFM (Recency, Frequency, Monetary) segmentation across all wholesale customers. Identifies VIP Champions, Loyal Accounts, High-Growth Potentials, and Churn-Risk accounts.",
      inputSchema: z.object({
        minOrders: z.number().optional().default(1),
      }),
      execute: async ({ minOrders }) => {
        const now = new Date()
        const customers = await db.customer.findMany({
          include: {
            orders: {
              where: { status: { not: "cancelled" } },
              orderBy: { createdAt: "desc" },
              select: { id: true, totalAmount: true, createdAt: true },
            },
          },
        })

        const segments = {
          champions: [] as Array<{ name: string; revenue: number; ordersCount: number; lastOrderDays: number }>,
          loyal: [] as Array<{ name: string; revenue: number; ordersCount: number; lastOrderDays: number }>,
          potentialGrowth: [] as Array<{ name: string; revenue: number; ordersCount: number; lastOrderDays: number }>,
          atRisk: [] as Array<{ name: string; revenue: number; ordersCount: number; lastOrderDays: number }>,
          lapsed: [] as Array<{ name: string; revenue: number; ordersCount: number; lastOrderDays: number }>,
        }

        for (const cust of customers) {
          if (cust.orders.length < minOrders) continue

          const totalSpend = cust.orders.reduce((sum, o) => sum + o.totalAmount, 0)
          const orderCount = cust.orders.length
          const lastOrder = cust.orders[0]?.createdAt
          const daysSinceLastOrder = lastOrder
            ? Math.floor((now.getTime() - new Date(lastOrder).getTime()) / 86400000)
            : 999

          const profile = {
            name: cust.name,
            revenue: money(totalSpend),
            ordersCount: orderCount,
            lastOrderDays: daysSinceLastOrder,
          }

          if (totalSpend >= 5000 && daysSinceLastOrder <= 14 && orderCount >= 5) {
            segments.champions.push(profile)
          } else if (orderCount >= 3 && daysSinceLastOrder <= 21) {
            segments.loyal.push(profile)
          } else if (daysSinceLastOrder <= 14 && totalSpend < 5000) {
            segments.potentialGrowth.push(profile)
          } else if (daysSinceLastOrder > 21 && daysSinceLastOrder <= 45) {
            segments.atRisk.push(profile)
          } else if (daysSinceLastOrder > 45) {
            segments.lapsed.push(profile)
          } else {
            segments.loyal.push(profile)
          }
        }

        return {
          ok: true as const,
          totalCustomersAnalyzed: customers.length,
          segmentsSummary: {
            championsCount: segments.champions.length,
            loyalCount: segments.loyal.length,
            potentialGrowthCount: segments.potentialGrowth.length,
            atRiskCount: segments.atRisk.length,
            lapsedCount: segments.lapsed.length,
          },
          topChampions: segments.champions.slice(0, 5),
          criticalAtRisk: segments.atRisk.slice(0, 5),
          actionableRecommendation: segments.atRisk.length > 0
            ? `Attention: ${segments.atRisk.length} customer(s) have stopped their normal order cadence (21-45 days since last order). Use draftEmail or contact rep to initiate proactive check-in.`
            : "Customer order retention is healthy across active accounts.",
        }
      },
    }),

    supplierPerformanceScorecard: defineTool({
      description:
        "Evaluate supplier reliability and vendor scorecards: on-time fulfillment, purchase order volume, and active product coverage.",
      inputSchema: z.object({
        limit: z.number().optional().default(10),
      }),
      execute: async ({ limit }) => {
        const suppliers = await db.supplier.findMany({
          take: limit,
          include: {
            purchaseOrders: {
              select: { id: true, totalAmount: true, status: true, expectedDate: true, createdAt: true },
            },
            batches: { select: { isQuarantined: true } },
          },
        })

        const scorecards = suppliers.map((s) => {
          const totalSpend = s.purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0)
          const totalPos = s.purchaseOrders.length
          const completedPos = s.purchaseOrders.filter((po) => po.status === "received").length
          const quarantinedBatches = s.batches.filter((b) => b.isQuarantined).length
          const qualityScore = s.batches.length > 0
            ? (((s.batches.length - quarantinedBatches) / s.batches.length) * 100).toFixed(0)
            : 100

          return {
            id: s.id,
            name: s.name,
            code: s.code,
            totalSpend: money(totalSpend),
            totalPurchaseOrders: totalPos,
            completedPOs: completedPos,
            qualityPassRate: `${qualityScore}%`,
            leadTimeDays: s.leadTimeDays || 3,
            paymentTerms: `${s.paymentTermsDays || 30} days`,
            status: s.status,
          }
        })

        return {
          ok: true as const,
          totalSuppliers: scorecards.length,
          scorecards,
        }
      },
    }),

    taxSummaryGst: defineTool({
      description:
        "Calculate Australian Goods and Services Tax (GST 10%) breakdown for BAS (Business Activity Statement) reporting: Total GST Collected, Input Tax Credits (GST Paid), and Net GST Payable.",
      inputSchema: z.object({
        period: z.enum(["this_month", "this_quarter", "last_quarter", "all_time"]).default("this_quarter"),
      }),
      execute: async ({ period }) => {
        const now = new Date()
        let startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)

        if (period === "this_month") {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        } else if (period === "last_quarter") {
          const currentQuarterMonth = Math.floor(now.getMonth() / 3) * 3
          startDate = new Date(now.getFullYear(), currentQuarterMonth - 3, 1)
        } else if (period === "all_time") {
          startDate = new Date(2020, 0, 1)
        }

        const [salesOrders, purchaseOrders] = await Promise.all([
          db.salesOrder.findMany({
            where: { createdAt: { gte: startDate }, status: { not: "cancelled" } },
            select: { subtotal: true, taxAmount: true, totalAmount: true },
          }),
          db.purchaseOrder.findMany({
            where: { createdAt: { gte: startDate }, status: { in: ["approved", "received", "partial"] } },
            select: { subtotal: true, taxAmount: true, totalAmount: true },
          }),
        ])

        const totalSalesGst = salesOrders.reduce((sum, o) => sum + o.taxAmount, 0)
        const totalPurchasesGst = purchaseOrders.reduce((sum, p) => sum + p.taxAmount, 0)
        const netGstPayable = totalSalesGst - totalPurchasesGst

        return {
          ok: true as const,
          period,
          startDate: startDate.toISOString().split("T")[0],
          endDate: now.toISOString().split("T")[0],
          gstG1_TotalSales: money(salesOrders.reduce((sum, o) => sum + o.totalAmount, 0)),
          gst1A_GstCollectedOnSales: money(totalSalesGst),
          gstG10_TotalPurchases: money(purchaseOrders.reduce((sum, p) => sum + p.totalAmount, 0)),
          gst1B_InputTaxCreditsClaimed: money(totalPurchasesGst),
          gstNetPayableToAto: money(netGstPayable),
          taxSummaryNotice: netGstPayable >= 0
            ? `Net GST liability: $${money(netGstPayable)} payable to the Australian Taxation Office (ATO).`
            : `Net GST refund credit: $${money(Math.abs(netGstPayable))} refundable from ATO.`,
        }
      },
    }),
  }
}
