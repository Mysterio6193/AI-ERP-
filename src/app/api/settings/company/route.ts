import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sanitizeCompanyBranding } from "@/lib/company-branding"

export async function GET() {
    try {
        const company = await db.company.findFirst()

        if (!company) {
            return NextResponse.json(
                { success: false, error: "Company settings not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({ success: true, data: sanitizeCompanyBranding(company) })
    } catch (error) {
        console.error("Error fetching company settings:", error)
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        )
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json()
        const existingCompany = await db.company.findFirst()

        const data = {
            name: body.name || "Your Company",
            tradingName: body.tradingName || null,
            country: body.country || "AU",
            abn: body.abn || null,
            acn: body.acn || null,
            gstin: body.gstin || null,
            pan: body.pan || null,
            tanNumber: body.tanNumber || null,
            cinNumber: body.cinNumber || null,
            phone: body.phone || null,
            email: body.email || null,
            website: body.website || null,
            logoUrl: body.logoUrl || null,
            address: body.address || null,
            city: body.city || null,
            state: body.state || null,
            postcode: body.postcode || null,
            bankName: body.bankName || null,
            bsb: body.bsb || null,
            accountNumber: body.accountNumber || null,
            accountName: body.accountName || null,
            ifscCode: body.ifscCode || null,
            upiId: body.upiId || null,
            gstRegistered: body.gstRegistered ?? true,
            gstRate: typeof body.gstRate === "number" ? body.gstRate : 10,
            abnOnInvoices: body.abnOnInvoices ?? true,
            fiscalYearStart: typeof body.fiscalYearStart === "number" ? body.fiscalYearStart : 7,
            defaultTerms: body.defaultTerms || null,
            invoiceFooter: body.invoiceFooter || null,
            baseCurrency: body.baseCurrency || "AUD",
            setupComplete: body.setupComplete ?? true,
            onboardingStep: typeof body.onboardingStep === "number" ? body.onboardingStep : 0,
        }

        const company = existingCompany
            ? await db.company.update({
                where: { id: existingCompany.id },
                data,
            })
            : await db.company.create({
                data,
            })

        return NextResponse.json({ success: true, data: company })
    } catch (error) {
        console.error("Error updating company settings:", error)
        return NextResponse.json(
            { success: false, error: "Failed to update company settings" },
            { status: 500 }
        )
    }
}
