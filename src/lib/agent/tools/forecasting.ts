import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"
import {
  calculateDailyRunRate,
  calculateStockoutRisk,
  detectDemandAnomalies,
  detectSeasonality,
  generateStatisticalForecast,
  type DemandAnomaly,
  type SalesDataPoint,
} from "@/lib/forecasting"

/**
 * AI & Statistical Demand Forecasting, Run-rate Analysis & Inventory Replenishment Tools.
 *
 * Provides granular sales velocity tracking, stockout risk modeling with lead times,
 * day-of-week seasonality detection, and batch reorder forecasting.
 */

async function resolveProduct(query: string) {
  return db.product.findFirst({
    where: {
      OR: [{ id: query }, { sku: query }, { name: { contains: query, mode: "insensitive" } }],
    },
    select: {
      id: true,
      sku: true,
      name: true,
      packUnit: true,
      baseUnit: true,
      costPrice: true,
      wholesalePrice: true,
      suppliers: {
        select: {
          supplierId: true,
          supplierSku: true,
          costPrice: true,
          minOrderQty: true,
          leadTime: true,
          isPreferred: true,
          supplier: { select: { id: true, name: true } },
        },
      },
    },
  })
}

async function fetchProductSalesHistory(productId: string, lookbackDays: number): Promise<SalesDataPoint[]> {
  const since = new Date(Date.now() - Math.max(14, lookbackDays) * 86400000)

  const items = await db.salesOrderItem.findMany({
    where: {
      productId,
      order: {
        createdAt: { gte: since },
        status: { notIn: ["draft", "cancelled"] },
      },
    },
    select: {
      quantity: true,
      order: { select: { createdAt: true } },
    },
  })

  return items.map((item) => ({
    date: item.order.createdAt,
    quantity: item.quantity,
  }))
}

export function buildForecastingTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    forecastDemand: defineTool({
      description:
        "Generate a statistical & AI-enhanced demand forecast for a product. Calculates daily sales velocity, trend, stockout risk date, safety stock, and suggested replenishment quantity.",
      inputSchema: z.object({
        productId: z.string().describe("Product ID, SKU or exact product name"),
        horizonDays: z.number().int().min(7).max(90).optional().default(30).describe("Forecast horizon in days (7 to 90)"),
        lookbackDays: z.number().int().min(14).max(365).optional().default(90).describe("Historical sales window in days"),
        warehouseId: z.string().optional().describe("Optional warehouse filter"),
      }),
      execute: async ({ productId, horizonDays = 30, lookbackDays = 90, warehouseId }) => {
        const product = await resolveProduct(productId)
        if (!product) {
          return { ok: false as const, error: `Product "${productId}" not found` }
        }

        const [history, inventoryRecords] = await Promise.all([
          fetchProductSalesHistory(product.id, lookbackDays),
          db.inventory.findMany({
            where: {
              productId: product.id,
              ...(warehouseId ? { warehouseId } : {}),
            },
            select: {
              quantity: true,
              reserved: true,
              onOrder: true,
              reorderLevel: true,
              reorderQty: true,
              warehouse: { select: { id: true, name: true } },
            },
          }),
        ])

        const totalAvailable = inventoryRecords.reduce((sum, r) => sum + Math.max(0, r.quantity - r.reserved), 0)
        const totalOnOrder = inventoryRecords.reduce((sum, r) => sum + r.onOrder, 0)

        // Preferred supplier selection
        const preferredSupplier =
          product.suppliers.find((s) => s.isPreferred) || product.suppliers[0] || null
        const leadTimeDays = preferredSupplier?.leadTime || 7
        const minOrderQty = preferredSupplier?.minOrderQty || 1

        const runRate = calculateDailyRunRate(history, lookbackDays)
        const seasonality = detectSeasonality(history)
        const stockout = calculateStockoutRisk({
          currentStock: totalAvailable,
          onOrder: totalOnOrder,
          avgDailyDemand: runRate.avgDailyDemand,
          leadTimeDays,
          stdDevDailyDemand: runRate.stdDevDailyDemand,
          minOrderQty,
          targetCycleDays: horizonDays,
        })
        const forecastPoints = generateStatisticalForecast(history, horizonDays)

        const totalProjectedDemand = Number(
          forecastPoints.reduce((sum, p) => sum + p.projectedDemand, 0).toFixed(0)
        )

        return {
          ok: true as const,
          product: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            unit: product.packUnit || product.baseUnit,
            costPrice: money(product.costPrice),
          },
          inventoryStatus: {
            availableUnits: totalAvailable,
            onOrderUnits: totalOnOrder,
            warehouses: inventoryRecords.map((r) => ({
              warehouse: r.warehouse.name,
              available: r.quantity - r.reserved,
              onOrder: r.onOrder,
            })),
          },
          supplierDetails: preferredSupplier
            ? {
                supplierName: preferredSupplier.supplier.name,
                leadTimeDays: preferredSupplier.leadTime,
                minOrderQty: preferredSupplier.minOrderQty,
                unitCost: money(preferredSupplier.costPrice),
              }
            : null,
          salesVelocity: {
            avgDailyDemand: runRate.avgDailyDemand,
            stdDevDailyDemand: runRate.stdDevDailyDemand,
            salesTrend: runRate.trend,
            velocityChangePercent: `${runRate.velocityChangePercent}%`,
            lookbackDays,
            totalUnitsSoldInPeriod: runRate.totalUnits,
          },
          seasonality: {
            peakDay: seasonality.peakDay,
            lowDay: seasonality.lowDay,
            weekendToWeekdayRatio: seasonality.weekendToWeekdayRatio,
            strength: seasonality.seasonalityStrength,
          },
          stockoutRisk: {
            riskLevel: stockout.riskLevel,
            daysUntilStockout: stockout.daysUntilStockout === 999 ? "No recent demand" : stockout.daysUntilStockout,
            projectedStockoutDate: stockout.projectedStockoutDate?.toISOString().split("T")[0] || null,
            safetyStockUnits: stockout.safetyStock,
            reorderPointUnits: stockout.reorderPoint,
            suggestedReorderUnits: stockout.suggestedReorderQty,
          },
          projectedDemandSummary: {
            horizonDays,
            totalProjectedDemand,
            dailyProjections: forecastPoints.slice(0, 14), // Next 14 days sample
          },
          recommendation:
            stockout.riskLevel === "CRITICAL"
              ? `CRITICAL ALERT: Stock will run out in ${stockout.daysUntilStockout} days (within supplier lead time of ${leadTimeDays} days). Reorder immediately at least ${stockout.suggestedReorderQty} units.`
              : stockout.riskLevel === "WARNING"
              ? `WARNING: Available stock (${totalAvailable} units) is below the reorder threshold (${stockout.reorderPoint} units). Raise a purchase order for ${stockout.suggestedReorderQty} units.`
              : `Stock is healthy with ${stockout.daysUntilStockout} days of coverage based on current velocity.`,
        }
      },
    }),

    demandAnomalyCheck: defineTool({
      description:
        "Detect abnormal spikes or sudden drops in product sales volume compared to historical moving averages.",
      inputSchema: z.object({
        productId: z.string().optional().describe("Optional product ID or SKU; if omitted, checks high-velocity products"),
        lookbackDays: z.number().int().min(14).max(180).optional().default(60),
        thresholdSigma: z.number().min(1.5).max(4.0).optional().default(2.0).describe("Standard deviation sensitivity threshold"),
      }),
      execute: async ({ productId, lookbackDays = 60, thresholdSigma = 2.0 }) => {
        let products: Array<{ id: string; name: string; sku: string }> = []

        if (productId) {
          const product = await resolveProduct(productId)
          if (!product) return { ok: false as const, error: `Product "${productId}" not found` }
          products = [{ id: product.id, name: product.name, sku: product.sku }]
        } else {
          products = await db.product.findMany({
            where: { status: "active" },
            take: 25,
            select: { id: true, name: true, sku: true },
          })
        }

        const anomalyReports: Array<{
          product: string
          sku: string
          productId: string
          anomaliesCount: number
          topAnomalies: DemandAnomaly[]
        }> = []

        for (const prod of products) {
          const history = await fetchProductSalesHistory(prod.id, lookbackDays)
          const anomalies = detectDemandAnomalies(history, thresholdSigma)

          if (anomalies.length > 0) {
            anomalyReports.push({
              product: prod.name,
              sku: prod.sku,
              productId: prod.id,
              anomaliesCount: anomalies.length,
              topAnomalies: anomalies.slice(0, 5),
            })
          }
        }

        return {
          ok: true as const,
          lookbackDays,
          thresholdSigma,
          productsChecked: products.length,
          anomaliesDetectedCount: anomalyReports.length,
          anomalies: anomalyReports,
        }
      },
    }),

    seasonalityInsights: defineTool({
      description:
        "Analyze day-of-week consumption patterns and weekend vs weekday demand concentration for a product.",
      inputSchema: z.object({
        productId: z.string().describe("Product ID, SKU or name"),
        lookbackDays: z.number().int().min(14).max(180).optional().default(90),
      }),
      execute: async ({ productId, lookbackDays = 90 }) => {
        const product = await resolveProduct(productId)
        if (!product) return { ok: false as const, error: `Product "${productId}" not found` }

        const history = await fetchProductSalesHistory(product.id, lookbackDays)
        const seasonality = detectSeasonality(history)

        return {
          ok: true as const,
          product: { id: product.id, name: product.name, sku: product.sku },
          periodDays: lookbackDays,
          dayOfWeekDistribution: seasonality.dayOfWeekDistribution,
          peakDay: seasonality.peakDay,
          lowDay: seasonality.lowDay,
          weekdayDailyAvg: seasonality.weekdayAvg,
          weekendDailyAvg: seasonality.weekendAvg,
          weekendToWeekdayRatio: seasonality.weekendToWeekdayRatio,
          seasonalityStrength: seasonality.seasonalityStrength,
          patternDescription:
            seasonality.seasonalityStrength === "high"
              ? `High seasonality observed: Peak sales on ${seasonality.peakDay} with weekend/weekday ratio of ${seasonality.weekendToWeekdayRatio}x.`
              : `Relatively steady demand throughout the week with peak volume on ${seasonality.peakDay}.`,
        }
      },
    }),

    batchReorderForecast: defineTool({
      description:
        "Scan inventory across products to evaluate stockout risks based on live sales velocity and supplier lead times. Generates a prioritized list of items requiring replenishment.",
      inputSchema: z.object({
        warehouseId: z.string().optional().describe("Optional warehouse ID"),
        urgencyOnly: z.boolean().optional().default(false).describe("If true, only returns CRITICAL and WARNING items"),
        limit: z.number().int().min(1).max(100).optional().default(25),
      }),
      execute: async ({ warehouseId, urgencyOnly = false, limit = 25 }) => {
        const inventoryRows = await db.inventory.findMany({
          where: {
            ...(warehouseId ? { warehouseId } : {}),
            product: { status: "active" },
          },
          take: 100,
          select: {
            productId: true,
            quantity: true,
            reserved: true,
            onOrder: true,
            reorderLevel: true,
            reorderQty: true,
            warehouse: { select: { id: true, name: true } },
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                costPrice: true,
                suppliers: {
                  select: {
                    leadTime: true,
                    minOrderQty: true,
                    costPrice: true,
                    isPreferred: true,
                    supplier: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        })

        const evaluatedItems: Array<{
          productId: string
          sku: string
          name: string
          warehouse: string
          availableStock: number
          onOrder: number
          avgDailyDemand: number
          daysUntilStockout: number
          projectedStockoutDate: string | null
          riskLevel: "CRITICAL" | "WARNING" | "HEALTHY"
          safetyStock: number
          reorderPoint: number
          suggestedReorderQty: number
          supplier: string
          supplierId: string | null
          leadTimeDays: number
          estimatedCost: number
        }> = []

        for (const row of inventoryRows) {
          const history = await fetchProductSalesHistory(row.productId, 60)
          const runRate = calculateDailyRunRate(history, 60)

          const preferredSupplier =
            row.product.suppliers.find((s) => s.isPreferred) || row.product.suppliers[0] || null
          const leadTimeDays = preferredSupplier?.leadTime || 7
          const minOrderQty = preferredSupplier?.minOrderQty || row.reorderQty || 1

          const available = Math.max(0, row.quantity - row.reserved)
          const stockout = calculateStockoutRisk({
            currentStock: available,
            onOrder: row.onOrder,
            avgDailyDemand: runRate.avgDailyDemand,
            leadTimeDays,
            stdDevDailyDemand: runRate.stdDevDailyDemand,
            minOrderQty,
            targetCycleDays: 30,
          })

          if (urgencyOnly && stockout.riskLevel === "HEALTHY") {
            continue
          }

          evaluatedItems.push({
            productId: row.product.id,
            sku: row.product.sku,
            name: row.product.name,
            warehouse: row.warehouse.name,
            availableStock: available,
            onOrder: row.onOrder,
            avgDailyDemand: runRate.avgDailyDemand,
            daysUntilStockout: stockout.daysUntilStockout,
            projectedStockoutDate: stockout.projectedStockoutDate?.toISOString().split("T")[0] || null,
            riskLevel: stockout.riskLevel,
            safetyStock: stockout.safetyStock,
            reorderPoint: stockout.reorderPoint,
            suggestedReorderQty: stockout.suggestedReorderQty,
            supplier: preferredSupplier?.supplier?.name || "None on file",
            supplierId: preferredSupplier?.supplier?.id || null,
            leadTimeDays,
            estimatedCost: money(stockout.suggestedReorderQty * (preferredSupplier?.costPrice || row.product.costPrice || 0)),
          })
        }

        // Rank by risk level: CRITICAL first, then WARNING, then by daysUntilStockout ascending
        const priorityOrder: Record<string, number> = { CRITICAL: 0, WARNING: 1, HEALTHY: 2 }
        evaluatedItems.sort((a, b) => {
          const diff = (priorityOrder[a.riskLevel] ?? 9) - (priorityOrder[b.riskLevel] ?? 9)
          if (diff !== 0) return diff
          return a.daysUntilStockout - b.daysUntilStockout
        })

        const finalItems = evaluatedItems.slice(0, limit)
        const criticalCount = evaluatedItems.filter((i) => i.riskLevel === "CRITICAL").length
        const warningCount = evaluatedItems.filter((i) => i.riskLevel === "WARNING").length

        return {
          ok: true as const,
          totalScanned: inventoryRows.length,
          criticalCount,
          warningCount,
          items: finalItems,
        }
      },
    }),
  }
}
