import type { Prisma, PrismaClient } from "@prisma/client"

import { allocateFefo, consumeBatches } from "@/lib/batches"
import { computeDueDate } from "@/lib/invoicing"
import { getSettings } from "@/lib/settings/service"
import { nextDocumentNumber } from "@/lib/numbering"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Takes stock off the shelf when goods physically leave.
 *
 * Until this existed, no path from order approval through pick, pack, dispatch,
 * delivery or invoice touched `Inventory.quantity` — an order could be shipped
 * and paid while on-hand never moved, so stock was overstated by everything
 * ever sold.
 *
 * Dispatch is the commit point: picking is a plan, and delivery is confirmation
 * of something that already left the building.
 *
 * Idempotent by design. Status can be re-sent, a webhook can retry, and a user
 * can double-click; the `StockMovement` ledger is the record of whether this
 * order has already been committed, so a second call is a no-op rather than a
 * second decrement.
 */
export async function commitStockForOrder(
  db: DbClient,
  orderId: string,
  options?: { userId?: string | null }
) {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      warehouseId: true,
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          shippedQty: true,
          warehouseId: true,
          product: { select: { name: true } },
        },
      },
    },
  })

  if (!order) {
    return { ok: false as const, error: "Order not found" }
  }

  const alreadyCommitted = await db.stockMovement.findFirst({
    where: { reference: order.orderNumber, referenceType: "sales_order" },
    select: { id: true },
  })

  if (alreadyCommitted) {
    return { ok: true as const, skipped: true as const, reason: "Stock already committed" }
  }

  const fallbackWarehouseId =
    order.warehouseId ||
    (await db.warehouse.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id ||
    null

  const committed: Array<{ product: string; quantity: number; batches: string[] }> = []
  const shortfalls: Array<{ product: string; requested: number; short: number; blocked: string[] }> = []

  for (const item of order.items) {
    const warehouseId = item.warehouseId || fallbackWarehouseId

    if (!warehouseId || item.quantity <= 0) {
      continue
    }

    // FEFO across tracked lots. Products with no batch history return no
    // allocations, which is expected — the stock decrement below is the source
    // of truth either way, and the batch ledger simply has nothing to draw on.
    const allocation = await allocateFefo({
      productId: item.productId,
      warehouseId,
      quantity: item.quantity,
      client: db,
    })

    if (allocation.allocations.length) {
      await consumeBatches(allocation.allocations, db)
    }

    if (!allocation.ok && (allocation.unallocated > 0 || allocation.blocked.length)) {
      // Recorded, not thrown. The goods are already on the truck by the time
      // this runs; refusing here would leave the order dispatched with stock
      // untouched, which is the bug being fixed.
      shortfalls.push({
        product: item.product.name,
        requested: item.quantity,
        short: allocation.unallocated,
        blocked: allocation.blocked.map((entry) => `${entry.batchCode} (${entry.reason})`),
      })
    }

    const inventory = await db.inventory.findFirst({
      where: { productId: item.productId, warehouseId },
      select: { id: true, avgCost: true },
    })

    if (inventory) {
      await db.inventory.update({
        where: { id: inventory.id },
        data: { quantity: { decrement: item.quantity } },
      })
    }

    await db.stockMovement.create({
      data: {
        productId: item.productId,
        warehouseId,
        inventoryId: inventory?.id || null,
        type: "out",
        // Negative, so summing the ledger reproduces on-hand.
        quantity: -item.quantity,
        reason: "Dispatched to customer",
        reference: order.orderNumber,
        referenceType: "sales_order",
        unitCost: inventory?.avgCost ?? 0,
        totalCost: Number(((inventory?.avgCost ?? 0) * item.quantity).toFixed(2)),
        userId: options?.userId || null,
      },
    })

    await db.salesOrderItem.update({
      where: { id: item.id },
      data: { shippedQty: item.quantity },
    })

    committed.push({
      product: item.product.name,
      quantity: item.quantity,
      batches: allocation.allocations.map((line) => line.batchCode),
    })
  }

  return { ok: true as const, skipped: false as const, committed, shortfalls }
}

async function getNextInvoiceNumber(db: DbClient) {
  const currentYear = new Date().getFullYear()
  const invoicePrefix = `INV-${currentYear}-`
  const lastInvoice = await db.invoice.findFirst({
    where: {
      invoiceNumber: {
        startsWith: invoicePrefix,
      },
    },
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  })

  let invoiceSequence = 1001
  if (lastInvoice) {
    const parts = lastInvoice.invoiceNumber.split("-")
    if (parts.length >= 3) {
      invoiceSequence = parseInt(parts[2]) + 1
    }
  }

  return `${invoicePrefix}${String(invoiceSequence).padStart(5, "0")}`
}

export async function ensureInvoiceForOrder(db: DbClient, orderId: string) {
  const existingInvoice = await db.invoice.findUnique({
    where: { orderId },
  })

  if (existingInvoice) {
    return existingInvoice
  }

  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        select: {
          creditBalance: true,
          creditLimit: true,
          creditStatus: true,
          // Stored and shown on screen since forever; never read until now,
          // so a Net 7 account got the same date as a Net 60 one.
          paymentTerms: true,
        },
      },
    },
  })

  if (!order) {
    return null
  }

  const invoiceNumber = await nextDocumentNumber("invoice", {
    db,
    companyId: order.companyId,
    legacy: () => getNextInvoiceNumber(db),
  })

  const issuedAt = new Date()
  const invoicingSettings = await getSettings("invoicing", { companyId: order.companyId })
  const dueDate = computeDueDate({
    issuedAt,
    paymentTerms: order.customer.paymentTerms,
    settings: invoicingSettings,
  })
  const nextCreditBalance = (order.customer.creditBalance || 0) + order.totalAmount

  const invoice = await db.invoice.create({
    data: {
      invoiceNumber,
      orderId: order.id,
      customerId: order.customerId,
      companyId: order.companyId || null,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      totalAmount: order.totalAmount,
      status: "unpaid",
      paidAmount: 0,
      outstandingAmt: order.totalAmount,
      dueDate,
    },
  })

  await db.customer.update({
    where: { id: order.customerId },
    data: {
      creditBalance: {
        increment: order.totalAmount,
      },
      creditStatus:
        order.customer.creditLimit > 0 && nextCreditBalance > order.customer.creditLimit
          ? "on_hold"
          : order.customer.creditStatus,
    },
  })

  await db.creditTransaction.create({
    data: {
      customerId: order.customerId,
      type: "invoice_charge",
      amount: order.totalAmount,
      balanceAfter: nextCreditBalance,
      description: `Invoice ${invoice.invoiceNumber} created for order ${order.orderNumber}`,
      referenceType: "invoice",
      referenceId: invoice.id,
    },
  })

  return invoice
}
