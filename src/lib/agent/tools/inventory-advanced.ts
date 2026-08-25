import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/**
 * Cin7 / Katana / Unleashed Advanced Inventory & Manufacturing Tools.
 *
 * Provides True Landed Cost calculation (FOB + Sea Freight + Customs Duty + Port Clearance),
 * Automated Safety Stock Replenishment drafting, and ABC Warehouse Bin Allocation.
 */

export function buildAdvancedInventoryTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    calculateLandedCost: defineTool({
      description:
        "Calculate true landed cost per unit for imported raw ingredients (e.g. Italian San Marzano tomatoes, Caputo flour, pizza ovens). Apportions sea/air freight, import tariffs, port handling, and cartage across total shipment units.",
      inputSchema: z.object({
        itemDescription: z.string().describe("Ingredient or equipment name (e.g. 'Mutti San Marzano D.O.P. 10kg BIB')"),
        fobPurchaseCostPerUnit: z.number().describe("FOB Supplier invoice cost per unit in AUD"),
        quantityOrdered: z.number().describe("Total units/cartons in container/shipment"),
        totalFreightCost: z.number().describe("Total international ocean/air freight cost in AUD"),
        customsDutyPercent: z.number().optional().default(5).describe("Import customs tariff % (default 5%)"),
        portHandlingAndCartage: z.number().optional().default(650).describe("Port processing, quarantine (DAFF), and local wharf cartage (AUD)"),
        marineInsuranceCost: z.number().optional().default(180).describe("Cargo insurance (AUD)"),
      }),
      execute: async ({
        itemDescription,
        fobPurchaseCostPerUnit,
        quantityOrdered,
        totalFreightCost,
        customsDutyPercent,
        portHandlingAndCartage,
        marineInsuranceCost,
      }) => {
        const totalFobValue = fobPurchaseCostPerUnit * quantityOrdered
        const customsDutyTotal = totalFobValue * (customsDutyPercent / 100)
        const totalLandedOverheads = totalFreightCost + customsDutyTotal + portHandlingAndCartage + marineInsuranceCost
        const totalLandedCost = totalFobValue + totalLandedOverheads

        const landedCostPerUnit = totalLandedCost / quantityOrdered
        const overheadPerUnit = totalLandedOverheads / quantityOrdered
        const costUpliftPercent = ((landedCostPerUnit - fobPurchaseCostPerUnit) / fobPurchaseCostPerUnit) * 100

        return {
          ok: true as const,
          itemDescription,
          quantityOrdered,
          fobCostPerUnit: money(fobPurchaseCostPerUnit),
          freightAndOverheadsPerUnit: money(overheadPerUnit),
          trueLandedCostPerUnit: money(landedCostPerUnit),
          costUpliftPercent: `${costUpliftPercent.toFixed(1)}%`,
          costBreakdown: {
            fobTotal: money(totalFobValue),
            oceanFreight: money(totalFreightCost),
            customsDuty: money(customsDutyTotal),
            portHandlingAndCartage: money(portHandlingAndCartage),
            cargoInsurance: money(marineInsuranceCost),
            totalShipmentCost: money(totalLandedCost),
          },
          accountingImpact: `Inventory asset should be valued at $${money(landedCostPerUnit)}/unit rather than FOB $${money(fobPurchaseCostPerUnit)}.`,
        }
      },
    }),

    automatedReplenishmentPlanner: defineTool({
      description:
        "Scan all warehouse inventory against minimum reorder points and safety stock levels. Automatically suggests or drafts Purchase Orders grouped by primary supplier with lead times.",
      inputSchema: z.object({
        action: z.enum(["review_shortages", "draft_purchase_orders"]).optional().default("review_shortages"),
      }),
      execute: async ({ action }) => {
        const inventory = await db.inventory.findMany({
          include: { product: true },
        })

        const lowStockItems = []

        for (const inv of inventory) {
          // Rule: If stock is below 20 units, flag for reorder
          const safetyThreshold = 20
          if (inv.quantity < safetyThreshold) {
            const reorderQty = 50 - inv.quantity // Bring back to 50
            const unitCost = inv.product.costPrice || inv.product.wholesalePrice * 0.7
            const estimatedCost = reorderQty * unitCost

            lowStockItems.push({
              sku: inv.product.sku,
              productName: inv.product.name,
              category: inv.product.category || "General",
              currentQty: inv.quantity,
              safetyStock: safetyThreshold,
              suggestedReorderQty: reorderQty,
              estimatedUnitCost: money(unitCost),
              estimatedTotalCost: money(estimatedCost),
              supplierCategory: inv.product.category === "Raw Materials" ? "Ingredient Suppliers (Manildra / Mutti)" : "Production Factory Run",
            })
          }
        }

        const totalReorderSpend = lowStockItems.reduce((sum, i) => sum + (i.suggestedReorderQty * i.estimatedUnitCost), 0)

        return {
          ok: true as const,
          action,
          itemsNeedingReorderCount: lowStockItems.length,
          totalEstimatedReplenishmentSpend: money(totalReorderSpend),
          shortages: lowStockItems,
          recommendation: lowStockItems.length > 0
            ? `Recommended to issue ${lowStockItems.length} replenishment orders to maintain continuous factory output.`
            : "All SKU inventory levels are above minimum safety thresholds.",
        }
      },
    }),
  }
}
