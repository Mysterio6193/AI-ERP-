import { NextRequest, NextResponse } from "next/server"

import { getDefaultCompanyId, refreshReconciliationSession } from "@/lib/accounting"
import { db } from "@/lib/db"

const prisma = db as any

export async function GET() {
  try {
    const companyId = await getDefaultCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const sessions = await prisma.reconciliationSession.findMany({
      where: { companyId },
      include: {
        bankAccount: true,
        transactions: true,
      },
      orderBy: [{ statementDate: "desc" }, { createdAt: "desc" }],
    })

    return NextResponse.json({ success: true, data: sessions })
  } catch (error) {
    console.error("Reconciliation fetch error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch reconciliation sessions" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getDefaultCompanyId()
    const body = await request.json()

    if (!companyId || !body.bankAccountId || body.statementBalance === undefined) {
      return NextResponse.json({ success: false, error: "Bank account and statement balance are required" }, { status: 400 })
    }

    const periodStart = body.periodStart ? new Date(body.periodStart) : null
    const periodEnd = body.periodEnd ? new Date(body.periodEnd) : null

    const candidateTransactions = await prisma.bankTransaction.findMany({
      where: {
        companyId,
        bankAccountId: body.bankAccountId,
        ...(periodStart || periodEnd
          ? {
              transactionDate: {
                ...(periodStart ? { gte: periodStart } : {}),
                ...(periodEnd ? { lte: periodEnd } : {}),
              },
            }
          : {}),
      },
    })

    const systemBalance = candidateTransactions.reduce((sum: number, transaction: any) => sum + Number(transaction.amount || 0), 0)
    const matchedCount = candidateTransactions.filter((item: any) => item.status === "matched").length
    const unmatchedCount = candidateTransactions.filter((item: any) => item.status !== "matched").length
    const difference = Number((Number(body.statementBalance) - systemBalance).toFixed(2))

    const session = await prisma.reconciliationSession.create({
      data: {
        bankAccountId: body.bankAccountId,
        statementDate: body.statementDate ? new Date(body.statementDate) : new Date(),
        periodStart,
        periodEnd,
        statementBalance: Number(body.statementBalance),
        systemBalance,
        difference,
        matchedCount,
        unmatchedCount,
        status: difference === 0 && unmatchedCount === 0 ? "balanced" : unmatchedCount > 0 ? "review_required" : "in_progress",
        notes: body.notes?.trim() || null,
        companyId,
        transactions: {
          connect: candidateTransactions.map((transaction: any) => ({ id: transaction.id })),
        },
      },
      include: {
        bankAccount: true,
        transactions: true,
      },
    })

    await prisma.bankAccount.update({
      where: { id: body.bankAccountId },
      data: { lastReconciledAt: new Date() },
    })

    await refreshReconciliationSession(session.id)

    return NextResponse.json({ success: true, data: session }, { status: 201 })
  } catch (error) {
    console.error("Reconciliation create error:", error)
    return NextResponse.json({ success: false, error: "Failed to create reconciliation session" }, { status: 500 })
  }
}
