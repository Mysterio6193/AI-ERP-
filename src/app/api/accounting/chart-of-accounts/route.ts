import { NextRequest, NextResponse } from "next/server"

import { ensureDefaultChartOfAccounts, getDefaultCompanyId } from "@/lib/accounting"
import { db } from "@/lib/db"

const prisma = db as any

export async function GET() {
  try {
    const companyId = await getDefaultCompanyId()
    const accounts = await ensureDefaultChartOfAccounts(companyId)
    return NextResponse.json({ success: true, data: accounts })
  } catch (error) {
    console.error("Chart of accounts fetch error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch chart of accounts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const companyId = await getDefaultCompanyId()

    if (!companyId || !body.code || !body.name || !body.accountType) {
      return NextResponse.json({ success: false, error: "Code, name, and account type are required" }, { status: 400 })
    }

    const account = await prisma.chartOfAccount.create({
      data: {
        code: String(body.code).trim(),
        name: String(body.name).trim(),
        accountType: String(body.accountType).trim(),
        subType: body.subType?.trim() || null,
        normalSide: body.normalSide === "credit" ? "credit" : "debit",
        description: body.description?.trim() || null,
        companyId,
      },
    })

    return NextResponse.json({ success: true, data: account }, { status: 201 })
  } catch (error) {
    console.error("Chart of accounts create error:", error)
    return NextResponse.json({ success: false, error: "Failed to create account" }, { status: 500 })
  }
}
