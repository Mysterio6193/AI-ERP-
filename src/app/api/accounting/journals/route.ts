import { NextRequest, NextResponse } from "next/server"

import { buildEntryNumber, ensureDefaultChartOfAccounts, getDefaultCompanyId } from "@/lib/accounting"
import { db } from "@/lib/db"

const prisma = db as any

export async function GET() {
  try {
    const companyId = await getDefaultCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const journals = await prisma.journalEntry.findMany({
      where: { companyId },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    })

    return NextResponse.json({ success: true, data: journals })
  } catch (error) {
    console.error("Journal fetch error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch journals" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getDefaultCompanyId()
    const body = await request.json()
    const lines = Array.isArray(body.lines) ? body.lines : []

    if (!companyId || !body.description || lines.length < 2) {
      return NextResponse.json({ success: false, error: "Description and at least two journal lines are required" }, { status: 400 })
    }

    await ensureDefaultChartOfAccounts(companyId)

    const normalizedLines = lines.map((line: any) => ({
      accountId: String(line.accountId || "").trim(),
      description: line.description?.trim() || null,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    }))

    const totalDebit = normalizedLines.reduce((sum: number, line: any) => sum + line.debit, 0)
    const totalCredit = normalizedLines.reduce((sum: number, line: any) => sum + line.credit, 0)

    if (!normalizedLines.every((line: any) => line.accountId) || Math.abs(totalDebit - totalCredit) > 0.001) {
      return NextResponse.json({ success: false, error: "Journal must balance and include valid accounts" }, { status: 400 })
    }

    const status = body.status === "posted" ? "posted" : "draft"

    const journal = await prisma.$transaction(async (tx: any) => {
      const created = await tx.journalEntry.create({
        data: {
          entryNumber: buildEntryNumber("JRN"),
          date: body.date ? new Date(body.date) : new Date(),
          description: String(body.description).trim(),
          referenceType: body.referenceType?.trim() || null,
          referenceId: body.referenceId?.trim() || null,
          status,
          totalDebit,
          totalCredit,
          postedBy: status === "posted" ? "system" : null,
          postedAt: status === "posted" ? new Date() : null,
          companyId,
          lines: {
            create: normalizedLines,
          },
        },
        include: {
          lines: true,
        },
      })

      if (status === "posted") {
        for (const line of normalizedLines) {
          const account = await tx.chartOfAccount.findUnique({ where: { id: line.accountId } })
          if (!account) continue

          const delta =
            account.normalSide === "debit"
              ? line.debit - line.credit
              : line.credit - line.debit

          await tx.chartOfAccount.update({
            where: { id: line.accountId },
            data: {
              balance: Number(account.balance || 0) + delta,
            },
          })
        }
      }

      return created
    })

    return NextResponse.json({ success: true, data: journal }, { status: 201 })
  } catch (error) {
    console.error("Journal create error:", error)
    return NextResponse.json({ success: false, error: "Failed to create journal entry" }, { status: 500 })
  }
}
