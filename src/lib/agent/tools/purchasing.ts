import { z } from "zod"

import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"
import { nextDocumentNumber } from "@/lib/numbering"
import { daysOfCover, demandRates, projectedStockoutDate, reorderPoint, sortByUrgency, suggestOrderQuantity, urgencyOf, type ReplenishmentLine } from "@/lib/replenishment"

/** Suppliers, purchase orders and reordering. Staff only. */

async function generatePoNumber() {
  const prefix = `PO-${new Date().getFullYear()}-`

  const last = await db.purchaseOrder.findFirst({
    where: { poNumber: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: { poNumber: true },
  })

  let next = 1001
  if (last) {
    const parts = last.poNumber.split("-")
    if (parts.length >= 3) {
      next = parseInt(parts[2]) + 1
    }
  }

  return `${prefix}${next.toString().padStart(5, "0")}`
}

export function buildPurchasingTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listSuppliers: defineTool({
      description: "List or search suppliers, with payment terms and open purchase order counts.",
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ query, limit }) => {
        const suppliers = await db.supplier.findMany({
          where: {
            status: "active",
            ...(query
              ? {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { tradingName: { contains: query, mode: "insensitive" } },
                    { contactPerson: { contains: query, mode: "insensitive" } },
                    { email: { contains: query, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          take: limit ?? 15,
          select: {
            id: true,
            name: true,
            contactPerson: true,
            email: true,
            phone: true,
            paymentTerms: true,
            _count: { select: { purchaseOrders: true } },
          },
        })

        return suppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          contact: supplier.contactPerson,
          email: supplier.email,
          phone: supplier.phone,
          paymentTerms: supplier.paymentTerms,
          purchaseOrders: supplier._count.purchaseOrders,
        }))
      },
    }),

    createSupplier: defineTool({
      description: "Create or register a new vendor/supplier in SupplySure OS.",
      inputSchema: z.object({
        name: z.string().describe("Supplier business name, e.g. 'Fresh Farm Dairy'"),
        tradingName: z.string().optional(),
        contactPerson: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        paymentTerms: z.number().int().min(0).max(180).optional().default(30),
        leadTimeDays: z.number().int().min(0).optional().default(2),
      }),
      execute: async (input) => {
        const supplier = await db.supplier.create({
          data: {
            name: input.name.trim(),
            tradingName: input.tradingName || null,
            contactPerson: input.contactPerson || null,
            email: input.email || null,
            phone: input.phone || null,
            paymentTerms: input.paymentTerms ?? 30,
            status: "active",
          },
          select: {
            id: true,
            name: true,
            contactPerson: true,
            email: true,
            phone: true,
            paymentTerms: true,
          },
        })

        return {
          ok: true as const,
          supplier,
          message: `Created supplier "${supplier.name}" (ID: ${supplier.id}).`,
        }
      },
    }),

    updateSupplier: defineTool({
      description: "Update an existing supplier's details, payment terms, or status.",
      inputSchema: z.object({
        supplierId: z.string(),
        name: z.string().optional(),
        contactPerson: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        paymentTerms: z.number().int().min(0).max(180).optional(),
        status: z.enum(["active", "inactive"]).optional(),
      }),
      execute: async ({ supplierId, ...patch }) => {
        const supplier = await db.supplier.update({
          where: { id: supplierId },
          data: patch,
          select: { id: true, name: true, contactPerson: true, status: true },
        })

        return {
          ok: true as const,
          supplier,
          message: `Updated supplier "${supplier.name}".`,
        }
      },
    }),

    replenishmentPlan: defineTool({
      description:
        "What to buy, worked out from how fast each product actually sells and how long its supplier takes. Unlike reorderSuggestions, which compares stock to a fixed threshold, this projects when each line runs out and orders enough to cover a target number of days. Use it for weekly buying decisions.",
      inputSchema: z.object({
        windowDays: z.number().int().min(7).max(180).optional().default(56)
          .describe("How much sales history to measure demand over"),
        targetCoverDays: z.number().int().min(7).max(120).optional().default(30)
          .describe("How many days of stock an order should buy"),
        onlyNeedingAction: z.boolean().optional().default(true),
      }),
      execute: async ({ windowDays = 56, targetCoverDays = 30, onlyNeedingAction = true }) => {
        const since = new Date(Date.now() - windowDays * 86400000)

        /**
         * Demand comes from what customers ordered, not from stock movements.
         * Movements only exist once an order dispatches, so measuring them
         * misses everything currently in the pipeline and understates demand
         * exactly when a business is busiest.
         */
        const lines = await db.salesOrderItem.findMany({
          where: {
            order: { orderDate: { gte: since }, status: { not: "cancelled" } },
          },
          select: { productId: true, quantity: true, order: { select: { orderDate: true } } },
        })

        const rates = demandRates(
          lines.map((l) => ({ productId: l.productId, quantity: l.quantity, at: l.order.orderDate })),
          windowDays
        )

        const inventory = await db.inventory.findMany({
          select: {
            productId: true, quantity: true, reserved: true, onOrder: true,
            product: {
              select: {
                sku: true, name: true,
                suppliers: {
                  select: {
                    costPrice: true, leadTime: true, minOrderQty: true, isPreferred: true,
                    supplier: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        })

        const plan: ReplenishmentLine[] = inventory.map((row) => {
          const rate = rates.get(row.productId)
          const perDay = rate?.perDay ?? 0
          const available = row.quantity - row.reserved

          // Preferred supplier first, then cheapest — the same rule the
          // reorder advice uses, so the two never disagree.
          const candidates = [...(row.product?.suppliers ?? [])]
          const chosen =
            candidates.filter((c) => c.isPreferred).sort((a, b) => a.costPrice - b.costPrice)[0] ??
            candidates.sort((a, b) => a.costPrice - b.costPrice)[0]

          const leadTimeDays = chosen?.leadTime ?? 7
          const cover = daysOfCover(available, perDay)
          const suggestion = suggestOrderQuantity({
            available, onOrder: row.onOrder, perDay, targetCoverDays,
            minOrderQty: chosen?.minOrderQty,
          })

          return {
            productId: row.productId,
            sku: row.product?.sku ?? "",
            name: row.product?.name ?? "",
            available,
            onOrder: row.onOrder,
            perDay,
            coverDays: cover,
            reorderPoint: reorderPoint(perDay, leadTimeDays),
            urgency: urgencyOf(cover, leadTimeDays),
            suggestedQty: suggestion.quantity,
            raisedToMinimum: suggestion.raisedToMinimum,
            stockoutOn: projectedStockoutDate(available, perDay),
            supplierName: chosen?.supplier?.name ?? null,
            supplierId: chosen?.supplier?.id ?? null,
            leadTimeDays,
            unitCost: chosen ? chosen.costPrice : null,
          }
        })

        const ranked = sortByUrgency(
          onlyNeedingAction ? plan.filter((l) => l.suggestedQty > 0 || l.urgency !== "ok") : plan
        )

        return {
          ok: true as const,
          measuredOver: `${windowDays} days of orders`,
          targetCoverDays,
          counts: {
            stockout: ranked.filter((l) => l.urgency === "stockout").length,
            urgent: ranked.filter((l) => l.urgency === "urgent").length,
            soon: ranked.filter((l) => l.urgency === "soon").length,
          },
          lines: ranked.slice(0, 40).map((l) => ({
            ...l,
            stockoutOn: l.stockoutOn ? l.stockoutOn.toISOString().slice(0, 10) : null,
            estimatedCost: l.unitCost !== null ? money(l.unitCost * l.suggestedQty) : null,
          })),
          note:
            "Demand is measured from customer orders, so it includes what has not shipped yet. Urgency compares days of cover against each supplier's lead time.",
        }
      },
    }),

    reorderSuggestions: defineTool({
      description:
        "Products at or below their reorder level, with the suggested reorder quantity and the cheapest supplier for each. Use this before raising purchase orders.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      execute: async ({ limit }) => {
        const rows = await db.inventory.findMany({
          take: limit ?? 25,
          select: {
            quantity: true,
            reserved: true,
            onOrder: true,
            reorderLevel: true,
            reorderQty: true,
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                costPrice: true,
                suppliers: {
                  select: {
                    costPrice: true,
                    leadTime: true,
                    minOrderQty: true,
                    isPreferred: true,
                    supplierSku: true,
                    supplier: { select: { id: true, name: true } },
                  },
                },
              },
            },
            warehouse: { select: { id: true, name: true } },
          },
        })

        return rows
          .filter((row) => row.quantity - row.reserved <= row.reorderLevel)
          .map((row) => {
            // A supplier marked preferred wins even when another is cheaper —
            // that flag is a deliberate commercial decision (a contract, a
            // reliability call), and the field this returns is named
            // `preferredSupplier`, which the old cost-only sort did not honour.
            const candidates = [...(row.product?.suppliers || [])]
            const chosen =
              candidates.filter((s) => s.isPreferred).sort((a, b) => a.costPrice - b.costPrice)[0] ??
              candidates.sort((a, b) => a.costPrice - b.costPrice)[0]

            // Never suggest less than the supplier will actually ship.
            const suggestedQty = Math.max(row.reorderQty, chosen?.minOrderQty ?? 0)

            return {
              productId: row.product?.id,
              sku: row.product?.sku,
              product: row.product?.name,
              warehouse: row.warehouse?.name,
              warehouseId: row.warehouse?.id,
              available: row.quantity - row.reserved,
              onOrder: row.onOrder,
              reorderLevel: row.reorderLevel,
              suggestedQty,
              // Flagged when the supplier's minimum forced the quantity up, so
              // nobody wonders why the number differs from the reorder qty.
              minOrderQty: chosen?.minOrderQty ?? null,
              raisedToMinimum: suggestedQty > row.reorderQty,
              preferredSupplier: chosen?.supplier?.name ?? null,
              preferredSupplierId: chosen?.supplier?.id ?? null,
              supplierSku: chosen?.supplierSku ?? null,
              isPreferredSupplier: chosen?.isPreferred ?? false,
              unitCost: chosen ? money(chosen.costPrice) : money(row.product?.costPrice || 0),
              leadTimeDays: chosen?.leadTime ?? null,
              // No link on file: the cost above is the product's own, and
              // nobody is named to buy from.
              hasSupplierLink: Boolean(chosen),
            }
          })
      },
    }),

    listPurchaseOrders: defineTool({
      description: "List purchase orders, newest first, optionally filtered by status or supplier.",
      inputSchema: z.object({
        status: z.string().optional().describe("draft, submitted, confirmed, partial, received, cancelled"),
        supplierId: z.string().optional(),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ status, supplierId, limit }) => {
        const orders = await db.purchaseOrder.findMany({
          where: { ...(status ? { status } : {}), ...(supplierId ? { supplierId } : {}) },
          orderBy: { createdAt: "desc" },
          take: limit ?? 10,
          select: {
            id: true,
            poNumber: true,
            status: true,
            totalAmount: true,
            orderDate: true,
            expectedDate: true,
            supplier: { select: { name: true } },
            _count: { select: { items: true } },
          },
        })

        return orders.map((order) => ({
          id: order.id,
          poNumber: order.poNumber,
          status: order.status,
          total: money(order.totalAmount),
          orderDate: order.orderDate,
          expectedDate: order.expectedDate,
          supplier: order.supplier?.name,
          lineCount: order._count.items,
        }))
      },
    }),

    getPurchaseOrder: defineTool({
      description: "Full detail of one purchase order including line items and received quantities.",
      inputSchema: z.object({ poNumberOrId: z.string() }),
      execute: async ({ poNumberOrId }) => {
        const order = await db.purchaseOrder.findFirst({
          where: { OR: [{ id: poNumberOrId }, { poNumber: poNumberOrId }] },
          select: {
            id: true,
            poNumber: true,
            status: true,
            subtotal: true,
            taxAmount: true,
            totalAmount: true,
            orderDate: true,
            expectedDate: true,
            receivedDate: true,
            notes: true,
            supplier: { select: { id: true, name: true, email: true } },
            items: {
              select: {
                id: true,
                quantity: true,
                receivedQty: true,
                unitCost: true,
                total: true,
                product: { select: { id: true, name: true, sku: true } },
              },
            },
          },
        })

        if (!order) {
          return { found: false as const }
        }

        return {
          found: true as const,
          ...order,
          total: money(order.totalAmount),
          items: order.items.map((item) => ({
            id: item.id,
            product: item.product?.name,
            sku: item.product?.sku,
            productId: item.product?.id,
            ordered: item.quantity,
            received: item.receivedQty,
            outstanding: item.quantity - item.receivedQty,
            unitCost: money(item.unitCost),
            total: money(item.total),
          })),
        }
      },
    }),

    createPurchaseOrder: defineTool({
      description:
        "Raise a purchase order with a supplier. Check reorderSuggestions first and read the total back before creating.",
      inputSchema: z.object({
        supplierId: z.string(),
        warehouseId: z.string().optional(),
        expectedDate: z.string().optional().describe("ISO date"),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().positive(),
            unitCost: z.number().positive().optional().describe("Defaults to the product cost price"),
          })
        ),
        estimatedTotal: z
          .number()
          .describe("Grand total including GST. Drives the auto-approval threshold - must be accurate."),
      }),
      execute: async ({ supplierId, warehouseId, expectedDate, notes, items }) => {
        const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
        if (!supplier) {
          return { ok: false as const, error: "Supplier not found" }
        }

        let subtotal = 0
        let taxAmount = 0
        const lines: Array<{
          productId: string
          quantity: number
          unitCost: number
          taxRate: number
          taxAmount: number
          total: number
        }> = []

        for (const item of items) {
          const product = await db.product.findUnique({ where: { id: item.productId } })
          if (!product) {
            return { ok: false as const, error: `Product ${item.productId} not found` }
          }

          const unitCost = item.unitCost ?? product.costPrice
          const lineSubtotal = unitCost * item.quantity
          const lineTax = lineSubtotal * (product.gstRate / 100)

          subtotal += lineSubtotal
          taxAmount += lineTax

          lines.push({
            productId: item.productId,
            quantity: item.quantity,
            unitCost,
            taxRate: product.gstRate,
            taxAmount: lineTax,
            total: lineSubtotal + lineTax,
          })
        }

        const order = await db.purchaseOrder.create({
          data: {
            poNumber: await nextDocumentNumber("purchaseOrder", {
              db,
              legacy: generatePoNumber,
            }),
            supplierId,
            warehouseId,
            companyId: supplier.companyId,
            expectedDate: expectedDate ? new Date(expectedDate) : null,
            notes,
            status: "draft",
            subtotal,
            taxAmount,
            totalAmount: subtotal + taxAmount,
            items: { create: lines },
          },
          select: { id: true, poNumber: true, totalAmount: true, status: true },
        })

        return {
          ok: true as const,
          poNumber: order.poNumber,
          purchaseOrderId: order.id,
          total: money(order.totalAmount),
          status: order.status,
        }
      },
    }),

    receivePurchaseOrder: defineTool({
      description:
        "Receive stock against a purchase order. Increases inventory, records stock movements, and closes the order when everything has arrived.",
      inputSchema: z.object({
        purchaseOrderId: z.string(),
        warehouseId: z.string().optional().describe("Defaults to the order's warehouse"),
        lines: z.array(z.object({ itemId: z.string(), receivedQty: z.number().int().positive() })),
      }),
      execute: async ({ purchaseOrderId, warehouseId, lines }) => {
        const order = await db.purchaseOrder.findUnique({
          where: { id: purchaseOrderId },
          select: {
            id: true,
            warehouseId: true,
            status: true,
            items: { select: { id: true, productId: true, quantity: true, receivedQty: true } },
          },
        })

        if (!order) {
          return { ok: false as const, error: "Purchase order not found" }
        }

        const targetWarehouse = warehouseId || order.warehouseId
        if (!targetWarehouse) {
          return { ok: false as const, error: "No warehouse to receive into" }
        }

        for (const line of lines) {
          const item = order.items.find((candidate) => candidate.id === line.itemId)
          if (!item) {
            continue
          }

          await db.purchaseOrderItem.update({
            where: { id: item.id },
            data: { receivedQty: item.receivedQty + line.receivedQty },
          })

          const existing = await db.inventory.findFirst({
            where: { productId: item.productId, warehouseId: targetWarehouse },
            select: { id: true },
          })

          if (existing) {
            await db.inventory.update({
              where: { id: existing.id },
              data: {
                quantity: { increment: line.receivedQty },
                onOrder: { decrement: Math.min(line.receivedQty, item.quantity) },
              },
            })
          } else {
            await db.inventory.create({
              data: {
                productId: item.productId,
                warehouseId: targetWarehouse,
                quantity: line.receivedQty,
              },
            })
          }

          await db.stockMovement.create({
            data: {
              productId: item.productId,
              warehouseId: targetWarehouse,
              type: "in",
              quantity: line.receivedQty,
              reference: purchaseOrderId,
              referenceType: "purchase_order",
              reason: "Received by agent",
            },
          })
        }

        const refreshed = await db.purchaseOrderItem.findMany({
          where: { poId: purchaseOrderId },
          select: { quantity: true, receivedQty: true },
        })

        const fullyReceived = refreshed.every((item) => item.receivedQty >= item.quantity)
        const status = fullyReceived ? "received" : "partial"

        await db.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { status, receivedDate: fullyReceived ? new Date() : null },
        })

        return { ok: true as const, status, fullyReceived }
      },
    }),
  }
}
