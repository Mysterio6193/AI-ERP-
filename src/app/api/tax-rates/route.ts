import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ensureDefaultTaxRates } from "@/lib/tax-rates"

/**
 * Named tax rates.
 *
 * TaxRate was modelled with everything a real rate needs and nothing ever
 * created one, so `Product.gstRate` — a bare float — was the only way tax was
 * expressed. "Which products are GST free" could only be answered by scanning
 * for zeros.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const companyId = await getActiveCompanyId(request)

  if (companyId) {
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { country: true },
    })

    // The standard rates for the country appear on first read rather than
    // needing a seeding step nobody would run.
    await ensureDefaultTaxRates(db, companyId, company?.country)
  }

  const rates = await db.taxRate.findMany({
    where: companyId ? { companyId } : {},
    orderBy: [{ country: "asc" }, { rate: "desc" }],
    include: { _count: { select: { products: true } } },
  })

  return NextResponse.json({
    success: true,
    data: rates,
    summary: {
      count: rates.length,
      inUse: rates.filter((r) => r._count.products > 0).length,
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({}))
  const companyId = await getActiveCompanyId(request)

  const name = String(body.name || "").trim()
  const code = String(body.code || "").trim().toUpperCase()
  const rate = Number(body.rate)
  const country = String(body.country || "AU").toUpperCase()

  if (!name || !code) {
    return NextResponse.json(
      { success: false, error: "A rate needs a name and a code." },
      { status: 400 }
    )
  }

  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return NextResponse.json(
      { success: false, error: "Rate must be between 0 and 100." },
      { status: 400 }
    )
  }

  const clash = await db.taxRate.findFirst({
    where: { code, companyId: companyId ?? null },
    select: { id: true },
  })

  if (clash) {
    // Codes are how a rate is referenced in exports and filings, so two rates
    // sharing one is never right.
    return NextResponse.json(
      { success: false, error: `A rate with code ${code} already exists.` },
      { status: 409 }
    )
  }

  if (body.isDefault) {
    await db.taxRate.updateMany({
      where: { isDefault: true, companyId: companyId ?? null, country },
      data: { isDefault: false },
    })
  }

  const created = await db.taxRate.create({
    data: {
      name,
      code,
      country,
      rate,
      taxType: String(body.taxType || (rate === 0 ? "exempt" : "gst")),
      hsnFrom: body.hsnFrom ? String(body.hsnFrom) : null,
      hsnTo: body.hsnTo ? String(body.hsnTo) : null,
      isDefault: Boolean(body.isDefault),
      status: body.status === "archived" ? "archived" : "active",
      companyId: companyId ?? null,
    },
  })

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}
