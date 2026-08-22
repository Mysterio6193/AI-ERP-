import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { normalizeEmail } from "@/lib/customer-auth"

// GET /api/customers - List all customers
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "accounts"])
    if (auth.response) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || ""

    const customers = await db.customer.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                  { abn: { contains: search, mode: "insensitive" } },
                ],
              }
            : {},
          status ? { status: status } : {},
        ],
      },
      include: {
        locations: true,
        priceList: true,
        _count: {
          select: { orders: true, invoices: true },
        },
      },
      orderBy: { name: "asc" },
    })

    // Calculate outstanding for each customer
    const customersWithOutstanding = await Promise.all(
      customers.map(async (customer) => {
        const invoices = await db.invoice.findMany({
          where: {
            customerId: customer.id,
            status: { in: ["unpaid", "partial", "overdue"] },
          },
        })
        const outstanding = invoices.reduce(
          (sum, inv) => sum + inv.outstandingAmt,
          0
        )
        return {
          ...customer,
          outstanding,
        }
      })
    )

    return NextResponse.json({ success: true, data: customersWithOutstanding })
  } catch (error) {
    console.error("Error fetching customers:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch customers" },
      { status: 500 }
    )
  }
}

// POST /api/customers - Create a new customer
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales"])
    if (auth.response) {
      return auth.response
    }

    const body = await request.json()
    const {
      name,
      tradingName,
      abn,
      acn,
      contactPerson,
      email,
      phone,
      alternatePhone,
      website,
      creditLimit,
      paymentTerms,
      creditStatus,
      creditRating,
      priceListId,
      customerType,
      industry,
      status,
      locations,
    } = body

    const customer = await db.customer.create({
      data: {
        name,
        tradingName,
        abn,
        acn,
        contactPerson,
        email: email ? normalizeEmail(email) : null,
        phone,
        alternatePhone,
        website,
        creditLimit: parseFloat(creditLimit) || 0,
        paymentTerms: parseInt(paymentTerms) || 30,
        creditStatus: creditStatus || "active",
        creditRating: creditRating || null,
        priceListId: priceListId || null,
        customerType: customerType || "wholesale",
        industry,
        status: status || "active",
        locations: locations
          ? {
              create: locations.map((loc: { 
                label: string; 
                address: string; 
                address2?: string;
                city: string; 
                state: string; 
                postcode: string;
                isBilling?: boolean;
                isShipping?: boolean;
                isDefault: boolean 
              }) => ({
                label: loc.label,
                address: loc.address,
                address2: loc.address2,
                city: loc.city,
                state: loc.state,
                postcode: loc.postcode,
                isBilling: loc.isBilling || false,
                isShipping: loc.isShipping || false,
                isDefault: loc.isDefault || false,
              })),
            }
          : undefined,
      },
      include: {
        locations: true,
        priceList: true,
      },
    })

    return NextResponse.json({ success: true, data: customer })
  } catch (error) {
    console.error("Error creating customer:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create customer" },
      { status: 500 }
    )
  }
}
