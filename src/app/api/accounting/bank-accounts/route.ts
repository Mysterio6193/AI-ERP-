import { NextRequest, NextResponse } from "next/server"

import { ensureDefaultBankAccount, getDefaultCompanyId } from "@/lib/accounting"
import { db } from "@/lib/db"

const prisma = db as any

export async function GET() {
  try {
    const companyId = await getDefaultCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: true, data: [] })
    }

    await ensureDefaultBankAccount(companyId)

    const accounts = await prisma.bankAccount.findMany({
      where: { companyId },
      include: {
        _count: {
          select: {
            transactions: true,
            reconciliations: true,
          },
        },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    })

    return NextResponse.json({ success: true, data: accounts })
  } catch (error) {
    console.error("Bank accounts fetch error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch bank accounts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getDefaultCompanyId()
    const body = await request.json()

    if (!companyId || !body.name || !body.bankName || !body.accountNumber) {
      return NextResponse.json({ success: false, error: "Name, bank name, and account number are required" }, { status: 400 })
    }

    if (body.isDefault) {
      await prisma.bankAccount.updateMany({
        where: { companyId },
        data: { isDefault: false },
      })
    }

    const account = await prisma.bankAccount.create({
      data: {
        name: String(body.name).trim(),
        bankName: String(body.bankName).trim(),
        accountNumber: String(body.accountNumber).trim(),
        bsb: body.bsb?.trim() || null,
        ifscCode: body.ifscCode?.trim() || null,
        upiId: body.upiId?.trim() || null,
        currency: body.currency?.trim() || "AUD",
        provider: body.provider?.trim() || "manual",
        connectionStatus: body.connectionStatus?.trim() || "manual",
        isDefault: Boolean(body.isDefault),
        companyId,
      },
    })

    return NextResponse.json({ success: true, data: account }, { status: 201 })
  } catch (error) {
    console.error("Bank account create error:", error)
    return NextResponse.json({ success: false, error: "Failed to save bank account" }, { status: 500 })
  }
}
