import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Salesforce & Enterprise CRM Suite.
 *
 * Provides Customer 360 view, Opportunity Pipeline stage tracking,
 * Lead Qualification scoring, Activity cadences, and Churn Risk analysis.
 */

export function buildSalesforceTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    salesforceCustomer360: defineTool({
      description:
        "Generate a comprehensive Salesforce-grade Customer 360 view: Lifetime Value (LTV), buying cadence, average order size, churn risk score, payment timeliness, recent activity, and top purchased SKUs.",
      inputSchema: z.object({
        customerQuery: z.string().describe("Customer name or account code (e.g. 'Nonna', 'Bella Vista', 'CUST-001')"),
      }),
      execute: async ({ customerQuery }) => {
        const customer = await db.customer.findFirst({
          where: {
            OR: [
              { name: { contains: customerQuery, mode: "insensitive" } },
              { code: { contains: customerQuery, mode: "insensitive" } },
            ],
          },
          include: {
            orders: {
              where: { status: { not: "cancelled" } },
              orderBy: { createdAt: "desc" },
              include: { items: { include: { product: true } } },
              take: 20,
            },
            invoices: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
            notes: {
              orderBy: { createdAt: "desc" },
              take: 5,
            },
          },
        })

        if (!customer) {
          return { ok: false as const, error: `Customer matching "${customerQuery}" not found.` }
        }

        const orders = customer.orders
        const totalSpend = orders.reduce((sum, o) => sum + o.totalAmount, 0)
        const aov = orders.length > 0 ? totalSpend / orders.length : 0

        // Calculate days since last order
        const lastOrder = orders[0]
        const now = new Date()
        const daysSinceLastOrder = lastOrder
          ? Math.round((now.getTime() - lastOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          : 999

        // Churn risk logic
        let churnRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW"
        let churnScore = 15 // base healthy
        if (daysSinceLastOrder > 45) {
          churnRisk = "CRITICAL"
          churnScore = 90
        } else if (daysSinceLastOrder > 28) {
          churnRisk = "HIGH"
          churnScore = 70
        } else if (daysSinceLastOrder > 14) {
          churnRisk = "MEDIUM"
          churnScore = 40
        }

        // Top purchased SKUs
        const skuCounts: Record<string, { name: string; qty: number; spend: number }> = {}
        for (const order of orders) {
          for (const item of order.items) {
            const sku = item.product.sku
            if (!skuCounts[sku]) {
              skuCounts[sku] = { name: item.product.name, qty: 0, spend: 0 }
            }
            skuCounts[sku].qty += item.quantity
            skuCounts[sku].spend += item.total
          }
        }

        const topProducts = Object.entries(skuCounts)
          .map(([sku, data]) => ({ sku, ...data, spend: money(data.spend) }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5)

        // Payment reliability
        const openInvoices = customer.invoices.filter((i) => i.status !== "paid")
        const overdueInvoices = openInvoices.filter((i) => i.dueDate < now)
        const overdueBalance = overdueInvoices.reduce((sum, i) => sum + i.outstandingAmt, 0)

        return {
          ok: true as const,
          accountId: customer.id,
          accountCode: customer.code || "CUST",
          businessName: customer.name,
          contactPerson: customer.contactName || "Direct Contact",
          phone: customer.phone,
          email: customer.email,
          paymentTerms: `${customer.paymentTermsDays || 30} Days Net`,
          creditLimit: money(customer.creditLimit || 0),
          financialMetrics: {
            lifetimeValue: money(totalSpend),
            totalOrdersPlaced: orders.length,
            averageOrderValue: money(aov),
            openReceivables: money(openInvoices.reduce((sum, i) => sum + i.outstandingAmt, 0)),
            overdueBalance: money(overdueBalance),
          },
          buyingHealth: {
            daysSinceLastOrder,
            lastOrderDate: lastOrder ? lastOrder.createdAt.toISOString().split("T")[0] : "Never",
            churnRisk,
            churnScore: `${churnScore}/100`,
            status: customer.status,
          },
          topProducts,
          recentNotes: customer.notes.map((n) => ({
            date: n.createdAt.toISOString().split("T")[0],
            content: n.content,
            author: n.authorName || "Staff Rep",
          })),
        }
      },
    }),

    salesforceOpportunityPipeline: defineTool({
      description:
        "Manage sales opportunities through standard CRM stages (Prospecting → Qualification → Needs Analysis → Proposal/Quote → Negotiation → Closed Won / Closed Lost) with win probabilities and expected revenue.",
      inputSchema: z.object({
        action: z.enum(["list_pipeline", "update_stage", "win_deal", "lose_deal"]).describe("Action to perform"),
        opportunityId: z.string().optional().describe("Opportunity ID when updating or closing a deal"),
        stage: z.enum([
          "prospecting", "qualification", "needs_analysis",
          "proposal_quote", "negotiation", "closed_won", "closed_lost",
        ]).optional().describe("Target CRM stage"),
        lossReason: z.string().optional().describe("Competitor or price reason if deal is lost"),
        competitorName: z.string().optional().describe("Competitor name if lost to competition"),
      }),
      execute: async ({ action, opportunityId, stage, lossReason, competitorName }) => {
        if (action === "list_pipeline") {
          const opportunities = await db.opportunity.findMany({
            orderBy: { createdAt: "desc" },
            include: { customer: true },
            take: 30,
          })

          const stageProbability: Record<string, number> = {
            prospecting: 10,
            qualification: 25,
            needs_analysis: 40,
            proposal_quote: 60,
            negotiation: 80,
            closed_won: 100,
            closed_lost: 0,
          }

          const pipelineTotal = opportunities.reduce((sum, o) => sum + (o.estimatedValue || 0), 0)
          const weightedTotal = opportunities.reduce((sum, o) => {
            const prob = stageProbability[o.stage] || 50
            return sum + (o.estimatedValue || 0) * (prob / 100)
          }, 0)

          return {
            ok: true as const,
            totalDeals: opportunities.length,
            unweightedPipelineValue: money(pipelineTotal),
            weightedForecastRevenue: money(weightedTotal),
            opportunities: opportunities.map((o) => ({
              id: o.id,
              title: o.title,
              customerName: o.customer?.name || "New Prospect",
              stage: o.stage,
              estimatedValue: money(o.estimatedValue || 0),
              probability: `${stageProbability[o.stage] || 50}%`,
              expectedCloseDate: o.expectedCloseDate ? o.expectedCloseDate.toISOString().split("T")[0] : "TBD",
            })),
          }
        }

        if (action === "update_stage" && opportunityId && stage) {
          const updated = await db.opportunity.update({
            where: { id: opportunityId },
            data: { stage },
          })
          return {
            ok: true as const,
            opportunityId,
            newStage: stage,
            message: `Advanced opportunity "${updated.title}" to stage "${stage}".`,
          }
        }

        if (action === "win_deal" && opportunityId) {
          const won = await db.opportunity.update({
            where: { id: opportunityId },
            data: { stage: "closed_won" },
          })
          return {
            ok: true as const,
            opportunityId,
            stage: "closed_won",
            message: `🎉 Deal CLOSED WON: "${won.title}" ($${money(won.estimatedValue || 0)}). Ready for onboarding and first delivery run!`,
          }
        }

        if (action === "lose_deal" && opportunityId) {
          const lost = await db.opportunity.update({
            where: { id: opportunityId },
            data: {
              stage: "closed_lost",
              description: `Lost Reason: ${lossReason || "Unspecified"} | Competitor: ${competitorName || "N/A"}`,
            },
          })
          return {
            ok: true as const,
            opportunityId,
            stage: "closed_lost",
            lossReason: lossReason || "Price / Competitor",
            competitorName: competitorName || "N/A",
            message: `Deal closed lost recorded for market intelligence: "${lost.title}".`,
          }
        }

        return { ok: false as const, error: "Invalid opportunity parameters." }
      },
    }),

    salesforceLeadScoring: defineTool({
      description:
        "Score and qualify inbound wholesale leads (0-100 score) based on venue type, weekly pizza volume, credit rating, and commercial location.",
      inputSchema: z.object({
        businessName: z.string().describe("Venue or business name"),
        venueType: z.enum(["pizzeria", "italian_restaurant", "pub_club", "foodservice_distributor", "cafe_bar", "retail_supermarket"]),
        weeklyCartonEstimate: z.number().describe("Estimated cartons of pizza bases / dough balls per week"),
        hasExistingSupplier: z.boolean().optional().default(true),
        decisionMakerContacted: z.boolean().optional().default(false),
      }),
      execute: async ({ businessName, venueType, weeklyCartonEstimate, hasExistingSupplier, decisionMakerContacted }) => {
        let score = 20 // Base score

        // Volume scoring
        if (weeklyCartonEstimate >= 50) {
          score += 40
        } else if (weeklyCartonEstimate >= 20) {
          score += 30
        } else if (weeklyCartonEstimate >= 10) {
          score += 20
        } else {
          score += 10
        }

        // Venue type alignment
        if (venueType === "pizzeria" || venueType === "foodservice_distributor") {
          score += 25
        } else if (venueType === "italian_restaurant" || venueType === "pub_club") {
          score += 20
        } else {
          score += 10
        }

        if (decisionMakerContacted) score += 15
        if (hasExistingSupplier) score += 5 // Already buys frozen bases, easy substitution

        score = Math.min(score, 100)

        const tier = score >= 80 ? "HOT (Tier 1 Priority)" : score >= 60 ? "WARM (Tier 2)" : "COLD (Tier 3)"
        const estimatedMonthlyRevenue = weeklyCartonEstimate * 54.0 * 4.33 // Based on Napoli Rustica $54/ctn

        return {
          ok: true as const,
          businessName,
          leadScore: score,
          leadTier: tier,
          estimatedMonthlySpend: money(estimatedMonthlyRevenue),
          recommendedAction: score >= 75
            ? "Assign immediately to senior sales rep (Antonio) and dispatch sample box (Napoli Rustica 30cm & 180g Dough Balls)"
            : "Follow up via email with wholesale product catalog and price list",
        }
      },
    }),
  }
}
