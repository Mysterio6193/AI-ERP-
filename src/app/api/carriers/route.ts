import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { FORM_SOURCES, parseFormSchema, resolveCarrierForAddress } from "@/lib/freight"

/** Carriers, their service areas, and a routing tester. */

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const view = searchParams.get("view") || "carriers"

  try {
    if (view === "test") {
      // Lets someone check "who covers 2795?" without creating a booking.
      const match = await resolveCarrierForAddress({
        postcode: searchParams.get("postcode"),
        state: searchParams.get("state"),
        city: searchParams.get("city"),
        weightKg: Number(searchParams.get("weightKg")) || 0,
        companyId: await getActiveCompanyId(request),
      })

      return NextResponse.json({ success: true, data: match })
    }

    if (view === "bookings") {
      const bookings = await db.freightBooking.findMany({
        include: { carrier: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      })

      return NextResponse.json({ success: true, data: bookings })
    }

    const carriers = await db.carrier.findMany({
      include: { zones: { orderBy: { priority: "asc" } }, _count: { select: { bookings: true } } },
      orderBy: { name: "asc" },
    })

    return NextResponse.json({
      success: true,
      data: {
        carriers: carriers.map((carrier) => ({
          ...carrier,
          formFields: parseFormSchema(carrier.formSchemaJson),
          // Distinguishes "uses the default form" from "has its own", which the
          // editor needs in order not to silently freeze the default in place.
          hasCustomForm: Boolean(carrier.formSchemaJson),
        })),
        // The values a form field can be filled from.
        sources: FORM_SOURCES,
      },
    })
  } catch (error) {
    console.error("Failed to load carriers:", error)
    return NextResponse.json({ success: false, error: "Failed to load carriers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "createCarrier")

  try {
    if (action === "createCarrier") {
      const name = String(body.name || "").trim()
      if (!name) {
        return NextResponse.json({ success: false, error: "name is required" }, { status: 400 })
      }

      const carrier = await db.carrier.create({
        data: {
          name,
          tradingName: body.tradingName ? String(body.tradingName) : null,
          abn: body.abn ? String(body.abn) : null,
          contactName: body.contactName ? String(body.contactName) : null,
          email: body.email ? String(body.email) : null,
          phone: body.phone ? String(body.phone) : null,
          bookingMethod: ["email", "webform", "api"].includes(String(body.bookingMethod))
            ? String(body.bookingMethod)
            : "email",
          bookingEmail: body.bookingEmail ? String(body.bookingEmail) : null,
          portalUrl: body.portalUrl ? String(body.portalUrl) : null,
          cutoffTime: body.cutoffTime ? String(body.cutoffTime) : null,
          accountNumber: body.accountNumber ? String(body.accountNumber) : null,
          bodySubject: body.bodySubject ? String(body.bodySubject) : null,
          bodyTemplate: body.bodyTemplate ? String(body.bodyTemplate) : null,
          formSchemaJson: body.formFields ? JSON.stringify(body.formFields) : null,
          // Null company means shared across every entity in the group.
          companyId: body.companyId ? String(body.companyId) : null,
        },
      })

      return NextResponse.json({ success: true, data: carrier })
    }

    if (action === "updateCarrier") {
      const id = String(body.id || "")
      if (!id) {
        return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
      }

      const data: Record<string, unknown> = {}
      for (const field of [
        "name",
        "tradingName",
        "abn",
        "contactName",
        "email",
        "phone",
        "bookingEmail",
        "portalUrl",
        "cutoffTime",
        "accountNumber",
        "bodySubject",
        "bodyTemplate",
      ]) {
        if (body[field] !== undefined) data[field] = body[field] ? String(body[field]) : null
      }

      if (body.enabled !== undefined) data.enabled = Boolean(body.enabled)
      if (body.bookingMethod !== undefined && ["email", "webform", "api"].includes(String(body.bookingMethod))) {
        data.bookingMethod = String(body.bookingMethod)
      }
      if (body.formFields !== undefined) {
        data.formSchemaJson = body.formFields ? JSON.stringify(body.formFields) : null
      }

      const carrier = await db.carrier.update({ where: { id }, data })
      return NextResponse.json({ success: true, data: carrier })
    }

    if (action === "createZone") {
      const carrierId = String(body.carrierId || "")
      const matchValue = String(body.matchValue || "").trim()

      if (!carrierId || !matchValue) {
        return NextResponse.json(
          { success: false, error: "carrierId and matchValue are required" },
          { status: 400 }
        )
      }

      const matchType = ["postcode", "postcode_range", "state", "suburb"].includes(String(body.matchType))
        ? String(body.matchType)
        : "postcode"

      const zone = await db.carrierZone.create({
        data: {
          carrierId,
          name: String(body.name || matchValue),
          matchType,
          matchValue,
          priority: Number(body.priority) || 100,
          leadTimeDays: Number(body.leadTimeDays) || 1,
          baseRate: Number(body.baseRate) || 0,
          perKgRate: Number(body.perKgRate) || 0,
          minCharge: Number(body.minCharge) || 0,
        },
      })

      return NextResponse.json({ success: true, data: zone })
    }

    if (action === "deleteZone") {
      const id = String(body.zoneId || "")
      if (!id) {
        return NextResponse.json({ success: false, error: "zoneId is required" }, { status: 400 })
      }

      await db.carrierZone.delete({ where: { id } })
      return NextResponse.json({ success: true, data: { id } })
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}"` }, { status: 400 })
  } catch (error) {
    console.error(`Carrier action ${action} failed:`, error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 }
    )
  }
}
