import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"

// GET /api/invoices - List all invoices
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdminUser(request, ["admin", "sales", "accounts"])
        if (auth.response) {
            return auth.response
        }

        const { searchParams } = new URL(request.url)
        const search = searchParams.get("search") || ""
        const status = searchParams.get("status") || ""

        const invoices = await db.invoice.findMany({
            where: {
                AND: [
                    search
                        ? {
                            OR: [
                                { invoiceNumber: { contains: search } },
                                { customer: { name: { contains: search } } },
                            ],
                        }
                        : {},
                    status ? { status: status } : {},
                ],
            },
            include: {
                customer: {
                    include: {
                        locations: true,
                    },
                },
                order: {
                    include: {
                        items: {
                            include: {
                                product: true
                            }
                        }
                    }
                },
                payments: true
            },
            orderBy: { invoiceDate: "desc" },
        })

        // Map into the format expected by the frontend
        const mappedInvoices = invoices.map(invoice => ({
            ...invoice,
            items: invoice.order?.items || [],
            discountAmount: invoice.order?.discountAmount || 0,
            notes: invoice.order?.customerNotes || invoice.order?.internalNotes || "",
            balanceDue: invoice.outstandingAmt
        }))

        return NextResponse.json({ success: true, data: mappedInvoices })
    } catch (error) {
        console.error("Error fetching invoices:", error)
        return NextResponse.json(
            { success: false, error: "Failed to fetch invoices" },
            { status: 500 }
        )
    }
}
