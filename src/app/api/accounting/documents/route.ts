import { NextRequest, NextResponse } from "next/server"

import { getDefaultCompanyId, safeJsonParse } from "@/lib/accounting"
import { db } from "@/lib/db"

const prisma = db as any

export async function GET() {
  try {
    const companyId = await getDefaultCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const documents = await prisma.financeDocument.findMany({
      where: { companyId },
      orderBy: [{ createdAt: "desc" }],
    })

    return NextResponse.json({
      success: true,
      data: documents.map((document: any) => ({
        ...document,
        metadata: safeJsonParse(document.metadataJson, {}),
      })),
    })
  } catch (error) {
    console.error("Finance documents fetch error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch finance documents" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getDefaultCompanyId()
    const body = await request.json()

    if (!companyId || !body.documentType || !body.title) {
      return NextResponse.json({ success: false, error: "Document type and title are required" }, { status: 400 })
    }

    const document = await prisma.financeDocument.create({
      data: {
        documentType: String(body.documentType).trim(),
        title: String(body.title).trim(),
        fileName: body.fileName?.trim() || null,
        fileUrl: body.fileUrl?.trim() || null,
        status: body.status?.trim() || "ready",
        source: body.source?.trim() || "manual",
        periodStart: body.periodStart ? new Date(body.periodStart) : null,
        periodEnd: body.periodEnd ? new Date(body.periodEnd) : null,
        metadataJson: body.metadata ? JSON.stringify(body.metadata) : null,
        companyId,
      },
    })

    return NextResponse.json({ success: true, data: document }, { status: 201 })
  } catch (error) {
    console.error("Finance documents create error:", error)
    return NextResponse.json({ success: false, error: "Failed to save finance document" }, { status: 500 })
  }
}
