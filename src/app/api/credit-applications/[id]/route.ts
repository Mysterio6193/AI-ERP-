import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const application = await db.creditApplication.findUnique({
      where: { id },
      include: {
        customer: true,
      },
    })

    if (!application) {
      return NextResponse.json({ success: false, error: "Credit application not found" }, { status: 404 })
    }

    const nextStatus = body.status || application.status
    const approvedLimit =
      body.approvedLimit !== undefined && body.approvedLimit !== null
        ? Number(body.approvedLimit) || 0
        : application.approvedLimit
    const approvedTerms =
      body.approvedTerms !== undefined && body.approvedTerms !== null
        ? Number(body.approvedTerms) || 0
        : application.approvedTerms

    const updatedApplication = await db.creditApplication.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewNotes: body.reviewNotes?.trim() || null,
        approvedLimit,
        approvedTerms,
        reviewedBy: body.reviewedBy?.trim() || null,
        reviewedAt: ["approved", "rejected"].includes(nextStatus) ? new Date() : application.reviewedAt,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            creditLimit: true,
            creditStatus: true,
            status: true,
          },
        },
      },
    })

    if (nextStatus === "approved") {
      await db.customer.update({
        where: { id: application.customerId },
        data: {
          creditLimit:
            approvedLimit !== null && approvedLimit !== undefined
              ? approvedLimit
              : application.requestedLimit,
          paymentTerms:
            approvedTerms !== null && approvedTerms !== undefined
              ? approvedTerms
              : application.customer.paymentTerms,
          creditStatus: "active",
          status: application.customer.status === "inactive" ? "active" : application.customer.status,
        },
      })
    }

    if (nextStatus === "rejected" && application.customer.creditStatus === "on_hold") {
      await db.customer.update({
        where: { id: application.customerId },
        data: {
          creditStatus: "stopped",
        },
      })
    }

    return NextResponse.json({ success: true, data: updatedApplication })
  } catch (error) {
    console.error("Error updating credit application:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update credit application" },
      { status: 500 }
    )
  }
}
