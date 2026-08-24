import { z } from "zod"

import { db } from "@/lib/db"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"
import { nextDocumentNumber } from "@/lib/numbering"

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
        cursor: z.string().optional().describe("ID of the last item from previous page for cursor pagination"),
        page: z.number().int().min(1).optional().describe("Page number (1-based)"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of items to fetch (max 100)")
      }),
      execute: async ({ query, cursor, page, limit }) => {
        const _limit = limit ?? 20;
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
          take: _limit,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : page ? (page - 1) * _limit : 0,
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

        const items = suppliers.map((supplier) => ({
id: supplier.id,
          name: supplier.name,
          contact: supplier.contactPerson,
          email: supplier.email,
          phone: supplier.phone,
          paymentTerms: supplier.paymentTerms,
          purchaseOrders: supplier._count.purchaseOrders,
        }));
        return {
          items,
          nextCursor: suppliers.length === _limit ? suppliers[suppliers.length - 1].id : undefined
        }
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

    reorderSuggestions: defineTool({
      description:
        "Products at or below their reorder level, with the suggested reorder quantity and the cheapest supplier for each. Use this before raising purchase orders.",
      inputSchema: z.object({ cursor: z.string().optional().describe("ID of the last item from previous page for cursor pagination"),
        page: z.number().int().min(1).optional().describe("Page number (1-based)"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of items to fetch (max 100)") }),
      execute: async ({ cursor, page, limit }) => {
        const _limit = limit ?? 20;
        const rows = await db.inventory.findMany({
          take: _limit,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : page ? (page - 1) * _limit : 0,
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
        cursor: z.string().optional().describe("ID of the last item from previous page for cursor pagination"),
        page: z.number().int().min(1).optional().describe("Page number (1-based)"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of items to fetch (max 100)")
      }),
      execute: async ({ status, supplierId, cursor, page, limit }) => {
        const _limit = limit ?? 20;
        const orders = await db.purchaseOrder.findMany({
          where: { ...(status ? { status } : {}), ...(supplierId ? { supplierId } : {}) },
          orderBy: { createdAt: "desc" },
          take: _limit,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : page ? (page - 1) * _limit : 0,
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

        const items = orders.map((order) => ({
id: order.id,
          poNumber: order.poNumber,
          status: order.status,
          total: money(order.totalAmount),
          orderDate: order.orderDate,
          expectedDate: order.expectedDate,
          supplier: order.supplier?.name,
          lineCount: order._count.items,
        }));
        return {
          items,
          nextCursor: orders.length === _limit ? orders[orders.length - 1].id : undefined
        }
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

    closePurchaseOrder: defineTool({
      description: "Short-close a purchase order when the supplier cannot fulfill the remaining balance.",
      inputSchema: z.object({
        purchaseOrderId: z.string(),
        reason: z.string(),
      }),
      execute: async ({ purchaseOrderId, reason }) => {
        const order = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId } })
        if (!order) return { ok: false as const, error: "Purchase order not found" }

        const updated = await db.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: {
            status: "cancelled", // or 'closed' but schema seems to use cancelled for unfulfilled closures
            internalNotes: reason,
          },
        })
        return { ok: true as const, purchaseOrder: updated }
      },
    }),
  }
}
