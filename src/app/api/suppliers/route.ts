import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/suppliers - List all suppliers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || ""

    const suppliers = await db.supplier.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { name: { contains: search } },
                  { tradingName: { contains: search } },
                  { abn: { contains: search } },
                  { email: { contains: search } },
                ],
              }
            : {},
          status ? { status: status } : {},
        ],
      },
      include: {
        products: {
          select: { productId: true }
        },
        _count: {
          select: { purchaseOrders: true },
        },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json({ success: true, data: suppliers })
  } catch (error) {
    console.error("Error fetching suppliers:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch suppliers" },
      { status: 500 }
    )
  }
}

// POST /api/suppliers - Create a new supplier
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      tradingName,
      abn,
      contactPerson,
      email,
      phone,
      website,
      address,
      city,
      state,
      postcode,
      paymentTerms,
      creditLimit,
      status,
    } = body

    // Format ABN (remove spaces)
    const formattedAbn = abn?.replace(/\s/g, "") || null

    const supplier = await db.supplier.create({
      data: {
        name,
        tradingName,
        abn: formattedAbn,
        contactPerson,
        email,
        phone,
        website,
        address,
        city,
        state,
        postcode,
        paymentTerms: parseInt(paymentTerms) || 30,
        creditLimit: parseFloat(creditLimit) || 0,
        status: status || "active",
      },
    })

    return NextResponse.json({ success: true, data: supplier })
  } catch (error) {
    console.error("Error creating supplier:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create supplier" },
      { status: 500 }
    )
  }
}
