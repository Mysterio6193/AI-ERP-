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

        // Matches the page/pageSize convention already used by src/app/api/crm/route.ts
        // rather than inventing a new one.
        const page = Math.max(Number(searchParams.get("page")) || 1, 1)
        const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 50, 1), 100)

        const where = {
            AND: [
                search
                    ? {
                        OR: [
                            { invoiceNumber: { contains: search, mode: "insensitive" as const } },
                            { customer: { name: { contains: search, mode: "insensitive" as const } } },
                        ],
                    }
                    : {},
                status ? { status: status } : {},
            ],
        }

        const [invoices, total] = await Promise.all([
            db.invoice.findMany({
                where,
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
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            db.invoice.count({ where }),
        ])

        // Map into the format expected by the frontend
        const mappedInvoices = invoices.map(invoice => ({
            ...invoice,
            items: invoice.order?.items || [],
            discountAmount: invoice.order?.discountAmount || 0,
            notes: invoice.order?.customerNotes || invoice.order?.internalNotes || "",
            balanceDue: invoice.outstandingAmt
        }))

        return NextResponse.json({
            success: true,
            data: mappedInvoices,
            meta: { total, page, pageSize, pageCount: Math.ceil(total / pageSize) },
        })
    } catch (error) {
        console.error("Error fetching invoices:", error)
        return NextResponse.json(
            { success: false, error: "Failed to fetch invoices" },
            { status: 500 }
        )
    }
}
