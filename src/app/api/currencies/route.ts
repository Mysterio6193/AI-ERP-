import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import {
  listCurrencies,
  priceInBase,
  rateForPricing,
  rateHistory,
  recordRate,
} from "@/lib/currency/service"

/** Currencies the business trades in, and what they are worth. */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts", "sales"])
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)
  const companyId = await getActiveCompanyId(request)

  try {
    if (searchParams.get("view") === "history") {
      const from = searchParams.get("from")
      const to = searchParams.get("to")

      if (!from || !to) {
        return NextResponse.json(
          { success: false, error: "from and to are required" },
          { status: 400 }
        )
      }

      return NextResponse.json({ success: true, data: await rateHistory(from, to, companyId) })
    }

    if (searchParams.get("view") === "quote") {
      const from = searchParams.get("from") || ""
      const to = searchParams.get("to") || ""
      const on = searchParams.get("on")

      const quote = await rateForPricing(from, to, {
        on: on ? new Date(on) : undefined,
        companyId,
      })

      if (!quote.ok) {
        // 422: the request is well formed, the data to answer it is not there.
        return NextResponse.json({ success: false, error: quote.error }, { status: 422 })
      }

      return NextResponse.json({ success: true, data: quote })
    }

    return NextResponse.json({ success: true, data: await listCurrencies(companyId) })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "accounts"])
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")
  const companyId = await getActiveCompanyId(request)

  try {
    if (action === "add-currency") {
      const code = String(body.code || "").trim().toUpperCase()

      if (!/^[A-Z]{3}$/.test(code)) {
        return NextResponse.json(
          { success: false, error: "A currency code is three letters, e.g. NZD" },
          { status: 400 }
        )
      }

      if (!String(body.name || "").trim()) {
        return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 })
      }

      const currency = await db.currency.upsert({
        where: { code },
        create: {
          code,
          name: String(body.name).trim(),
          symbol: body.symbol ? String(body.symbol) : null,
          decimals:
            body.decimals === null || body.decimals === undefined ? null : Number(body.decimals),
          isActive: body.isActive !== false,
        },
        update: {
          name: String(body.name).trim(),
          symbol: body.symbol ? String(body.symbol) : null,
          decimals:
            body.decimals === null || body.decimals === undefined ? null : Number(body.decimals),
          isActive: body.isActive !== false,
        },
      })

      return NextResponse.json({ success: true, data: currency })
    }

    if (action === "set-rate") {
      const result = await recordRate({
        from: String(body.from || ""),
        to: String(body.to || ""),
        rate: Number(body.rate),
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
        source: body.source ? String(body.source) : undefined,
        // A rate entered here belongs to the entity entering it unless it is
        // explicitly marked shared across the group.
        companyId: body.shared ? null : companyId,
      })

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true, data: result })
    }

    if (action === "price") {
      const result = await priceInBase(Number(body.amount), String(body.currency || ""), {
        on: body.on ? new Date(body.on) : undefined,
        companyId,
      })

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 422 })
      }

      return NextResponse.json({ success: true, data: result })
    }

    return NextResponse.json(
      {
        success: false,
        error: `Unknown action "${action}". Expected add-currency, set-rate or price.`,
      },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    )
  }
}
