import { NextRequest, NextResponse } from "next/server"

import { recalculateBankAccountBalance, refreshReconciliationSession } from "@/lib/accounting"
import { db } from "@/lib/db"

const prisma = db as any

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await prisma.bankTransaction.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Bank transaction not found" }, { status: 404 })
    }

    const updated = await prisma.bankTransaction.update({
      where: { id },
      data: {
        status: body.status?.trim() || existing.status,
        category: body.category !== undefined ? body.category?.trim() || null : existing.category,
        notes: body.notes !== undefined ? body.notes?.trim() || null : existing.notes,
        invoiceId: body.invoiceId !== undefined ? body.invoiceId || null : existing.invoiceId,
        expenseId: body.expenseId !== undefined ? body.expenseId || null : existing.expenseId,
        reconciliationSessionId:
          body.reconciliationSessionId !== undefined
            ? body.reconciliationSessionId || null
            : existing.reconciliationSessionId,
      },
    })

    await recalculateBankAccountBalance(existing.bankAccountId)

    if (updated.reconciliationSessionId) {
      await refreshReconciliationSession(updated.reconciliationSessionId)
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Bank transaction update error:", error)
    return NextResponse.json({ success: false, error: "Failed to update bank transaction" }, { status: 500 })
  }
}
