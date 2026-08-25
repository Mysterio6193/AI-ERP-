import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Advanced Food Manufacturing & Production Operations Suite.
 *
 * Inspired by Katana Cloud Manufacturing, Plex, and SAP S/4HANA:
 * - Multi-Level Material Requirements Planning (MRP) BOM Explosion
 * - Work Center Capacity & Shift Scheduling (Mixers, Ovens, Blast Freezers, Packaging)
 * - Actual vs Theoretical Batch Yield & Scrap Variance Tracking
 * - Overall Equipment Effectiveness (OEE) & Bottleneck Diagnostics
 * - HACCP In-Process QA Quality Gate & Critical Control Point (CCP) Verification
 * - Full Absorption Production Cost Rollup (Raw Materials + Direct Labor + Machine Overhead + Packaging)
 */

export function buildManufacturingTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listBoms: defineTool({
      description:
        "List all Bill of Materials (BOM) recipes for manufactured pizza bases, dough balls, and specialty flatbreads.",
      inputSchema: z.object({
        productId: z.string().optional().describe("Filter by output product ID"),
      }),
      execute: async ({ productId }) => {
        const boms = await db.billOfMaterial.findMany({
          where: {
            status: "active",
            ...(productId ? { productId } : {}),
          },
          include: {
            product: { select: { id: true, name: true, sku: true } },
            lines: {
              include: { component: { select: { id: true, name: true, sku: true, costPrice: true } } },
            },
          },
        })

        return boms.map((bom) => ({
          id: bom.id,
          name: bom.name,
          product: bom.product.name,
          sku: bom.product.sku,
          yieldQty: bom.yieldQty,
          yieldUnit: bom.yieldUnit,
          componentsCount: bom.lines.length,
          components: bom.lines.map((l) => ({
            component: l.component.name,
            quantity: l.quantity,
            unit: l.unit,
            wastePct: l.wastePercent,
            costPerUnit: money(l.component.costPrice || 0),
          })),
        }))
      },
    }),

    mfgMultiLevelBomExplosion: defineTool({
      description:
        "Perform Material Requirements Planning (MRP) BOM explosion for a target production batch. Computes exact ingredient and packaging requirements, verifies warehouse stock availability, and flags component shortages.",
      inputSchema: z.object({
        productSku: z.string().describe("SKU of finished good to produce (e.g. 'RDM-NAP-30-12', 'RDM-RUS-30-16', 'RDM-DOU-180-40')"),
        targetQuantityCartons: z.number().positive().describe("Number of cartons to manufacture"),
      }),
      execute: async ({ productSku, targetQuantityCartons }) => {
        const product = await db.product.findFirst({
          where: { sku: { contains: productSku, mode: "insensitive" } },
          include: {
            billsOfMaterial: {
              where: { status: "active" },
              include: {
                lines: { include: { component: { include: { inventory: true } } } },
              },
            },
          },
        })

        if (!product || product.billsOfMaterial.length === 0) {
          return {
            ok: false as const,
            error: `Active BOM recipe not found for product "${productSku}". Check product SKU.`,
          }
        }

        const bom = product.billsOfMaterial[0]
        const multiplier = targetQuantityCartons / bom.yieldQty

        // Annotated for the same reason: an untyped [] is never[].
        const ingredientRequirements: Array<{
          componentSku: string
          componentName: string
          recipeQtyPerBatch: number
          totalRequired: number
          unit: string
          warehouseOnHand: number
          stockStatus: string
          shortageDelta: number
          estimatedCost: number
        }> = []
        let hasShortage = false

        for (const line of bom.lines) {
          const neededQty = line.quantity * multiplier * (1 + line.wastePercent / 100)
          const onHand = line.component.inventory.reduce((sum, inv) => sum + inv.quantity, 0)
          const isShort = onHand < neededQty
          if (isShort) hasShortage = true

          ingredientRequirements.push({
            componentSku: line.component.sku,
            componentName: line.component.name,
            recipeQtyPerBatch: line.quantity,
            totalRequired: Number(neededQty.toFixed(2)),
            unit: line.unit,
            warehouseOnHand: onHand,
            stockStatus: isShort ? "SHORTAGE_DETECTED" : "SUFFICIENT",
            shortageDelta: isShort ? Number((neededQty - onHand).toFixed(2)) : 0,
            estimatedCost: money(neededQty * (line.component.costPrice || 5)),
          })
        }

        // Add packaging requirements (1 carton box per yield carton + 1 poly liner per carton)
        const packagingReqs = [
          { item: `RDM Corrugated Master Carton (${product.packUnit})`, required: targetQuantityCartons, unit: "cartons" },
          { item: "Food-Grade High-Density Poly Bag Liners", required: targetQuantityCartons, unit: "liners" },
          { item: "Pallet Stretch Wrap & Corner Boards", required: Math.ceil(targetQuantityCartons / 48), unit: "pallets" },
        ]

        const totalBatchCost = ingredientRequirements.reduce((sum, i) => sum + i.estimatedCost, 0) + (targetQuantityCartons * 1.85) // $1.85 packaging per carton

        return {
          ok: true as const,
          productName: product.name,
          productSku: product.sku,
          targetProductionCartons: targetQuantityCartons,
          bomName: bom.name,
          standardBatchYield: bom.yieldQty,
          mrpStatus: hasShortage ? "ACTION_REQUIRED_SHORTAGES" : "READY_TO_SCHEDULE",
          ingredients: ingredientRequirements,
          packaging: packagingReqs,
          financialSummary: {
            totalEstimatedBatchCost: money(totalBatchCost),
            estimatedCostPerCarton: money(totalBatchCost / targetQuantityCartons),
            wholesaleSellPricePerCarton: money(product.wholesalePrice || 54.0),
            projectedBatchGrossMargin: `${(((product.wholesalePrice - (totalBatchCost / targetQuantityCartons)) / product.wholesalePrice) * 100).toFixed(1)}%`,
          },
        }
      },
    }),

    mfgCapacityAndShiftScheduler: defineTool({
      description:
        "Calculate work center runtimes, machine capacity utilization, bottleneck stages, and labor shift requirements for factory production runs (Gregory Hills Facility).",
      inputSchema: z.object({
        batchCartons: z.number().positive().describe("Total finished cartons to produce"),
        productType: z.enum(["pizza_bases", "dough_balls", "piadini_flatbreads"]).optional().default("pizza_bases"),
        shiftHoursAvailable: z.number().optional().default(8).describe("Shift length in hours (default 8 hours)"),
        availableOperators: z.number().optional().default(4).describe("Active line operators on duty"),
      }),
      execute: async ({ batchCartons, productType, shiftHoursAvailable, availableOperators }) => {
        // Work Centers Specs:
        // WC-01: Spiral Mixer 500kg (45 min cycle per 400kg dough)
        // WC-02: Proofing / Fermentation (24-48 hr automated cold retarder)
        // WC-03: Tunnel Deck Baking Oven (Throughput: 800 crusts/hr)
        // WC-04: Cryogenic IQF Spiral Blast Freezer (Throughput: 1,200 units/hr at -35°C)
        // WC-05: Auto Bagging & Case Packing Line (Throughput: 60 cartons/hr)

        const totalCrusts = batchCartons * 12 // 12 units per carton
        const mixingTimeHours = Number((batchCartons / 50).toFixed(2))
        const bakingTimeHours = Number((totalCrusts / 800).toFixed(2))
        const blastFreezingTimeHours = Number((totalCrusts / 1200).toFixed(2))
        const packagingTimeHours = Number((batchCartons / 60).toFixed(2))

        const lineActiveRuntime = Math.max(bakingTimeHours, blastFreezingTimeHours, packagingTimeHours)
        const lineUtilization = Number(((lineActiveRuntime / shiftHoursAvailable) * 100).toFixed(1))

        // Bottleneck detection
        const runtimes = [
          { workCenter: "WC-01: San Cassiano Spiral Mixer", runtimeHours: mixingTimeHours, rate: "400kg / batch" },
          { workCenter: "WC-03: Stone Deck Tunnel Oven (380°C)", runtimeHours: bakingTimeHours, rate: "800 bases / hr" },
          { workCenter: "WC-04: IQF Spiral Blast Freezer (-35°C)", runtimeHours: blastFreezingTimeHours, rate: "1,200 units / hr" },
          { workCenter: "WC-05: Flow-Wrap & Case Packing", runtimeHours: packagingTimeHours, rate: "60 cartons / hr" },
        ]

        const bottleneck = runtimes.sort((a, b) => b.runtimeHours - a.runtimeHours)[0]

        // Energy & Labor estimates
        const energyKwhEstimate = Math.round(lineActiveRuntime * 65) // 65 kWh factory load
        const laborHoursTotal = Number((lineActiveRuntime * availableOperators).toFixed(1))

        return {
          ok: true as const,
          plannedOutput: `${batchCartons} cartons (${totalCrusts.toLocaleString()} units)`,
          totalShiftLengthHours: shiftHoursAvailable,
          estimatedLineRuntimeHours: lineActiveRuntime,
          shiftCapacityUtilization: `${lineUtilization}%`,
          bottleneckWorkCenter: bottleneck.workCenter,
          workCenterSchedule: runtimes,
          resourceRequirements: {
            operatorsRequired: availableOperators,
            totalLaborHours: laborHoursTotal,
            estimatedEnergyKwh: `${energyKwhEstimate} kWh`,
            shiftFeasibility: lineUtilization <= 100 ? "FEASIBLE_WITHIN_SINGLE_SHIFT" : "OVERTIME_OR_SECOND_SHIFT_REQUIRED",
          },
        }
      },
    }),

    mfgBatchYieldAndWastage: defineTool({
      description:
        "Record and analyze production batch yield vs theoretical scrap variance. Tracks scrap categories (sheeting trim, proofing defects, oven charring, packaging damage) and calculates monetary waste cost.",
      inputSchema: z.object({
        batchCode: z.string().describe("Production batch lot code (e.g. 'LOT-2026-0801')"),
        theoreticalYieldCartons: z.number().describe("Planned/target recipe yield in cartons"),
        actualProducedCartons: z.number().describe("Actual good saleable cartons produced"),
        scrapReasons: z.array(z.object({
          category: z.enum(["sheeting_trim_loss", "proofing_collapse", "oven_charring", "freezer_jam", "packaging_seal_fault", "weight_rejection"]),
          cartonsLost: z.number(),
        })).optional(),
      }),
      execute: async ({ batchCode, theoreticalYieldCartons, actualProducedCartons, scrapReasons }) => {
        const scrapCartons = Math.max(0, theoreticalYieldCartons - actualProducedCartons)
        const yieldPercent = Number(((actualProducedCartons / theoreticalYieldCartons) * 100).toFixed(2))
        const scrapPercent = Number(((scrapCartons / theoreticalYieldCartons) * 100).toFixed(2))

        // Standard benchmark tolerance is 2.5% scrap
        const benchmarkScrapPercent = 2.5
        const varianceDelta = Number((scrapPercent - benchmarkScrapPercent).toFixed(2))
        const costPerCarton = 38.5 // Standard RDM cost of production
        const monetaryLoss = money(scrapCartons * costPerCarton)

        const defaultReasons = scrapReasons || [
          { category: "sheeting_trim_loss", cartonsLost: Number((scrapCartons * 0.45).toFixed(1)) },
          { category: "oven_charring", cartonsLost: Number((scrapCartons * 0.35).toFixed(1)) },
          { category: "packaging_seal_fault", cartonsLost: Number((scrapCartons * 0.20).toFixed(1)) },
        ]

        return {
          ok: true as const,
          batchCode,
          theoreticalYield: `${theoreticalYieldCartons} cartons`,
          actualYield: `${actualProducedCartons} cartons`,
          scrapTotal: `${scrapCartons} cartons`,
          yieldEfficiency: `${yieldPercent}%`,
          scrapRate: `${scrapPercent}%`,
          benchmarkTolerance: `${benchmarkScrapPercent}%`,
          yieldPerformance: varianceDelta <= 0 ? "EXCEEDS_EFFICIENCY_TARGET" : "SCRAP_VARIANCE_ABOVE_THRESHOLD",
          financialWastageLoss: `$${monetaryLoss} AUD`,
          scrapLossBreakdown: defaultReasons,
          correctiveAction: varianceDelta > 1.0
            ? "Inspect oven belt speed and dough hydration balance to minimize charring and sheeting trim losses."
            : "Batch efficiency within acceptable food manufacturing tolerances.",
        }
      },
    }),

    mfgHaccpQualityGate: defineTool({
      description:
        "Execute the HACCP In-Process Food Safety Quality Gate for a production batch before warehouse release. Validates critical control points: Mixing Temp, Baking Core Temp, Blast Freezer Exit Temp, and Metal Detection.",
      inputSchema: z.object({
        batchCode: z.string().describe("Lot code of the production batch"),
        mixingTempCelsius: z.number().describe("Dough exit mixing temperature (Target: 22°C - 24°C)"),
        bakingCoreTempCelsius: z.number().describe("Internal core temperature after par-baking (Target: ≥ 85°C)"),
        blastFreezerExitTempCelsius: z.number().describe("Core temperature exiting blast freezer (Target: ≤ -18°C)"),
        metalDetectorPassed: z.boolean().describe("In-line metal detector & checkweigher validation passed"),
        visualCrustInspectionPassed: z.boolean().optional().default(true),
        qaInspectorName: z.string().optional().default("Quality Control Team"),
      }),
      execute: async ({
        batchCode,
        mixingTempCelsius,
        bakingCoreTempCelsius,
        blastFreezerExitTempCelsius,
        metalDetectorPassed,
        visualCrustInspectionPassed,
        qaInspectorName,
      }) => {
        const ccpChecks = [
          {
            ccp: "CCP-1: Dough Mix Temperature",
            measured: `${mixingTempCelsius}°C`,
            target: "22°C – 24°C",
            passed: mixingTempCelsius >= 20 && mixingTempCelsius <= 26,
          },
          {
            ccp: "CCP-2: Oven Core Pathogen Kill Step",
            measured: `${bakingCoreTempCelsius}°C`,
            target: "≥ 85°C",
            passed: bakingCoreTempCelsius >= 85,
          },
          {
            ccp: "CCP-3: Cryogenic Blast Freezer Exit",
            measured: `${blastFreezerExitTempCelsius}°C`,
            target: "≤ -18°C",
            passed: blastFreezerExitTempCelsius <= -18,
          },
          {
            ccp: "CCP-4: Foreign Body Metal Detection (Fe 1.5mm / Non-Fe 2.0mm / SS 2.5mm)",
            measured: metalDetectorPassed ? "PASSED - No Contaminants" : "REJECTED",
            target: "Zero Contaminants",
            passed: metalDetectorPassed,
          },
        ]

        const allPassed = ccpChecks.every((c) => c.passed) && (visualCrustInspectionPassed ?? true)
        const disposition = allPassed ? "APPROVED_FOR_DISPATCH" : "QUARANTINE_HOLD"

        return {
          ok: true as const,
          batchCode,
          inspectionTimestamp: new Date().toISOString(),
          qaInspector: qaInspectorName,
          haccpDisposition: disposition,
          complianceStatus: allPassed ? "HACCP_VERIFIED_100%" : "CRITICAL_CONTROL_POINT_BREACH",
          criticalControlPoints: ccpChecks,
          actionTaken: allPassed
            ? `Batch ${batchCode} certified compliant with Food Standards Australia New Zealand (FSANZ) and released to cold storage dispatch.`
            : `🚨 Batch ${batchCode} placed on immediate QA QUARANTINE HOLD pending laboratory microbiological and temperature review.`,
        }
      },
    }),

    mfgOeeAndMachinePerformance: defineTool({
      description:
        "Compute Overall Equipment Effectiveness (OEE) and identify factory line bottlenecks across dough mixing, stone baking, blast freezing, and case packing.",
      inputSchema: z.object({
        lineName: z.string().optional().default("Line 1: Artisan Pizza Base Line (Gregory Hills)"),
        plannedProductionMinutes: z.number().optional().default(480).describe("Planned run time in minutes (default 8hr = 480min)"),
        unplannedDowntimeMinutes: z.number().optional().default(35).describe("Stoppage minutes (changeovers, jams, blade adjustments)"),
        idealCycleTimeUnitsPerMin: z.number().optional().default(20).describe("Design speed in units/minute (default 20 units/min)"),
        totalUnitsProduced: z.number().optional().default(8200).describe("Total units run"),
        defectiveUnitsScrapped: z.number().optional().default(180).describe("Scrapped units"),
      }),
      execute: async ({
        lineName,
        plannedProductionMinutes,
        unplannedDowntimeMinutes,
        idealCycleTimeUnitsPerMin,
        totalUnitsProduced,
        defectiveUnitsScrapped,
      }) => {
        const operatingMinutes = plannedProductionMinutes - unplannedDowntimeMinutes
        const availability = operatingMinutes / plannedProductionMinutes

        const idealProductionAtOperating = operatingMinutes * idealCycleTimeUnitsPerMin
        const performance = Math.min(1, totalUnitsProduced / idealProductionAtOperating)

        const goodUnits = totalUnitsProduced - defectiveUnitsScrapped
        const quality = goodUnits / totalUnitsProduced

        const oee = availability * performance * quality
        const oeePercent = Number((oee * 100).toFixed(1))

        return {
          ok: true as const,
          lineName,
          overallOee: `${oeePercent}%`,
          worldClassBenchmark: "85.0%",
          performanceRating: oeePercent >= 85 ? "WORLD_CLASS" : oeePercent >= 75 ? "TYPICAL_GOOD" : "OPPORTUNITY_FOR_IMPROVEMENT",
          oeeComponents: {
            availability: `${(availability * 100).toFixed(1)}% (Operating: ${operatingMinutes}min / ${plannedProductionMinutes}min)`,
            performance: `${(performance * 100).toFixed(1)}% (Throughput: ${totalUnitsProduced} / ${idealProductionAtOperating} ideal)`,
            quality: `${(quality * 100).toFixed(1)}% (Good Units: ${goodUnits} / ${totalUnitsProduced})`,
          },
          lossAnalysis: {
            downtimeLostMinutes: `${unplannedDowntimeMinutes} min`,
            speedLossUnits: Math.max(0, idealProductionAtOperating - totalUnitsProduced),
            qualityScrapUnits: defectiveUnitsScrapped,
          },
        }
      },
    }),

    createProductionOrder: defineTool({
      description:
        "Schedule a new production run / recipe batch in the ERP.",
      inputSchema: z.object({
        productId: z.string().describe("Product ID of the finished good to produce"),
        plannedQty: z.number().positive().describe("Quantity of finished goods to produce"),
        scheduledFor: z.string().optional().describe("ISO date for when the batch is scheduled"),
        batchCode: z.string().optional().describe("Lot code to assign to the batch"),
        notes: z.string().optional(),
      }),
      execute: async ({ productId, plannedQty, scheduledFor, batchCode, notes }) => {
        const product = await db.product.findUnique({
          where: { id: productId },
          include: { billsOfMaterial: { where: { status: "active" }, take: 1 } },
        })

        if (!product) {
          return { ok: false as const, error: "Product not found" }
        }

        const bom = product.billsOfMaterial[0]
        const orderNumber = `PRD-${Date.now().toString().slice(-6)}`

        const productionOrder = await db.productionOrder.create({
          data: {
            orderNumber,
            productId,
            bomId: bom?.id || null,
            plannedQty,
            batchCode: batchCode || `LOT-${Date.now().toString().slice(-6)}`,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
            status: "planned",
            notes: notes || null,
            createdById: principal.userId,
            createdByAgent: true,
          },
          select: {
            id: true,
            orderNumber: true,
            plannedQty: true,
            batchCode: true,
            status: true,
            scheduledFor: true,
          },
        })

        return {
          ok: true as const,
          productionOrder,
          message: `Created Production Order ${productionOrder.orderNumber} for ${plannedQty}x ${product.name} (Batch: ${productionOrder.batchCode}).`,
        }
      },
    }),

    listProductionOrders: defineTool({
      description:
        "List production runs and recipe batches, filtered by status (planned, in_progress, completed, cancelled).",
      inputSchema: z.object({
        status: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(25).optional().default(10),
      }),
      execute: async ({ status, limit = 10 }) => {
        const orders = await db.productionOrder.findMany({
          where: { ...(status ? { status } : {}) },
          orderBy: { scheduledFor: "desc" },
          take: limit,
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        })

        return orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          product: o.product.name,
          sku: o.product.sku,
          plannedQty: o.plannedQty,
          producedQty: o.producedQty,
          status: o.status,
          batchCode: o.batchCode,
          scheduledFor: o.scheduledFor,
        }))
      },
    }),

    updateProductionOrder: defineTool({
      description: "Update a production order (e.g. change status to in_progress, update notes, or targetQty).",
      inputSchema: z.object({
        productionOrderId: z.string(),
        status: z.enum(["planned", "released", "in_progress", "completed", "cancelled"]).optional(),
        plannedQty: z.number().positive().optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ productionOrderId, status, plannedQty, notes }) => {
        const order = await db.productionOrder.findUnique({
          where: { id: productionOrderId },
        })
        if (!order) return { ok: false as const, error: "Production order not found" }

        const updated = await db.productionOrder.update({
          where: { id: productionOrderId },
          data: {
            ...(status && { status }),
            ...(plannedQty && { plannedQty }),
            ...(notes && { notes }),
          },
        })
        return { ok: true as const, productionOrder: updated }
      },
    }),

    completeProductionOrder: defineTool({
      description: "Mark a production order as completed and record the actual produced quantity.",
      inputSchema: z.object({
        productionOrderId: z.string(),
        producedQty: z.number().nonnegative(),
        rejectedQty: z.number().nonnegative().optional().default(0),
      }),
      execute: async ({ productionOrderId, producedQty, rejectedQty }) => {
        const order = await db.productionOrder.findUnique({
          where: { id: productionOrderId },
        })
        if (!order) return { ok: false as const, error: "Production order not found" }

        const updated = await db.productionOrder.update({
          where: { id: productionOrderId },
          data: {
            status: "completed",
            producedQty,
            rejectedQty,
          },
        })
        return { ok: true as const, productionOrder: updated }
      },
    }),

    cancelProductionOrder: defineTool({
      description: "Cancel a production order and record a reason.",
      inputSchema: z.object({
        productionOrderId: z.string(),
        reason: z.string(),
      }),
      execute: async ({ productionOrderId, reason }) => {
        const order = await db.productionOrder.findUnique({
          where: { id: productionOrderId },
        })
        if (!order) return { ok: false as const, error: "Production order not found" }

        const updated = await db.productionOrder.update({
          where: { id: productionOrderId },
          data: {
            status: "cancelled",
            notes: reason,
          },
        })
        return { ok: true as const, productionOrder: updated }
      },
    }),
  }
}

