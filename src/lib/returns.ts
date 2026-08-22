import type { Prisma, PrismaClient } from "@prisma/client"

import { receiveBatch } from "@/lib/batches"
import { db } from "@/lib/db"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * The returns lifecycle.
 *
 * Two things were wrong. Stock was put back at **creation**, while the goods
 * were still at the customer and the return sat `pending` — so anything logged
 * was immediately sellable again. And no `CreditNote` was ever created, so
 * `refundAmount` was recorded and then affected nothing: the customer stayed
 * billed in full for goods they had sent back.
 *
 * The lifecycle is now: pending → approved → received (stock returns here) →
 * completed (credit note issued).
 */

export const RETURN_STATUSES = ["pending", "approved", "received", "completed", "rejected"] as const
export type ReturnStatus = (typeof RETURN_STATUSES)[number]

const ALLOWED: Record<ReturnStatus, ReturnStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["received", "rejected"],
  received: ["completed"],
  completed: [],
  rejected: [],
}

export function canTransition(from: string, to: string) {
  const allowed = ALLOWED[from as ReturnStatus]
  return Boolean(allowed?.includes(to as ReturnStatus))
}

async function nextCreditNoteNumber(client: DbClient) {
  const year = new Date().getFullYear()
  const prefix = `CN-${year}-`

  const last = await client.creditNote.findFirst({
    where: { cnNumber: { startsWith: prefix } },
    orderBy: { cnNumber: "desc" },
    select: { cnNumber: true },
  })

  const sequence = last ? Number(last.cnNumber.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(sequence).padStart(4, "0")}`
}

/**
 * Puts returned goods back on the shelf.
 *
 * Only saleable condition restocks — damaged or return-to-supplier stock is
 * recorded on the return but must not become sellable again. Idempotent on the
 * movement ledger, like dispatch.
 */
export async function receiveReturn(
  returnId: string,
  options?: { warehouseId?: string; userId?: string | null }
) {
  return db.$transaction(async (tx) => {
    const record = await tx.return.findUnique({
      where: { id: returnId },
      include: { items: { include: { product: { select: { name: true, shelfLifeDays: true } } } } },
    })

    if (!record) {
      return { ok: false as const, error: "Return not found" }
    }

    // Order matters: an already-received return should say so, not be told to
    // get approved. The generic transition message is the fallback.
    if (record.status === "received" || record.status === "completed") {
      return {
        ok: false as const,
        error: `${record.returnNumber} was already received into stock`,
      }
    }

    if (!canTransition(record.status, "received")) {
      return {
        ok: false as const,
        error: `A ${record.status} return cannot be received. Approve it first.`,
      }
    }

    const already = await tx.stockMovement.findFirst({
      where: { reference: record.returnNumber, referenceType: "customer_return" },
      select: { id: true },
    })

    if (already) {
      return { ok: false as const, error: "This return has already been received into stock" }
    }

    const warehouse =
      (options?.warehouseId
        ? await tx.warehouse.findUnique({ where: { id: options.warehouseId }, select: { id: true } })
        : null) ||
      (await tx.warehouse.findFirst({ where: { isDefault: true }, select: { id: true } })) ||
      (await tx.warehouse.findFirst({ select: { id: true } }))

    if (!warehouse) {
      return { ok: false as const, error: "No warehouse available to receive into" }
    }

    const restocked: Array<{ product: string; quantity: number }> = []
    const quarantined: Array<{ product: string; quantity: number; condition: string }> = []

    for (const item of record.items) {
      if (item.condition !== "saleable") {
        // Recorded, deliberately not restocked. Damaged goods becoming
        // sellable again is the failure this lifecycle exists to prevent.
        quarantined.push({
          product: item.product.name,
          quantity: item.quantity,
          condition: item.condition,
        })
        continue
      }

      const inventory = await tx.inventory.upsert({
        where: {
          productId_warehouseId: { productId: item.productId, warehouseId: warehouse.id },
        },
        create: {
          productId: item.productId,
          warehouseId: warehouse.id,
          quantity: item.quantity,
          reorderLevel: 10,
          reorderQty: 50,
        },
        update: { quantity: { increment: item.quantity } },
        select: { id: true },
      })

      // Returned stock re-enters the lot ledger under its own code, so it is
      // distinguishable from original production in a later recall.
      await receiveBatch(
        {
          productId: item.productId,
          warehouseId: warehouse.id,
          batchCode: `RET-${record.returnNumber}`,
          quantity: item.quantity,
          expiryDate: item.product.shelfLifeDays
            ? new Date(Date.now() + item.product.shelfLifeDays * 86400_000)
            : null,
          sourceType: "adjustment",
        },
        tx
      )

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          warehouseId: warehouse.id,
          inventoryId: inventory.id,
          type: "in",
          quantity: item.quantity,
          reason: `Customer return ${record.returnNumber}`,
          reference: record.returnNumber,
          referenceType: "customer_return",
          userId: options?.userId || null,
        },
      })

      restocked.push({ product: item.product.name, quantity: item.quantity })
    }

    const updated = await tx.return.update({
      where: { id: returnId },
      data: { status: "received" },
    })

    return { ok: true as const, return: updated, restocked, quarantined }
  })
}

/**
 * Issues the credit note and reduces what the customer owes.
 *
 * `refundAmount` was stored and then read by nothing, so a customer remained
 * billed in full for returned goods. The credit note is applied against the
 * originating invoice where there is one, and the credit balance is reduced
 * either way.
 */
export async function completeReturn(returnId: string, options?: { userId?: string | null }) {
  return db.$transaction(async (tx) => {
    const record = await tx.return.findUnique({
      where: { id: returnId },
      include: { items: true },
    })

    if (!record) {
      return { ok: false as const, error: "Return not found" }
    }

    if (!canTransition(record.status, "completed")) {
      return {
        ok: false as const,
        error: `A ${record.status} return cannot be completed. Receive the goods first.`,
      }
    }

    const refund = Number(
      record.items.reduce((sum, item) => sum + (item.refundAmount || 0), 0).toFixed(2)
    )

    const net = Number(Math.max(refund - (record.restockFee || 0), 0).toFixed(2))

    if (net <= 0) {
      const updated = await tx.return.update({
        where: { id: returnId },
        data: { status: "completed" },
      })

      return { ok: true as const, return: updated, creditNote: null, refunded: 0 }
    }

    const invoice = record.orderId
      ? await tx.invoice.findUnique({
          where: { orderId: record.orderId },
          select: { id: true, invoiceNumber: true },
        })
      : null

    const creditNote = await tx.creditNote.create({
      data: {
        cnNumber: await nextCreditNoteNumber(tx),
        invoiceId: invoice?.id || null,
        customerId: record.customerId,
        amount: net,
        reason: record.reason || `Return ${record.returnNumber}`,
        status: "active",
        appliedToInvoice: invoice?.id || null,
        appliedAmount: invoice ? net : 0,
      },
    })

    // Reduce what they owe. Atomic, so a concurrent invoice charge is not lost.
    const customer = await tx.customer.update({
      where: { id: record.customerId },
      data: { creditBalance: { decrement: net } },
      select: { creditBalance: true, creditLimit: true, creditStatus: true },
    })

    if (
      customer.creditStatus === "on_hold" &&
      (customer.creditLimit <= 0 || customer.creditBalance <= customer.creditLimit)
    ) {
      await tx.customer.update({
        where: { id: record.customerId },
        data: { creditStatus: "active" },
      })
    }

    await tx.creditTransaction.create({
      data: {
        customerId: record.customerId,
        type: "refund",
        amount: -net,
        balanceAfter: customer.creditBalance,
        description: `Credit note ${creditNote.cnNumber} for return ${record.returnNumber}`,
        referenceType: "credit_note",
        referenceId: creditNote.id,
      },
    })

    const updated = await tx.return.update({
      where: { id: returnId },
      data: { status: "completed", refundAmount: net },
    })

    return { ok: true as const, return: updated, creditNote, refunded: net }
  })
}

/** Approve or reject. Neither moves stock or money. */
export async function setReturnStatus(
  returnId: string,
  status: "approved" | "rejected",
  options?: { notes?: string }
) {
  const record = await db.return.findUnique({
    where: { id: returnId },
    select: { status: true },
  })

  if (!record) {
    return { ok: false as const, error: "Return not found" }
  }

  if (!canTransition(record.status, status)) {
    return { ok: false as const, error: `Cannot move a ${record.status} return to ${status}` }
  }

  const updated = await db.return.update({
    where: { id: returnId },
    data: { status, internalNotes: options?.notes ?? undefined },
  })

  return { ok: true as const, return: updated }
}
