import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Deep Operations, Supply Chain Optimization & Traceability.
 *
 * Hermes-grade operations: Pallet engineering, warehouse ABC slotting,
 * recipe margin breakdown, mock recalls, and supplier quote comparisons.
 */

export function buildDeepOperationsTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    compareSupplierQuotes: defineTool({
      description:
        "Compare wholesale pricing, MOQ, lead times, and terms across multiple suppliers for any SKU or product.",
      inputSchema: z.object({
        productIdOrSku: z.string().describe("Product ID or SKU to compare suppliers for"),
      }),
      execute: async ({ productIdOrSku }) => {
        const product = await db.product.findFirst({
          where: {
            OR: [
              { id: productIdOrSku },
              { sku: { equals: productIdOrSku, mode: "insensitive" } },
              { name: { contains: productIdOrSku, mode: "insensitive" } },
            ],
          },
          include: {
            suppliers: {
              include: { supplier: true },
            },
          },
        })

        if (!product) {
          return { ok: false as const, error: `Product '${productIdOrSku}' not found.` }
        }

        const suppliers = product.suppliers.map((ps) => ({
          supplierId: ps.supplier.id,
          supplierName: ps.supplier.name,
          supplierSku: ps.supplierSku || product.sku,
          unitCost: money(ps.costPrice),
          leadTimeDays: ps.supplier.leadTimeDays || 3,
          minOrderQty: ps.minOrderQty || 1,
          paymentTerms: `${ps.supplier.paymentTermsDays || 30} days`,
          isPreferred: ps.isPreferred,
        }))

        // Sort by unitCost ascending
        suppliers.sort((a, b) => a.unitCost - b.unitCost)

        const bestPrice = suppliers[0]

        return {
          ok: true as const,
          product: { id: product.id, name: product.name, sku: product.sku, currentSellPrice: money(product.basePrice) },
          totalSuppliers: suppliers.length,
          supplierQuotes: suppliers,
          bestPriceRecommendation: bestPrice
            ? `Best rate: ${bestPrice.supplierName} @ $${bestPrice.unitCost} (Lead time: ${bestPrice.leadTimeDays} days). Estimated gross margin: ${(((product.basePrice - bestPrice.unitCost) / product.basePrice) * 100).toFixed(1)}%.`
            : "No supplier mappings configured for this product.",
        }
      },
    }),

    recipeCostingAnalysis: defineTool({
      description:
        "Analyze a Bill of Material (BOM) recipe: raw ingredient unit costs, batch yield, wastage overhead, packaging costs, and gross margin at target sell price.",
      inputSchema: z.object({
        bomIdOrName: z.string().describe("BOM ID or Product Name"),
        targetSellPrice: z.number().optional().describe("Optional target wholesale price to evaluate margin"),
        batchMultiplier: z.number().optional().default(1).describe("Batch scale factor (e.g. 2 for double batch)"),
      }),
      execute: async ({ bomIdOrName, targetSellPrice, batchMultiplier }) => {
        const bom = await db.billOfMaterial.findFirst({
          where: {
            OR: [
              { id: bomIdOrName },
              { name: { contains: bomIdOrName, mode: "insensitive" } },
              { product: { name: { contains: bomIdOrName, mode: "insensitive" } } },
            ],
          },
          include: {
            product: true,
            lines: { include: { componentProduct: true } },
          },
        })

        if (!bom) {
          return { ok: false as const, error: `Bill of Material '${bomIdOrName}' not found.` }
        }

        let totalRawCost = 0
        const lineBreakdown = bom.lines.map((line) => {
          const comp = line.componentProduct
          const unitCost = comp?.costPrice || (comp?.basePrice ? comp.basePrice * 0.6 : 1.0)
          const qty = line.quantity * batchMultiplier
          const lineCost = unitCost * qty * (1 + (line.wastePercent || 0) / 100)
          totalRawCost += lineCost

          return {
            ingredient: comp?.name || "Raw Material",
            sku: comp?.sku || "N/A",
            quantityNeeded: qty,
            unit: line.unit || comp?.unit || "kg",
            unitCost: money(unitCost),
            wastePercent: `${line.wastePercent || 0}%`,
            lineTotalCost: money(lineCost),
          }
        })

        const totalBatchYield = bom.yieldQuantity * batchMultiplier
        const costPerYieldUnit = totalBatchYield > 0 ? totalRawCost / totalBatchYield : totalRawCost
        const sellPrice = targetSellPrice || bom.product.basePrice
        const grossMarginPerUnit = sellPrice - costPerYieldUnit
        const grossMarginPercent = sellPrice > 0 ? (grossMarginPerUnit / sellPrice) * 100 : 0

        return {
          ok: true as const,
          recipe: {
            id: bom.id,
            name: bom.name,
            outputProduct: bom.product.name,
            batchYield: `${totalBatchYield} ${bom.yieldUnit || "units"}`,
          },
          costingSummary: {
            totalBatchCost: money(totalRawCost),
            costPerUnit: money(costPerYieldUnit),
            wholesaleSellPrice: money(sellPrice),
            grossProfitPerUnit: money(grossMarginPerUnit),
            grossMarginPercentage: `${grossMarginPercent.toFixed(1)}%`,
          },
          ingredients: lineBreakdown,
          profitabilityStatus: grossMarginPercent >= 35 ? "HEALTHY_MARGIN" : "LOW_MARGIN_ALERT",
        }
      },
    }),

    palletOptimization: defineTool({
      description:
        "Calculate carton palletization layout for Australian standard pallets (1165 x 1165mm CHEP / Loscam). Computes cartons per layer (Ti), layer count (Hi), total pallet capacity, cubic volume, and gross weight.",
      inputSchema: z.object({
        cartonLengthMm: z.number().describe("Carton length in mm"),
        cartonWidthMm: z.number().describe("Carton width in mm"),
        cartonHeightMm: z.number().describe("Carton height in mm"),
        cartonWeightKg: z.number().describe("Gross weight per carton in kg"),
        maxPalletHeightMm: z.number().optional().default(1800).describe("Maximum allowed pallet height (default 1800mm)"),
        maxPalletWeightKg: z.number().optional().default(1000).describe("Maximum allowed pallet weight in kg (default 1000kg)"),
      }),
      execute: async ({ cartonLengthMm, cartonWidthMm, cartonHeightMm, cartonWeightKg, maxPalletHeightMm, maxPalletWeightKg }) => {
        const PALLET_LENGTH = 1165
        const PALLET_WIDTH = 1165
        const PALLET_BASE_HEIGHT = 150 // Standard wooden pallet height
        const PALLET_TARE_WEIGHT = 40 // Standard Chep pallet weight kg

        // Orientation 1: Length aligned with pallet length
        const ti1 = Math.floor(PALLET_LENGTH / cartonLengthMm) * Math.floor(PALLET_WIDTH / cartonWidthMm)
        // Orientation 2: Length aligned with pallet width
        const ti2 = Math.floor(PALLET_LENGTH / cartonWidthMm) * Math.floor(PALLET_WIDTH / cartonLengthMm)
        const cartonsPerLayer = Math.max(ti1, ti2)

        const usableHeight = maxPalletHeightMm - PALLET_BASE_HEIGHT
        const layersByHeight = Math.floor(usableHeight / cartonHeightMm)

        // Weight constraint
        const usableWeight = maxPalletWeightKg - PALLET_TARE_WEIGHT
        const maxCartonsByWeight = Math.floor(usableWeight / cartonWeightKg)
        const layersByWeight = Math.floor(maxCartonsByWeight / cartonsPerLayer)

        const finalLayers = Math.max(1, Math.min(layersByHeight, layersByWeight))
        const totalCartons = finalLayers * cartonsPerLayer
        const totalProductWeight = totalCartons * cartonWeightKg
        const totalPalletWeight = totalProductWeight + PALLET_TARE_WEIGHT
        const totalPalletHeight = finalLayers * cartonHeightMm + PALLET_BASE_HEIGHT
        const cubicMeters = ((PALLET_LENGTH * PALLET_WIDTH * totalPalletHeight) / 1000000000).toFixed(2)

        return {
          ok: true as const,
          palletStandard: "Australian Standard (1165 x 1165 mm)",
          cartonDimensions: `${cartonLengthMm} x ${cartonWidthMm} x ${cartonHeightMm} mm @ ${cartonWeightKg} kg`,
          configuration: {
            ti_CartonsPerLayer: cartonsPerLayer,
            hi_LayerCount: finalLayers,
            totalCartonsPerPallet: totalCartons,
            totalGrossWeightKg: totalPalletWeight,
            totalHeightMm: totalPalletHeight,
            cubicVolumeM3: `${cubicMeters} m³`,
          },
          limitingFactor: layersByWeight < layersByHeight ? "WEIGHT_CAPACITY" : "HEIGHT_CAPACITY",
          message: `Optimized pallet: ${totalCartons} cartons (${cartonsPerLayer} Ti x ${finalLayers} Hi). Total weight: ${totalPalletWeight.toFixed(1)} kg.`,
        }
      },
    }),

    warehouseSlottingAdvisor: defineTool({
      description:
        "Perform ABC warehouse velocity analysis to recommend optimal bin slotting: fast-moving Class A items near packing docks, Class B in central aisles, Class C slow-movers in high racking.",
      inputSchema: z.object({
        limit: z.number().optional().default(15),
      }),
      execute: async ({ limit }) => {
        const orderItems = await db.salesOrderItem.groupBy({
          by: ["productId"],
          _sum: { quantity: true },
          _count: { id: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: limit,
        })

        const productIds = orderItems.map((oi) => oi.productId)
        const products = await db.product.findMany({
          where: { id: { in: productIds } },
          include: { inventory: true },
        })

        const productMap = new Map(products.map((p) => [p.id, p]))

        const slottingRecommendations = orderItems.map((item, index) => {
          const prod = productMap.get(item.productId)
          const pickCount = item._count.id
          const totalQty = item._sum.quantity || 0

          let classification = "Class C (Slow Moving)"
          let recommendedZone = "Upper Racking / Rear Aisles (Level 3-4)"
          if (index < 5) {
            classification = "Class A (Fast Moving / Velocity Pick)"
            recommendedZone = "Ground Level / Front Dispatch Staging (Level 1, Aisle 1-2)"
          } else if (index < 10) {
            classification = "Class B (Moderate Demand)"
            recommendedZone = "Mid-Level Picking Bays (Level 2, Aisle 3-5)"
          }

          return {
            sku: prod?.sku || "N/A",
            productName: prod?.name || "Product",
            pickFrequencyCount: pickCount,
            totalUnitsPicked: totalQty,
            currentStock: prod?.inventory?.reduce((s, inv) => s + inv.quantity, 0) || 0,
            abcClass: classification,
            recommendedSlottingZone: recommendedZone,
          }
        })

        return {
          ok: true as const,
          totalProductsAnalyzed: slottingRecommendations.length,
          recommendations: slottingRecommendations,
        }
      },
    }),

    mockRecallSimulation: defineTool({
      description:
        "Execute an instant food safety & HACCP mock recall simulation. Traces a batch or product both backward (inbound supplier POs) and forward (all customer orders & deliveries dispatched).",
      inputSchema: z.object({
        batchNumberOrSku: z.string().describe("Batch number or SKU to simulate recall on"),
      }),
      execute: async ({ batchNumberOrSku }) => {
        const batch = await db.batch.findFirst({
          where: {
            OR: [
              { batchNumber: { equals: batchNumberOrSku, mode: "insensitive" } },
              { product: { sku: { equals: batchNumberOrSku, mode: "insensitive" } } },
            ],
          },
          include: {
            product: true,
            supplier: true,
          },
        })

        if (!batch) {
          return { ok: false as const, error: `Batch or SKU '${batchNumberOrSku}' not found.` }
        }

        // Find customer orders that contain this product since batch creation
        const affectedOrders = await db.salesOrder.findMany({
          where: {
            createdAt: { gte: batch.createdAt },
            items: { some: { productId: batch.productId } },
            status: { in: ["confirmed", "dispatched", "delivered"] },
          },
          include: {
            customer: { select: { name: true, phone: true, email: true } },
            items: { where: { productId: batch.productId } },
          },
          take: 25,
        })

        const totalDispatchedUnits = affectedOrders.reduce((sum, o) => {
          return sum + o.items.reduce((iSum, item) => iSum + item.quantity, 0)
        }, 0)

        return {
          ok: true as const,
          drillType: "HACCP Mock Recall Traceability Drill",
          targetBatch: {
            batchNumber: batch.batchNumber,
            productName: batch.product.name,
            sku: batch.product.sku,
            expiryDate: batch.expiryDate?.toISOString().split("T")[0] || "N/A",
            initialQuantity: batch.initialQty,
            currentWarehouseStock: batch.currentQty,
            quarantined: batch.isQuarantined,
          },
          backwardTraceSupplier: {
            supplierName: batch.supplier?.name || "Direct Wholesale",
            supplierContact: batch.supplier?.email || "N/A",
            receivedDate: batch.createdAt.toISOString().split("T")[0],
          },
          forwardTraceDispatchedCustomers: {
            affectedOrderCount: affectedOrders.length,
            totalUnitsDispatched: totalDispatchedUnits,
            customersToNotify: affectedOrders.map((o) => ({
              orderNumber: o.orderNumber,
              customerName: o.customer.name,
              contact: o.customer.phone || o.customer.email || "N/A",
              unitsPurchased: o.items.reduce((s, i) => s + i.quantity, 0),
              orderStatus: o.status,
            })),
          },
          containmentActions: [
            `1. Quarantine remaining ${batch.currentQty} unit(s) in warehouse via quarantineStock.`,
            `2. Dispatch recall notification emails to ${affectedOrders.length} affected customer(s).`,
            `3. Contact supplier (${batch.supplier?.name || "Vendor"}) for root cause and corrective action report.`,
          ],
        }
      },
    }),

    creditRiskAssessment: defineTool({
      description:
        "Assess customer creditworthiness: payment turnaround, overdue history, credit limit utilization, and recommendation for credit adjustments.",
      inputSchema: z.object({
        customerId: z.string().describe("Customer ID or Name"),
      }),
      execute: async ({ customerId }) => {
        const customer = await db.customer.findFirst({
          where: {
            OR: [
              { id: customerId },
              { name: { contains: customerId, mode: "insensitive" } },
            ],
          },
          include: {
            invoices: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
            orders: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        })

        if (!customer) {
          return { ok: false as const, error: `Customer '${customerId}' not found.` }
        }

        const openInvoices = customer.invoices.filter((i) => i.status !== "paid")
        const overdueInvoices = openInvoices.filter((i) => i.dueDate < new Date())
        const totalOutstanding = openInvoices.reduce((sum, i) => sum + i.outstandingAmt, 0)
        const totalOverdue = overdueInvoices.reduce((sum, i) => sum + i.outstandingAmt, 0)
        const creditLimit = customer.creditLimit || 5000
        const creditUtilizationPercent = ((totalOutstanding / creditLimit) * 100).toFixed(1)

        let riskScore = 85 // Base healthy score
        if (totalOverdue > 0) riskScore -= 25
        if (Number(creditUtilizationPercent) > 90) riskScore -= 20
        if (customer.invoices.length === 0) riskScore = 60 // New unproven account

        let recommendation = "Approve standard 30-day payment terms."
        if (riskScore < 50) {
          recommendation = "High Risk: Place account on Pre-Payment (CIA / COD) until overdue invoices are settled."
        } else if (riskScore < 75) {
          recommendation = "Moderate Risk: Restrict credit limit to $2,000 and enforce 7-day payment terms."
        }

        return {
          ok: true as const,
          customer: {
            id: customer.id,
            name: customer.name,
            code: customer.code,
            creditLimit: money(creditLimit),
            paymentTerms: `${customer.paymentTermsDays || 30} days`,
            status: customer.status,
          },
          exposure: {
            totalOutstanding: money(totalOutstanding),
            totalOverdue: money(totalOverdue),
            creditUtilization: `${creditUtilizationPercent}%`,
            overdueInvoicesCount: overdueInvoices.length,
          },
          creditRating: {
            score: `${riskScore}/100`,
            tier: riskScore >= 75 ? "EXCELLENT" : riskScore >= 50 ? "MODERATE" : "HIGH_RISK",
            recommendation,
          },
        }
      },
    }),
  }
}
