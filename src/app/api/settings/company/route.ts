import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminUser } from "@/lib/admin-auth"
import { sanitizeCompanyBranding } from "@/lib/company-branding"
import { ROLE_SETS } from "@/lib/permissions"

import { getActiveCompany, getActiveCompanyId } from "@/lib/active-company"
import { validateCompany } from "@/lib/companies"

// GET is intentionally public (see middleware): the driver app reads branding
// before sign-in. Every mutating method below requires an admin.
export async function GET(request: NextRequest) {
    try {
        let company = await getActiveCompany(request)

        if (!company) {
            company = await db.company.findFirst({
                where: {
                    OR: [
                        { tradingName: { contains: "Supply", mode: "insensitive" } },
                        { name: { contains: "Supply", mode: "insensitive" } },
                        { name: { contains: "Fresh", mode: "insensitive" } },
                    ],
                },
            })
        }

        if (!company) {
            company = await db.company.findFirst()
        }

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

export async function PUT(request: NextRequest) {
    try {
        const auth = await requireAdminUser(request, ROLE_SETS.adminOnly)
        if (!auth.user) return auth.response

        const body = await request.json()

        /**
         * The entity being edited, not whichever row happens to be first.
         *
         * This used to resolve with db.company.findFirst(), so an admin acting
         * as the second entity saved their details onto the first one — RDM's
         * bank details landing on Fresh Distribution's invoices, and RDM itself
         * impossible to configure at all.
         *
         * An explicit id in the body wins, so the caller can name the entity;
         * otherwise it is the company the session is acting as.
         */
        const active = await getActiveCompany(request)
        const targetId = body.id ? String(body.id) : (active?.id ?? null)

        const existingCompany = targetId
            ? await db.company.findUnique({ where: { id: targetId } })
            : await db.company.findFirst()

        /**
         * Only what the caller actually sent.
         *
         * Every field used to be written on every save, defaulting to null when
         * absent — so a form that posted a subset silently wiped the ABN, the
         * bank details and the address off the record it hit.
         */
        const present = <T,>(key: string, coerce: (value: unknown) => T) =>
            key in body ? { [key]: coerce(body[key]) } : {}

        const text = (value: unknown) => (value ? String(value) : null)

        const data = existingCompany
            ? {
                  ...present("name", (v) => String(v || "Your Company")),
                  ...present("tradingName", text),
                  ...present("country", (v) => String(v || "AU")),
                  ...present("abn", text),
                  ...present("acn", text),
                  ...present("gstin", text),
                  ...present("pan", text),
                  ...present("tanNumber", text),
                  ...present("cinNumber", text),
                  ...present("phone", text),
                  ...present("email", text),
                  ...present("website", text),
                  ...present("logoUrl", text),
                  ...present("address", text),
                  ...present("city", text),
                  ...present("state", text),
                  ...present("postcode", text),
                  ...present("bankName", text),
                  ...present("bsb", text),
                  ...present("accountNumber", text),
                  ...present("accountName", text),
                  ...present("ifscCode", text),
                  ...present("upiId", text),
                  ...present("gstRegistered", (v) => Boolean(v)),
                  ...present("gstRate", (v) => (typeof v === "number" ? v : 10)),
                  ...present("abnOnInvoices", (v) => Boolean(v)),
                  ...present("fiscalYearStart", (v) => (typeof v === "number" ? v : 7)),
                  ...present("defaultTerms", text),
                  ...present("invoiceFooter", text),
                  ...present("baseCurrency", (v) => String(v || "AUD")),
                  ...present("setupComplete", (v) => Boolean(v)),
                  ...present("onboardingStep", (v) => (typeof v === "number" ? v : 0)),
              }
            : {
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

        /**
         * Refuse invented payment details rather than warning about them.
         *
         * This is the last gate before an ABN and a bank account become what a
         * customer reads on an invoice. Every company in this system was
         * carrying a fabricated pair — 012-345 / 55667788 is a sequential BSB
         * with a repeating-pair account — and an invoice built on those asks a
         * real customer to send real money to an account that either bounces or
         * belongs to somebody else. Neither failure is noticed here; both are
         * noticed by the customer.
         */
        const merged = { ...(existingCompany ?? {}), ...data } as Record<string, unknown>
        const verdict = validateCompany(merged)

        if (!verdict.ok) {
            return NextResponse.json(
                { success: false, error: verdict.error, field: verdict.field },
                { status: 400 }
            )
        }

        const company = existingCompany
            ? await db.company.update({
                where: { id: existingCompany.id },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data: data as any,
            })
            : await db.company.create({
                // First-run creation still needs every field, defaults included.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data: data as any,
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
