import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdminUser(request, ROLE_SETS.staff)
        if (!auth.user) return auth.response

        const returns = await db.return.findMany({
            include: {
                customer: true,
                order: true,
                items: {
                    include: {
                        product: true,
                        variant: true
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        })

        return NextResponse.json({ success: true, data: returns })
    } catch (error) {
        console.error("Error fetching returns:", error)
        return NextResponse.json(
            { success: false, error: "Failed to fetch returns" },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdminUser(request, ROLE_SETS.commercial)
        if (!auth.user) return auth.response

        const body = await request.json()
        const { orderId, customerId, reason, notes, items } = body

        if (!customerId || !items || !items.length) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            )
        }

        // Generate return number
        const count = await db.return.count()
        const returnNumber = `RET-${1000 + count + 1}`

        // Calculate totals
        const totalAmount = items.reduce((acc: number, item: any) => acc + (item.refundAmount || 0), 0)

        // Execute everything in a transaction
        const result = await db.$transaction(async (tx) => {
            // 1. Create Return
            const newReturn = await tx.return.create({
                data: {
                    returnNumber,
                    orderId,
                    customerId,
                    reason,
                    notes,
                    totalAmount,
                    status: "pending",
                    items: {
                        create: items.map((item: any) => ({
                            productId: item.productId,
                            variantId: item.variantId,
                            quantity: item.quantity,
                            condition: item.condition,
                            refundAmount: item.refundAmount || 0,
                        }))
                    }
                },
                include: {
                    items: true
                }
            })

            // Stock deliberately does NOT move here. The goods are still at the
            // customer while this return sits `pending`; restocking on creation
            // made them immediately sellable again. Stock returns at the
            // `received` step - see `receiveReturn` in lib/returns.ts.
            return newReturn
        })

        return NextResponse.json({ success: true, data: result })
    } catch (error) {
        console.error("Error creating return:", error)
        return NextResponse.json(
            { success: false, error: "Failed to create return" },
            { status: 500 }
        )
    }
}
