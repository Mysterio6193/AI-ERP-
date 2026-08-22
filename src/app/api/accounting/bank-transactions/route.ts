import { NextRequest, NextResponse } from "next/server"

import { getDefaultCompanyId, recalculateBankAccountBalance } from "@/lib/accounting"
import { db } from "@/lib/db"

const prisma = db as any

export async function GET(request: NextRequest) {
  try {
    const companyId = await getDefaultCompanyId()
    const { searchParams } = new URL(request.url)
    const bankAccountId = searchParams.get("bankAccountId")
    const status = searchParams.get("status")

    if (!companyId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const transactions = await prisma.bankTransaction.findMany({
      where: {
        companyId,
        ...(bankAccountId ? { bankAccountId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        bankAccount: true,
        invoice: {
          select: { id: true, invoiceNumber: true },
        },
        expense: {
          select: { id: true, expenseNumber: true, description: true },
        },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    })

    return NextResponse.json({ success: true, data: transactions })
  } catch (error) {
    console.error("Bank transactions fetch error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch bank transactions" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getDefaultCompanyId()
    const body = await request.json()

    if (!companyId || !body.bankAccountId || !body.description || body.amount === undefined) {
      return NextResponse.json({ success: false, error: "Bank account, description, and amount are required" }, { status: 400 })
    }

    const rawAmount = Number(body.amount || 0)
    const isMoneyOut = body.direction === "money_out" || rawAmount < 0
    const amount = isMoneyOut ? -Math.abs(rawAmount) : Math.abs(rawAmount)

    const transaction = await prisma.bankTransaction.create({
      data: {
        bankAccountId: body.bankAccountId,
        transactionDate: body.transactionDate ? new Date(body.transactionDate) : new Date(),
        description: String(body.description).trim(),
        reference: body.reference?.trim() || null,
        amount,
        direction: isMoneyOut ? "money_out" : "money_in",
        category: body.category?.trim() || null,
        status: body.status?.trim() || "unmatched",
        source: body.source?.trim() || "manual",
        externalId: body.externalId?.trim() || null,
        counterparty: body.counterparty?.trim() || null,
        balanceAfter: body.balanceAfter !== undefined ? Number(body.balanceAfter) : null,
        notes: body.notes?.trim() || null,
        invoiceId: body.invoiceId || null,
        expenseId: body.expenseId || null,
        companyId,
      },
      include: {
        bankAccount: true,
      },
    })

    await recalculateBankAccountBalance(body.bankAccountId)

    return NextResponse.json({ success: true, data: transaction }, { status: 201 })
  } catch (error) {
    console.error("Bank transaction create error:", error)
    return NextResponse.json({ success: false, error: "Failed to save bank transaction" }, { status: 500 })
  }
}
