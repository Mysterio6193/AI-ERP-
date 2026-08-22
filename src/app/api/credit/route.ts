import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const customerId = searchParams.get("customerId")

        if (customerId) {
            // Get credit details for a specific customer
            const customer = await db.customer.findUnique({
                where: { id: customerId },
                select: {
                    id: true, name: true, creditLimit: true, creditBalance: true,
                    creditStatus: true, creditRating: true, paymentTerms: true,
                },
            })

            const transactions = await db.creditTransaction.findMany({
                where: { customerId },
                orderBy: { createdAt: "desc" },
                take: 50,
            })

            return NextResponse.json({
                success: true,
                data: {
                    customer,
                    transactions,
                    available: customer ? customer.creditLimit - customer.creditBalance : 0,
                    utilization: customer && customer.creditLimit > 0
                        ? Math.round((customer.creditBalance / customer.creditLimit) * 100)
                        : 0,
                },
            })
        }

        // Get all customers with credit info
        const customers = await db.customer.findMany({
            where: { creditLimit: { gt: 0 } },
            select: {
                id: true, name: true, creditLimit: true, creditBalance: true,
                creditStatus: true, creditRating: true, paymentTerms: true,
                _count: { select: { creditTransactions: true } },
            },
            orderBy: { creditBalance: "desc" },
        })

        const summary = {
            totalCreditIssued: customers.reduce((s, c) => s + c.creditLimit, 0),
            totalOutstanding: customers.reduce((s, c) => s + c.creditBalance, 0),
            customersOnCredit: customers.length,
            customersOnHold: customers.filter(c => c.creditStatus === "on_hold").length,
        }

        return NextResponse.json({
            success: true,
            data: {
                customers,
                summary,
            },
        })
    } catch (error) {
        console.error("Credit API error:", error)
        return NextResponse.json({ success: false, error: "Failed to fetch credit data" }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { customerId, type, amount, description, notes, referenceType, referenceId } = body

        if (!customerId || !type || amount === undefined || !description) {
            return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
        }

        // Get current customer balance
        const customer = await db.customer.findUnique({
            where: { id: customerId },
            select: { creditBalance: true, creditLimit: true, creditStatus: true },
        })

        if (!customer) {
            return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
        }

        // Calculate new balance
        let balanceChange = 0
        switch (type) {
            case "credit_grant":
                // Increase credit limit, no balance change
                await db.customer.update({
                    where: { id: customerId },
                    data: { creditLimit: customer.creditLimit + amount },
                })
                balanceChange = 0
                break
            case "invoice_charge":
                balanceChange = amount // Increase outstanding
                break
            case "payment_received":
                balanceChange = -amount // Decrease outstanding
                break
            case "adjustment":
                balanceChange = amount // Can be positive or negative
                break
            case "refund":
                balanceChange = -amount // Decrease outstanding
                break
        }

        const newBalance = customer.creditBalance + balanceChange

        // Create transaction
        const transaction = await db.creditTransaction.create({
            data: {
                customerId, type,
                amount: balanceChange,
                balanceAfter: newBalance,
                description, notes,
                referenceType, referenceId,
            },
        })

        // Update customer balance
        if (balanceChange !== 0) {
            const updateData: Record<string, unknown> = { creditBalance: newBalance }

            // Auto-hold if exceeding credit limit
            if (newBalance > customer.creditLimit && customer.creditStatus === "active") {
                updateData.creditStatus = "on_hold"
            }
            // Auto-release if back within limit
            if (newBalance <= customer.creditLimit && customer.creditStatus === "on_hold") {
                updateData.creditStatus = "active"
            }

            await db.customer.update({
                where: { id: customerId },
                data: updateData,
            })
        }

        return NextResponse.json({ success: true, data: transaction }, { status: 201 })
    } catch (error) {
        console.error("Credit API error:", error)
        return NextResponse.json({ success: false, error: "Failed to process credit transaction" }, { status: 500 })
    }
}
